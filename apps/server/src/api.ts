import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { z,ZodError } from 'zod';
import { agentInput,messageInput,settingsInput,skillInput,routineInput } from '../../../packages/shared/src/index.js';
import { pool,one,query,event,transaction } from './db.js';
import { key,hash,safeEqual,encrypt,decrypt,validateEndpoint,safeError } from './security.js';
import { publicConfig,saveConfig,models,probeModel,config,routerRequest } from './router.js';
import { migrate } from './migrate.js';
import { startQueue,boss,createRun,cancelRun,enqueue } from './runtime.js';
import { storage,saveFile,fileData,deleteFile } from './files.js';
import { contained,allowedOrigin } from './security.js';
import { discover,finishOAuth } from './mcp.js';
import { nativeToolNames } from './tools.js';
import { nextOccurrence } from './schedule.js';
export async function buildApp(){
 key();const app=Fastify({logger:{level:'info',redact:['req.headers.authorization','req.headers.cookie','res.headers.set-cookie']},bodyLimit:1024*1024});
 await app.register(cookie);await app.register(multipart,{limits:{fileSize:25*1024*1024,files:1}});await app.register(rateLimit,{max:300,timeWindow:'1 minute'});
 const id=(req:any)=>z.string().uuid().parse(req.params.id);
 app.setErrorHandler((err:any,req,reply)=>{const status=err instanceof ZodError?400:err.statusCode||400;reply.code(status>=500?500:status).send({error:err instanceof ZodError?'Dados inválidos: '+err.issues.map((x:any)=>x.path.join('.')+': '+x.message).join('; '):err.code?.startsWith('23')?'Operação incompatível com os dados existentes.':safeError(err)});});
 app.addHook('onRequest',async(req,reply)=>{
  reply.header('X-Content-Type-Options','nosniff').header('Referrer-Policy','same-origin').header('Cache-Control','no-store');
  if(req.url==='/api/health'||req.url==='/api/login')return;
  const token=req.cookies.cell_session;if(!token)return reply.code(401).send({error:'Faça login.'});
  const session=await one('SELECT s.*,u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=$1 AND expires_at>now()',[hash(token)]);if(!session)return reply.code(401).send({error:'Sessão expirada.'});(req as any).session=session;
  if(!['GET','HEAD','OPTIONS'].includes(req.method)){
   if(!safeEqual(String(req.headers['x-csrf-token']||''),session.csrf))return reply.code(403).send({error:'Validação CSRF inválida.'});
   if(req.headers.origin&&!allowedOrigin(req.headers.origin))return reply.code(403).send({error:'Origem não permitida.'});
  }
 });
 app.get('/api/health',async()=>{await query('SELECT 1');return {ok:true};});
 app.post('/api/login',{config:{rateLimit:{max:8,timeWindow:'1 minute'}}},async(req,reply)=>{
  if(req.headers.origin&&!allowedOrigin(req.headers.origin))return reply.code(403).send({error:'Origem não permitida.'});
  const input=z.object({username:z.string().max(100),password:z.string().max(1000)}).parse(req.body),u=await one('SELECT * FROM users WHERE username=$1',[input.username]);
  if(!u||!await argon2.verify(u.password_hash,input.password))return reply.code(401).send({error:'Usuário ou senha inválidos.'});
  const token=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');await query("INSERT INTO sessions(id,user_id,csrf,expires_at) VALUES($1,$2,$3,now()+interval '30 days')",[hash(token),u.id,csrf]);reply.setCookie('cell_session',token,{httpOnly:true,secure:process.env.COOKIE_SECURE!=='false',sameSite:'lax',path:'/',maxAge:30*86400});return {username:u.username,csrf};
 });
 app.get('/api/me',async req=>({username:(req as any).session.username,csrf:(req as any).session.csrf}));
 app.post('/api/logout',async(req,reply)=>{await query('DELETE FROM sessions WHERE id=$1',[(req as any).session.id]);reply.clearCookie('cell_session',{path:'/'});return {ok:true};});
 app.post('/api/account/password',async req=>{const input=z.object({current:z.string(),password:z.string().min(12).max(200)}).parse(req.body),u=await one('SELECT * FROM users WHERE id=$1',[(req as any).session.user_id]);if(!await argon2.verify(u.password_hash,input.current))throw new Error('Senha atual incorreta.');await query('UPDATE users SET password_hash=$1 WHERE id=$2',[await argon2.hash(input.password),u.id]);await query('DELETE FROM sessions WHERE user_id=$1 AND id<>$2',[u.id,(req as any).session.id]);return {ok:true};});
 app.get('/api/settings',publicConfig);
 app.put('/api/settings',async req=>{const input=settingsInput.parse(req.body);new Intl.DateTimeFormat('pt-BR',{timeZone:input.timezone});await saveConfig(input);return publicConfig();});
 app.post('/api/settings/reset',async()=>{await query('DELETE FROM settings');return publicConfig();});
 app.get('/api/models',async()=>({models:await models(),capabilities:await query('SELECT * FROM model_capabilities')}));
 app.post('/api/models/probe',async req=>probeModel(z.object({model:z.string().min(1)}).parse(req.body).model));
 app.post('/api/models/vision',async req=>{const {model}=z.object({model:z.string().min(1)}).parse(req.body);const c=await config();const r=await(await routerRequest(c,'/chat/completions',{model,stream:false,max_tokens:60,messages:[{role:'user',content:[{type:'text',text:'Descreva brevemente a imagem.'},{type:'image_url',image_url:{url:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='}}]}]})).json() as any;if(!r.choices?.[0]?.message?.content)throw new Error('Sem resposta de visão.');await query('INSERT INTO model_capabilities(id,vision,verified_at) VALUES($1,true,now()) ON CONFLICT(id) DO UPDATE SET vision=true,verified_at=now()',[model]);return {vision:true,description:r.choices[0].message.content};});
 app.get('/api/agents',async()=>query(`SELECT a.*,(SELECT state FROM runs WHERE agent_id=a.id ORDER BY CASE WHEN state IN('running','waiting_approval','waiting_agent','queued') THEN 0 ELSE 1 END,created_at DESC LIMIT 1) AS state,(SELECT m.content FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.agent_id=a.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,EXISTS(SELECT 1 FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.agent_id=a.id AND m.role='assistant' AND m.created_at>c.seen_at) AS unread FROM agents a ORDER BY pinned DESC,created_at`));
 const agentColumns=['name','role','description','instructions','color','shape','model','pinned','section','memory','tools','skills'];
 const values=(data:any)=>agentColumns.map(k=>['tools','skills'].includes(k)?JSON.stringify(data[k]):data[k]);
 app.post('/api/agents',async req=>{const d=agentInput.parse(req.body);const a=await one(`INSERT INTO agents(${agentColumns.join(',')}) VALUES(${agentColumns.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`,values(d));await event('agent',{id:a.id});return a;});
 app.put('/api/agents/:id',async req=>{const d=agentInput.parse(req.body);const a=await one(`UPDATE agents SET ${agentColumns.map((k,i)=>`${k}=$${i+2}`).join(',')} WHERE id=$1 RETURNING *`,[id(req),...values(d)]);await event('agent',{id:id(req)});return a;});
 app.post('/api/agents/:id/archive',async req=>{const {archived}=z.object({archived:z.boolean()}).parse(req.body);await query('UPDATE agents SET archived=$2 WHERE id=$1',[id(req),archived]);return {ok:true};});
 app.delete('/api/agents/:id',async req=>{if(await one("SELECT id FROM runs WHERE agent_id=$1 AND state IN('running','queued','waiting_agent','waiting_approval')",[id(req)]))throw new Error('Cancele as execuções antes de excluir o agente.');await query('DELETE FROM agents WHERE id=$1',[id(req)]);return {ok:true};});
 app.get('/api/agents/:id/conversations',async req=>query('SELECT * FROM conversations WHERE agent_id=$1 ORDER BY created_at DESC',[id(req)]));
 app.post('/api/agents/:id/conversations',async req=>one('INSERT INTO conversations(agent_id,title) VALUES($1,$2) RETURNING *',[id(req),z.object({title:z.string().max(120).default('Nova conversa')}).parse(req.body||{}).title]));
 app.get('/api/conversations/:id',async req=>{await query('UPDATE conversations SET seen_at=now() WHERE id=$1',[id(req)]);return {conversation:await one('SELECT * FROM conversations WHERE id=$1',[id(req)]),messages:await query('SELECT * FROM messages WHERE conversation_id=$1 ORDER BY created_at,id',[id(req)]),runs:await query('SELECT id,agent_id,conversation_id,parent_id,state,model,steps,error,output,partial_output,usage,created_at,updated_at FROM runs WHERE conversation_id=$1 ORDER BY created_at',[id(req)]),calls:await query('SELECT t.*,a.id AS approval_id,a.status AS approval_status FROM tool_calls t JOIN runs r ON r.id=t.run_id LEFT JOIN approvals a ON a.call_id=t.id WHERE r.conversation_id=$1 ORDER BY t.created_at',[id(req)])};});
 app.post('/api/conversations/:id/messages',async req=>{const input=messageInput.parse(req.body);const cv=await one('SELECT * FROM conversations WHERE id=$1',[id(req)]);if(!cv)throw new Error('Conversa não encontrada.');const r=await createRun(cv.agent_id,cv.id,input.content,input.files);if(cv.title==='Nova conversa')await query('UPDATE conversations SET title=$2 WHERE id=$1',[cv.id,input.content.slice(0,60)]);return {id:r.id,state:r.state};});
 app.post('/api/runs/:id/cancel',async req=>{await cancelRun(id(req));return {ok:true};});
 app.post('/api/approvals/:id',async req=>{const {decision}=z.object({decision:z.enum(['approved','denied'])}).parse(req.body);const runId=await transaction(async c=>{const a=(await c.query('SELECT a.*,t.run_id,r.state FROM approvals a JOIN tool_calls t ON t.id=a.call_id JOIN runs r ON r.id=t.run_id WHERE a.id=$1 FOR UPDATE OF a,r',[id(req)])).rows[0];if(!a||a.status!=='pending'||a.state!=='waiting_approval')throw new Error('Aprovação não está mais pendente.');await c.query('UPDATE approvals SET status=$2 WHERE id=$1',[a.id,decision]);return a.run_id;});await enqueue(runId);return {ok:true};});
 app.get('/api/search',async req=>{const {q}=z.object({q:z.string().min(2).max(200)}).parse(req.query);return query("SELECT m.*,a.name AS agent_name,a.id AS agent_id FROM messages m JOIN conversations c ON c.id=m.conversation_id JOIN agents a ON a.id=c.agent_id WHERE to_tsvector('portuguese',m.content) @@ plainto_tsquery('portuguese',$1) ORDER BY m.created_at DESC LIMIT 50",[q]);});
 app.get('/api/skills',async()=>query('SELECT * FROM skills ORDER BY name'));
 app.post('/api/skills',async req=>{const d=skillInput.parse(req.body);return one('INSERT INTO skills(name,body) VALUES($1,$2) RETURNING *',[d.name,d.body]);});
 app.put('/api/skills/:id',async req=>{const d=skillInput.parse(req.body);return one('UPDATE skills SET name=$2,body=$3 WHERE id=$1 RETURNING *',[id(req),d.name,d.body]);});
 app.delete('/api/skills/:id',async req=>{await query('DELETE FROM skills WHERE id=$1',[id(req)]);return {ok:true};});
 app.post('/api/conversations/:id/teach',async req=>{const cv=await one('SELECT * FROM conversations WHERE id=$1',[id(req)]);if(!cv)throw new Error('Conversa não encontrada.');if(!await one("SELECT id FROM runs WHERE conversation_id=$1 AND state='completed'",[cv.id]))throw new Error('Conclua uma tarefa antes de criar a proposta.');const msgs=await query('SELECT role,content FROM messages WHERE conversation_id=$1 ORDER BY created_at DESC LIMIT 20',[cv.id]);return {name:`Procedimento: ${cv.title}`,body:`# ${cv.title}\n\n## Objetivo\n${msgs.filter(m=>m.role==='user').at(-1)?.content||''}\n\n## Procedimento proposto — revisar antes de salvar\n${msgs.filter(m=>m.role==='assistant')[0]?.content||''}\n\n## Validação\n- Conferir fontes e resultado.\n- Revisar parâmetros antes de agir.\n\n## Aprovações\nAções externas de escrita exigem aprovação do usuário.`};});
 app.get('/api/files',async()=>query('SELECT id,agent_id,name,mime,size,warning,created_at FROM files ORDER BY created_at DESC'));
 app.post('/api/files',async req=>{const f=await req.file();if(!f)throw new Error('Arquivo ausente.');const data=await f.toBuffer();if(f.file.truncated)throw new Error('Arquivo excede 25 MB.');return saveFile(f.filename,data);});
 app.get('/api/files/:id',async(req,reply)=>{const f=await one('SELECT * FROM files WHERE id=$1',[id(req)]);if(!f)return reply.code(404).send({error:'Arquivo não encontrado.'});return reply.header('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`).type(f.mime).send(createReadStream(contained(storage,f.storage_name)));});
 app.delete('/api/files/:id',async req=>{await deleteFile(id(req));return {ok:true};});
 app.get('/api/routines',async()=>query('SELECT r.*,a.name AS agent_name FROM routines r JOIN agents a ON a.id=r.agent_id ORDER BY r.created_at DESC'));
 app.post('/api/routines',async req=>{const d=routineInput.parse(req.body);const next=nextOccurrence(d.kind,d.schedule,d.timezone);if(d.enabled&&!next)throw new Error('Escolha uma data futura.');return one('INSERT INTO routines(agent_id,name,prompt,kind,schedule,timezone,enabled,next_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[d.agentId,d.name,d.prompt,d.kind,d.schedule,d.timezone,d.enabled,next]);});
 app.put('/api/routines/:id',async req=>{const d=routineInput.parse(req.body);const next=nextOccurrence(d.kind,d.schedule,d.timezone);if(d.enabled&&!next)throw new Error('Escolha uma data futura.');return one('UPDATE routines SET agent_id=$2,name=$3,prompt=$4,kind=$5,schedule=$6,timezone=$7,enabled=$8,next_at=$9 WHERE id=$1 RETURNING *',[id(req),d.agentId,d.name,d.prompt,d.kind,d.schedule,d.timezone,d.enabled,next]);});
 app.delete('/api/routines/:id',async req=>{await query('DELETE FROM routines WHERE id=$1',[id(req)]);return {ok:true};});
 app.post('/api/routines/:id/run',async req=>{const r=await one('SELECT * FROM routines WHERE id=$1',[id(req)]);if(!r)throw new Error('Rotina não encontrada.');const cv=await one('INSERT INTO conversations(agent_id,title) VALUES($1,$2) RETURNING id',[r.agent_id,`Rotina: ${r.name}`]);const run=await createRun(r.agent_id,cv.id,r.prompt);await query("INSERT INTO routine_history(routine_id,run_id,status,scheduled_at) VALUES($1,$2,'manual',now())",[r.id,run.id]);return {id:run.id};});
 app.get('/api/routines/:id/history',async req=>query('SELECT h.*,r.state,r.error FROM routine_history h LEFT JOIN runs r ON r.id=h.run_id WHERE routine_id=$1 ORDER BY h.created_at DESC LIMIT 50',[id(req)]));
 app.get('/api/connections',async()=>{const rows=await query('SELECT * FROM connections ORDER BY name');return rows.map(({auth,oauth,...c})=>({...c,hasAuth:!!auth,authorizationUrl:oauth?decrypt<any>(oauth).authorizationUrl:null}));});
 const connectionInput=z.object({name:z.string().min(1).max(100),url:z.string().url(),headers:z.record(z.string(),z.string()).optional(),readTools:z.array(z.string()).default([])});
 app.post('/api/connections',async req=>{const d=connectionInput.parse(req.body);const row=await one('INSERT INTO connections(name,url,auth,read_tools) VALUES($1,$2,$3,$4) RETURNING id',[d.name,validateEndpoint(d.url),d.headers?encrypt(d.headers):null,JSON.stringify(d.readTools)]);return row;});
 app.put('/api/connections/:id',async req=>{const d=connectionInput.parse(req.body);await query('UPDATE connections SET name=$2,url=$3,auth=COALESCE($4,auth),read_tools=$5 WHERE id=$1',[id(req),d.name,validateEndpoint(d.url),d.headers?encrypt(d.headers):null,JSON.stringify(d.readTools)]);return {ok:true};});
 app.post('/api/connections/:id/test',async req=>{const c=await one('SELECT * FROM connections WHERE id=$1',[id(req)]);if(!c)throw new Error('Conexão não encontrada.');try{return {tools:await discover(c)};}catch{await query("UPDATE connections SET status='error' WHERE id=$1",[c.id]);const updated=await one('SELECT oauth FROM connections WHERE id=$1',[c.id]);return {error:'Conexão indisponível ou autenticação necessária.',authorizationUrl:updated?.oauth?decrypt<any>(updated.oauth).authorizationUrl:null};}});
 app.get('/api/connections/:id/oauth/callback',async(req,reply)=>{const input=z.object({code:z.string(),state:z.string()}).parse(req.query);const c=await one('SELECT * FROM connections WHERE id=$1',[id(req)]);const o=c?.oauth?decrypt<any>(c.oauth):null;if(!o?.state||!safeEqual(o.state,input.state))throw new Error('Estado OAuth inválido.');await finishOAuth(c,input.code);await discover(await one('SELECT * FROM connections WHERE id=$1',[c.id]));reply.redirect('/');});
 app.delete('/api/connections/:id',async req=>{await query('DELETE FROM connections WHERE id=$1',[id(req)]);return {ok:true};});
 app.get('/api/tools',async()=>{const tools:any[]=nativeToolNames.map(name=>({name,label:name,read:true}));for(const c of await query('SELECT * FROM connections'))for(const t of c.tools)tools.push({name:`mcp_${c.id.replaceAll('-','')}_${String(t.name).replace(/[^a-zA-Z0-9_-]/g,'_')}`.slice(0,64),label:`${c.name}: ${t.name}`,read:c.read_tools.includes(t.name)});return tools;});
 app.get('/api/usage',async()=>({runs:await query('SELECT state,count(*)::int AS count FROM runs GROUP BY state'),models:await query("SELECT model,sum(COALESCE((usage->>'prompt_tokens')::bigint,0)) AS input_tokens,sum(COALESCE((usage->>'completion_tokens')::bigint,0)) AS output_tokens FROM runs GROUP BY model")}));
 app.get('/api/events',async(req,reply)=>{
  const header=String(req.headers['last-event-id']||''),qs=(req.query as any).after;let cursor=/^\d+$/.test(header)?Number(header):/^\d+$/.test(String(qs||''))?Number(qs):Number((await one('SELECT COALESCE(max(id),0) AS id FROM events')).id);
  reply.hijack();reply.raw.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});reply.raw.write(': connected\n\n');let busy=false;
  const interval=setInterval(async()=>{if(busy||reply.raw.destroyed)return;busy=true;try{const valid=await one('SELECT 1 FROM sessions WHERE id=$1 AND expires_at>now()',[(req as any).session.id]);if(!valid){reply.raw.end();return;}for(const e of await query('SELECT * FROM events WHERE id>$1 ORDER BY id LIMIT 200',[cursor])){reply.raw.write(`id: ${e.id}\ndata: ${JSON.stringify({type:e.type,...e.payload})}\n\n`);cursor=Number(e.id);}reply.raw.write(': heartbeat\n\n');}catch{reply.raw.end();}finally{busy=false;}},400);reply.raw.on('close',()=>clearInterval(interval));
 });
 return app;
}
export async function seed(){if(await one('SELECT id FROM agents LIMIT 1'))return;const templates=[['Coordenador','Organiza o trabalho da equipe','#f1f0e9','circular',true],['Pesquisador','Investiga e verifica fontes','#18b99c','gota',true],['Redator','Transforma ideias em textos','#fcad24','triangular',false],['Revisor','Revisa qualidade e precisão','#9b6bff','hexagonal',false]];for(const [name,role,color,shape,pinned] of templates)await query('INSERT INTO agents(name,role,color,shape,pinned,tools,instructions) VALUES($1,$2,$3,$4,$5,$6,$7)',[name,role,color,shape,pinned,JSON.stringify(nativeToolNames),`Você é ${name}. ${role}. Trabalhe com clareza, confirme fatos e entregue resultados verificáveis.`]);}
if(process.argv[1]?.endsWith('api.ts')){await migrate();await startQueue();await seed();const app=await buildApp();await app.listen({host:'0.0.0.0',port:Number(process.env.PORT||3001)});for(const s of ['SIGTERM','SIGINT'])process.on(s,async()=>{await app.close();await boss.stop();await pool.end();process.exit(0);});}
