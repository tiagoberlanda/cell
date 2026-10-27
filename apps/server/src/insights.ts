import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool,query,one,event } from './db.js';
import { config,routerRequest } from './router.js';
import { proxyTrust,safeError } from './security.js';
import { readFileSync } from 'node:fs';
const { version } = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));
const uuid = z.string().uuid();
const active = ['queued','running','waiting_approval','waiting_agent'];
// A running run whose heartbeat is older than this is reported as stalled.
const STALL_SECONDS = 120;
const stateFilters: Record<string,string[]> = { active, running:['running'], queued:['queued'], waiting_approval:['waiting_approval'], waiting_agent:['waiting_agent'], failed:['failed'], completed:['completed'], cancelled:['cancelled'] };
const origin = (url:string) => { try { return new URL(url).origin; } catch { return 'inválido'; } };
const timed = async <T,>(fn:()=>Promise<T>) => { const t = Date.now(); const value = await fn(); return { value, ms: Date.now() - t }; };

// Activity center, run details, diagnostics and memory history. All routes sit behind the session/CSRF hook in api.ts.
export function registerInsights(app:FastifyInstance){
 app.get('/api/activity',async req=>{
  const q=z.object({state:z.string().default('all'),agentId:uuid.optional().or(z.literal('')),before:z.string().optional(),limit:z.coerce.number().int().min(1).max(100).default(30)}).parse(req.query);
  const states=stateFilters[q.state]||null;let cursor:[string,string]|null=null;
  if(q.before){const [at,cid]=q.before.split('|');if(!at||!uuid.safeParse(cid).success||Number.isNaN(Date.parse(at)))throw new Error('Cursor inválido.');cursor=[at,cid];}
  const rows=await query(`SELECT r.id,r.agent_id,a.name AS agent_name,a.color,a.shape,r.conversation_id,c.title AS conversation_title,r.parent_id,r.state,r.mode,r.model,r.steps,r.error,r.usage,r.depth,r.created_at,r.started_at,r.finished_at,r.heartbeat_at,
   (r.state='running' AND COALESCE(r.heartbeat_at,r.started_at,r.updated_at)<now()-make_interval(secs=>$5)) AS stalled,
   (SELECT count(*)::int FROM tool_calls t WHERE t.run_id=r.id) AS tool_count,
   (SELECT count(*)::int FROM approvals ap JOIN tool_calls t ON t.id=ap.call_id WHERE t.run_id=r.id AND ap.status='pending') AS pending_approvals,
   left(COALESCE(r.output,r.partial_output,''),180) AS preview
   FROM runs r JOIN agents a ON a.id=r.agent_id JOIN conversations c ON c.id=r.conversation_id
   WHERE ($1::text[] IS NULL OR r.state=ANY($1)) AND ($2='' OR r.agent_id::text=$2) AND ($3::timestamptz IS NULL OR (r.created_at,r.id)<($3::timestamptz,$4::uuid))
   ORDER BY r.created_at DESC,r.id DESC LIMIT $6`,[states,q.agentId||'',cursor?.[0]||null,cursor?.[1]||null,STALL_SECONDS,q.limit+1]);
  const more=rows.length>q.limit,items=rows.slice(0,q.limit),last=items.at(-1);
  return {items,next:more&&last?`${new Date(last.created_at).toISOString()}|${last.id}`:null};
 });
 app.get('/api/activity/summary',async()=>{
  const counts=Object.fromEntries((await query('SELECT state,count(*)::int AS n FROM runs WHERE state=ANY($1) GROUP BY state',[active])).map(r=>[r.state,r.n]));
  const failed=(await one("SELECT count(*)::int AS n FROM runs WHERE state='failed' AND created_at>now()-interval '24 hours'")).n;
  const stalled=(await one("SELECT count(*)::int AS n FROM runs WHERE state='running' AND COALESCE(heartbeat_at,started_at,updated_at)<now()-make_interval(secs=>$1)",[STALL_SECONDS])).n;
  const approvals=(await one("SELECT count(*)::int AS n FROM approvals WHERE status='pending'")).n;
  return {running:counts.running||0,queued:counts.queued||0,waiting_approval:counts.waiting_approval||0,waiting_agent:counts.waiting_agent||0,approvals,failed24h:failed,stalled};
 });
 app.get('/api/runs/:id',async(req,reply)=>{
  const id=uuid.parse((req.params as any).id);
  const run=await one(`SELECT r.id,r.agent_id,r.conversation_id,r.parent_id,r.state,r.mode,r.model,r.steps,r.error,r.output,r.usage,r.depth,r.documents,r.created_at,r.started_at,r.finished_at,r.heartbeat_at,r.updated_at,r.input_message_id,
   a.name AS agent_name,a.color,a.shape,c.title AS conversation_title,
   (r.state='running' AND COALESCE(r.heartbeat_at,r.started_at,r.updated_at)<now()-make_interval(secs=>$2)) AS stalled
   FROM runs r JOIN agents a ON a.id=r.agent_id JOIN conversations c ON c.id=r.conversation_id WHERE r.id=$1`,[id,STALL_SECONDS]);
  if(!run)return reply.code(404).send({error:'Execução não encontrada.'});
  const input=run.input_message_id?await one('SELECT content,files FROM messages WHERE id=$1',[run.input_message_id]):null;
  const calls=await query(`SELECT t.id,t.tool,t.args,t.status,t.external_write,t.target,left(t.result,2000) AS result,t.created_at,ap.id AS approval_id,ap.status AS approval_status
   FROM tool_calls t LEFT JOIN approvals ap ON ap.call_id=t.id WHERE t.run_id=$1 ORDER BY t.created_at,t.id`,[id]);
  const produced=calls.filter(c=>['generate_image','write_file'].includes(c.tool)&&c.status==='done').map(c=>{try{const r=JSON.parse(c.result);return r.fileId||r.id;}catch{return null;}}).filter(Boolean);
  const files=await query('SELECT id,name,mime,size FROM files WHERE id::text=ANY($1)',[[...produced,...(input?.files||[])]]);
  // Whole delegation tree: climb to the root, then list every descendant.
  const tree=await query(`WITH RECURSIVE up AS(SELECT id,parent_id FROM runs WHERE id=$1 UNION ALL SELECT r.id,r.parent_id FROM runs r JOIN up ON r.id=up.parent_id),
   root AS(SELECT id FROM up WHERE parent_id IS NULL LIMIT 1),
   down AS(SELECT id,parent_id,0 AS level FROM runs WHERE id=(SELECT id FROM root) UNION ALL SELECT r.id,r.parent_id,down.level+1 FROM runs r JOIN down ON r.parent_id=down.id WHERE down.level<10)
   SELECT d.id,d.parent_id,d.level,r.state,r.created_at,a.name AS agent_name,a.color,a.shape FROM down d JOIN runs r ON r.id=d.id JOIN agents a ON a.id=r.agent_id ORDER BY d.level,r.created_at`,[id]);
  return {run:{...run,input:input?String(input.content).slice(0,4000):null},calls,files,tree};
 });
 app.get('/api/diagnostics',async()=>{
  const check=async(fn:()=>Promise<any>)=>{try{return {ok:true,...await fn()};}catch(e){return {ok:false,error:safeError(e)};}};
  const database=await check(async()=>{const {ms}=await timed(()=>query('SELECT 1'));const v=await one('SHOW server_version');const size=await one('SELECT pg_database_size(current_database())::bigint AS bytes');const m=await query('SELECT name FROM migrations ORDER BY name');return {latencyMs:ms,version:v.server_version,bytes:Number(size.bytes),migrations:m.length,lastMigration:m.at(-1)?.name,pool:{total:pool.totalCount,idle:pool.idleCount,waiting:pool.waitingCount}};});
  const worker=await check(async()=>{const w=await one("SELECT heartbeat_at,EXTRACT(EPOCH FROM now()-heartbeat_at)::int AS age FROM worker_health WHERE id='primary'");if(!w)throw new Error('O worker ainda não registrou sinal de vida.');if(w.age>60)throw new Error(`Sem sinal do worker há ${w.age} s.`);return {heartbeatAt:w.heartbeat_at,ageSeconds:w.age};});
  const queue=await check(async()=>({jobs:Object.fromEntries((await query("SELECT state,count(*)::int AS n FROM pgboss.job WHERE name='run' GROUP BY state")).map(r=>[r.state,r.n]))}));
  const runs=await check(async()=>({byState:Object.fromEntries((await query('SELECT state,count(*)::int AS n FROM runs GROUP BY state')).map(r=>[r.state,r.n])),stalled:await query("SELECT r.id,a.name AS agent_name,COALESCE(r.heartbeat_at,r.started_at) AS last_signal FROM runs r JOIN agents a ON a.id=r.agent_id WHERE r.state='running' AND COALESCE(r.heartbeat_at,r.started_at,r.updated_at)<now()-make_interval(secs=>$1) ORDER BY r.created_at LIMIT 20",[STALL_SECONDS])}));
  const router=await check(async()=>{const c=await config();const {value,ms}=await timed(async()=>(await (await routerRequest(c,'/models')).json() as any).data||[]);return {origin:origin(c.baseUrl),hasToken:!!c.token,defaultModel:c.defaultModel,latencyMs:ms,models:value.length};});
  const mcp=await check(async()=>({connections:(await query('SELECT id,name,url,status,jsonb_array_length(tools) AS tools,(auth IS NOT NULL) AS has_auth FROM connections ORDER BY name')).map(c=>({...c,url:origin(c.url)}))}));
  const t=proxyTrust();
  return {version,checkedAt:new Date().toISOString(),apiUptimeSeconds:Math.round(process.uptime()),database,worker,queue,runs,router,mcp,proxy:{mode:t.mode,proxies:t.mode==='secret'?[]:t.proxies}};
 });
 // Memories and summaries: current text plus revision history with its source.
 const revisions=(column:'agent_id'|'conversation_id',kind:string,id:string)=>query(`SELECT id,body,source,source_run_id,created_at FROM memory_revisions WHERE ${column}=$1 AND kind=$2 ORDER BY created_at DESC LIMIT 50`,[id,kind]);
 app.get('/api/agents/:id/memory',async req=>{const id=uuid.parse((req.params as any).id);const a=await one('SELECT memory FROM agents WHERE id=$1',[id]);if(!a)throw new Error('Agente não encontrado.');return {memory:a.memory,revisions:await revisions('agent_id','memory',id)};});
 app.put('/api/agents/:id/memory',async req=>{const id=uuid.parse((req.params as any).id);const {memory}=z.object({memory:z.string().max(20000)}).parse(req.body);
  const a=await one('UPDATE agents SET memory=$2 WHERE id=$1 RETURNING id',[id,memory]);if(!a)throw new Error('Agente não encontrado.');
  await query("INSERT INTO memory_revisions(agent_id,kind,body,source) VALUES($1,'memory',$2,'Editada pelo usuário')",[id,memory]);await event('agent',{id});return {ok:true};});
 app.get('/api/conversations/:id/summary',async req=>{const id=uuid.parse((req.params as any).id);const c=await one('SELECT summary,summary_through FROM conversations WHERE id=$1',[id]);if(!c)throw new Error('Conversa não encontrada.');return {...c,revisions:await revisions('conversation_id','summary',id)};});
 app.put('/api/conversations/:id/summary',async req=>{const id=uuid.parse((req.params as any).id);const {summary}=z.object({summary:z.string().max(30000)}).parse(req.body);
  const c=await one('UPDATE conversations SET summary=$2,summary_through=now() WHERE id=$1 RETURNING id',[id,summary]);if(!c)throw new Error('Conversa não encontrada.');
  await query("INSERT INTO memory_revisions(conversation_id,kind,body,source) VALUES($1,'summary',$2,'Editado pelo usuário')",[id,summary]);return {ok:true};});
}
