import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import argon2 from 'argon2';
import { createBackup,inspectBackup,restoreBackup,cleanBackups,backupDir } from './backup.js';
import { randomBytes } from 'node:crypto';
import { createReadStream,createWriteStream } from 'node:fs';
import { rm,mkdir,stat } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { z,ZodError } from 'zod';
import { agentInput,messageInput,settingsInput,skillInput,routineInput } from '../../../packages/shared/src/index.js';
import { pool,one,query,event,transaction,ensureSection } from './db.js';
import { key,hash,safeEqual,encrypt,decrypt,validateEndpoint,safeError } from './security.js';
import { estimateTokens } from './context.js';
import { approvalToken } from './push.js';
import { hostConfigured,commandsSwitchOn,hostStatus,computersStatus,sshInput,sshAuth,sshStatus,jobState,cancelJob,openAlerts,alertSettings,alertSettingsInput,macInput,wake,runRecipe,listComputers } from './computer.js';
import { publicConfig,saveConfig,models,imageModels,audioModels,transcribe,synthesize,probeModel,config,routerRequest } from './router.js';
import { migrate } from './migrate.js';
import { startQueue,boss,createRun,cancelRun,enqueue } from './runtime.js';
import { storage,saveFile,deleteFile } from './files.js';
import { contained,allowedOrigin,clientIp } from './security.js';
import { discover,finishOAuth } from './mcp.js';
import { nativeToolNames,deleteAgent,mcpToolName } from './tools.js';
import { nextOccurrence } from './schedule.js';
import { registerInsights } from './insights.js';
import { registerPush } from './push.js';
import { registerConnectors } from './connectors.js';
import { routineConversation,routineMessage } from './scheduler.js';
import { readFileSync } from 'node:fs';
const {version}=JSON.parse(readFileSync(new URL('../../../package.json',import.meta.url),'utf8'));
export async function buildApp(){
 key();
 // __Host- cookies are bound to this exact origin over HTTPS (no Domain, Path=/); plain HTTP dev keeps the old name.
 const secureCookie=process.env.COOKIE_SECURE!=='false',sessionCookie=secureCookie?'__Host-cell_session':'cell_session';
 // Unknown users still pay for an argon2 verify, so response time does not reveal which usernames exist.
 const dummyHash=await argon2.hash(randomBytes(16).toString('hex'));
 const app=Fastify({logger:{level:'info',redact:['req.headers.authorization','req.headers.cookie','res.headers.set-cookie']},bodyLimit:1024*1024});
 await app.register(cookie);await app.register(multipart,{limits:{fileSize:25*1024*1024,files:1}});// Signed-in use (live updates, activity center) needs headroom; anonymous traffic gets a tight cap. Login has its own limit.
 await app.register(rateLimit,{max:(req:any)=>req.cookies?.[sessionCookie]?1200:120,timeWindow:'1 minute',keyGenerator:clientIp});
 const id=(req:any)=>z.string().uuid().parse(req.params.id);
 app.setErrorHandler((err:any,req,reply)=>{const status=err instanceof ZodError?400:err.statusCode||400,sql=typeof err.code==='string'&&/^[0-9A-Z]{5}$/.test(err.code);if(sql||status>=500)req.log.error({err},'falha na requisição');reply.code(status>=500?500:status).send({error:err instanceof ZodError?'Dados inválidos: '+err.issues.map((x:any)=>x.path.join('.')+': '+x.message).join('; '):sql?(err.code.startsWith('23')?'Operação incompatível com os dados existentes.':'Operação inválida.'):status>=500?'Falha interna. Tente novamente.':safeError(err)});});
 app.addHook('onRequest',async(req,reply)=>{
  reply.header('X-Content-Type-Options','nosniff').header('Referrer-Policy','same-origin').header('Cache-Control','no-store');
  // OAuth callbacks are protected by their random state; the provider may return to a host where this browser has no session.
  if(req.url==='/api/health'||req.url==='/api/login'||req.url.startsWith('/api/connections/oauth/callback')||/^\/api\/approvals\/[0-9a-f-]{36}\/quick$/.test(req.url))return;
  const token=req.cookies[sessionCookie];if(!token)return reply.code(401).send({error:'Faça login.'});
  const session=await one('SELECT s.*,u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=$1 AND expires_at>now()',[hash(token)]);if(!session)return reply.code(401).send({error:'Sessão expirada.'});(req as any).session=session;
  if(!['GET','HEAD','OPTIONS'].includes(req.method)){
   if(!safeEqual(String(req.headers['x-csrf-token']||''),session.csrf))return reply.code(403).send({error:'Validação CSRF inválida.'});
   if(req.headers.origin&&!allowedOrigin(req.headers.origin))return reply.code(403).send({error:'Origem não permitida.'});
  }
 });
 app.get('/api/health',async()=>{await query('SELECT 1');return {ok:true,version};});
 app.post('/api/login',{config:{rateLimit:{max:10,timeWindow:'15 minutes'}}},async(req,reply)=>{
  if(req.headers.origin&&!allowedOrigin(req.headers.origin))return reply.code(403).send({error:'Origem não permitida.'});
  const input=z.object({username:z.string().max(100),password:z.string().max(1000)}).parse(req.body),u=await one('SELECT * FROM users WHERE username=$1',[input.username]);
  if(!await argon2.verify(u?.password_hash||dummyHash,input.password)||!u){req.log.warn({ip:clientIp(req)},'login recusado');return reply.code(401).send({error:'Usuário ou senha inválidos.'});}
  const token=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');await query("INSERT INTO sessions(id,user_id,csrf,expires_at) VALUES($1,$2,$3,now()+interval '30 days')",[hash(token),u.id,csrf]);reply.setCookie(sessionCookie,token,{httpOnly:true,secure:secureCookie,sameSite:'lax',path:'/',maxAge:30*86400});return {username:u.username,csrf};
 });
 app.get('/api/me',async req=>({username:(req as any).session.username,csrf:(req as any).session.csrf}));
 app.post('/api/logout',async(req,reply)=>{await query('DELETE FROM sessions WHERE id=$1',[(req as any).session.id]);reply.clearCookie(sessionCookie,{path:'/',secure:secureCookie});return {ok:true};});
 // Backup and restore from the app. The account password confirms each action and encrypts the backup file.
 const checkPassword=async(req:any,password:string)=>{const u=await one('SELECT password_hash FROM users WHERE id=$1',[req.session.user_id]);if(!u||!await argon2.verify(u.password_hash,password))throw new Error('Senha da conta incorreta.');};
 app.post('/api/backup',{config:{rateLimit:{max:5,timeWindow:'10 minutes'}}},async(req,reply)=>{
  const {password}=z.object({password:z.string().min(1).max(1000)}).parse(req.body);await checkPassword(req,password);await cleanBackups();
  const b=await createBackup(password,version);
  const stream=createReadStream(b.file);stream.on('close',()=>{rm(b.file,{force:true}).catch(()=>{});});
  return reply.header('Content-Disposition',`attachment; filename="${b.name}"`).header('X-Backup-Summary',encodeURIComponent(JSON.stringify({counts:b.meta.counts,files:b.meta.files}))).type('application/octet-stream').send(stream);
 });
 // Step 1: upload and check (nothing changes). The file waits on the server for step 2 (up to an hour).
 app.post('/api/backup/inspect',{config:{rateLimit:{max:10,timeWindow:'10 minutes'}}},async req=>{
  await cleanBackups();await mkdir(backupDir(),{recursive:true});
  let password='',file='';
  for await(const part of req.parts({limits:{fileSize:4*1024*1024*1024,files:1}})){
   if(part.type==='field'){if(part.fieldname==='password')password=String(part.value||'');continue;}
   file=path.join(backupDir(),`upload-${randomBytes(12).toString('hex')}.cellbackup`);await pipeline(part.file,createWriteStream(file));
   if(part.file.truncated){await rm(file,{force:true});throw new Error('Arquivo grande demais.');}
  }
  if(!file)throw new Error('Envie o arquivo do backup.');
  try{if(!password)throw new Error('Informe a senha do backup.');const info=await inspectBackup(file,password);return {uploadId:path.basename(file,'.cellbackup'),...info};}
  catch(e){await rm(file,{force:true});throw e;}
 });
 // Step 2: replace everything. Needs the current account password; the backup's own password if it was different.
 app.post('/api/backup/restore',{config:{rateLimit:{max:5,timeWindow:'10 minutes'}}},async(req,reply)=>{
  const d=z.object({uploadId:z.string().regex(/^upload-[0-9a-f]{24}$/),password:z.string().min(1).max(1000),backupPassword:z.string().max(1000).optional()}).parse(req.body);
  await checkPassword(req,d.password);
  const file=path.join(backupDir(),d.uploadId+'.cellbackup');if(!await stat(file).catch(()=>null))throw new Error('O arquivo enviado expirou. Envie o backup de novo.');
  try{const r=await restoreBackup(file,d.backupPassword||d.password);reply.clearCookie(sessionCookie,{path:'/',secure:secureCookie});return {ok:true,...r};}
  finally{await rm(file,{force:true});}
 });
 app.post('/api/account/password',async req=>{const input=z.object({current:z.string(),password:z.string().min(12).max(200)}).parse(req.body),u=await one('SELECT * FROM users WHERE id=$1',[(req as any).session.user_id]);if(!await argon2.verify(u.password_hash,input.current))throw new Error('Senha atual incorreta.');await query('UPDATE users SET password_hash=$1 WHERE id=$2',[await argon2.hash(input.password),u.id]);await query('DELETE FROM sessions WHERE user_id=$1 AND id<>$2',[u.id,(req as any).session.id]);return {ok:true};});
 // Signs out every other device (e.g. a lost phone) without changing the password.
 app.post('/api/account/logout-others',async req=>{const s=(req as any).session;const rows=await query('DELETE FROM sessions WHERE user_id=$1 AND id<>$2 RETURNING id',[s.user_id,s.id]);return {ended:rows.length};});
 app.get('/api/settings',publicConfig);
 app.put('/api/settings',async req=>{const input=settingsInput.parse(req.body);new Intl.DateTimeFormat('pt-BR',{timeZone:input.timezone});await saveConfig(input);return publicConfig();});
 app.post('/api/settings/reset',async()=>{await query('DELETE FROM settings');return publicConfig();});
 app.get('/api/models',async()=>({models:await models(),capabilities:await query('SELECT * FROM model_capabilities')}));
 app.get('/api/models/image',async()=>({models:await imageModels()}));
 app.post('/api/models/probe',async req=>probeModel(z.object({model:z.string().min(1)}).parse(req.body).model));
 app.post('/api/models/vision',async req=>{const {model}=z.object({model:z.string().min(1)}).parse(req.body);const c=await config();const r=await(await routerRequest(c,'/chat/completions',{model,stream:false,max_tokens:60,messages:[{role:'user',content:[{type:'text',text:'Descreva brevemente a imagem.'},{type:'image_url',image_url:{url:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='}}]}]})).json() as any;if(!r.choices?.[0]?.message?.content)throw new Error('Sem resposta de visão.');await query('INSERT INTO model_capabilities(id,vision,verified_at) VALUES($1,true,now()) ON CONFLICT(id) DO UPDATE SET vision=true,verified_at=now()',[model]);return {vision:true,description:r.choices[0].message.content};});
 app.get('/api/agents',async()=>query(`SELECT a.*,(SELECT state FROM runs WHERE agent_id=a.id ORDER BY CASE state WHEN 'running' THEN 0 WHEN 'waiting_approval' THEN 1 WHEN 'waiting_agent' THEN 2 WHEN 'queued' THEN 3 ELSE 4 END,created_at DESC LIMIT 1) AS state,(SELECT m.content FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.agent_id=a.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,EXISTS(SELECT 1 FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.agent_id=a.id AND m.role='assistant' AND m.created_at>c.seen_at) AS unread FROM agents a ORDER BY position,created_at`));
 // At most three agents pinned to the top (the pinned bar has room for three).
 const MAX_PINNED=3;
 const assertPinRoom=async(agentId:string|null)=>{const n=(await one('SELECT count(*)::int AS n FROM agents WHERE pinned AND NOT archived AND id IS DISTINCT FROM $1',[agentId])).n;if(n>=MAX_PINNED)throw new Error(`Você pode fixar até ${MAX_PINNED} agentes. Desafixe um antes.`);};
 const agentColumns=['name','role','description','instructions','color','shape','model','pinned','notify','voice_reply','tts_model','tts_voice','section','memory','tools','skills'];
 const values=(data:any)=>agentColumns.map(k=>['tools','skills'].includes(k)?JSON.stringify(data[k]):data[k]);
 app.post('/api/agents',async req=>{const d=agentInput.parse(req.body);if(d.pinned)await assertPinRoom(null);await ensureSection(d.section);const a=await one(`INSERT INTO agents(${agentColumns.join(',')},position) VALUES(${agentColumns.map((_,i)=>'$'+(i+1)).join(',')},(SELECT COALESCE(max(position),0)+1 FROM agents)) RETURNING *`,values(d));await event('agent',{id:a.id});return a;});
 app.put('/api/agents/:id',async req=>{const d=agentInput.parse(req.body);await ensureSection(d.section);const before=await one('SELECT memory,pinned FROM agents WHERE id=$1',[id(req)]);if(d.pinned&&!before?.pinned)await assertPinRoom(id(req));if(before&&before.memory!==d.memory)await query("INSERT INTO memory_revisions(agent_id,kind,body,source) VALUES($1,'memory',$2,'Editor do agente')",[id(req),d.memory]);const a=await one(`UPDATE agents SET ${agentColumns.map((k,i)=>`${k}=$${i+2}`).join(',')} WHERE id=$1 RETURNING *`,[id(req),...values(d)]);await event('agent',{id:id(req)});return a;});
 app.post('/api/agents/:id/notify',async req=>{const {notify}=z.object({notify:z.boolean()}).parse(req.body);await query('UPDATE agents SET notify=$2 WHERE id=$1',[id(req),notify]);await event('agent',{id:id(req)});return {ok:true};});
 // Quick edits from the agent list menu: rename and move to another section (appended at its end).
 app.patch('/api/agents/:id',async req=>{
  const d=z.object({name:z.string().trim().min(1,'Informe um nome.').max(60).optional(),section:z.string().trim().min(1).max(60).optional()}).refine(x=>x.name!==undefined||x.section!==undefined,'Nada para alterar.').parse(req.body);
  if(d.section)await ensureSection(d.section);
  const a=await one('UPDATE agents SET name=COALESCE($2,name),section=COALESCE($3,section),position=CASE WHEN $3::text IS NULL OR $3=section THEN position ELSE (SELECT COALESCE(max(position),0)+1 FROM agents) END WHERE id=$1 RETURNING *',[id(req),d.name??null,d.section??null]);
  if(!a)throw new Error('Agente não encontrado.');await event('agent',{id:a.id});return a;
 });
 app.post('/api/agents/:id/pin',async req=>{const {pinned}=z.object({pinned:z.boolean()}).parse(req.body);if(pinned)await assertPinRoom(id(req));await query('UPDATE agents SET pinned=$2 WHERE id=$1',[id(req),pinned]);await event('agent',{id:id(req)});return {ok:true};});
 app.post('/api/agents/:id/archive',async req=>{const {archived}=z.object({archived:z.boolean()}).parse(req.body);if(archived&&(await one('SELECT is_master FROM agents WHERE id=$1',[id(req)]))?.is_master)throw new Error('O Coordenador é o agente principal e não pode ser arquivado.');await query('UPDATE agents SET archived=$2 WHERE id=$1',[id(req),archived]);return {ok:true};});
 app.delete('/api/agents/:id',async req=>{await deleteAgent(id(req));return {ok:true};});
 // Sections group agents in the sidebar; order and membership are saved together by PUT /api/layout.
 const sectionName=z.string().trim().min(1).max(60);
 app.get('/api/sections',async()=>{await query('INSERT INTO sections(name,position) SELECT DISTINCT section,(SELECT COALESCE(max(position),0)+1 FROM sections) FROM agents ON CONFLICT(name) DO NOTHING');return query('SELECT name FROM sections ORDER BY position,name');});
 app.post('/api/sections',async req=>{const name=sectionName.parse((req.body as any)?.name);if(await one('SELECT 1 FROM sections WHERE lower(name)=lower($1)',[name]))throw new Error('Já existe uma seção com esse nome.');await ensureSection(name);await event('agent',{section:name});return {name};});
 app.put('/api/sections/:name',async req=>{const from=sectionName.parse((req.params as any).name),to=sectionName.parse((req.body as any)?.name);if(from!==to&&await one('SELECT 1 FROM sections WHERE lower(name)=lower($1) AND name<>$2',[to,from]))throw new Error('Já existe uma seção com esse nome.');await transaction(async c=>{await c.query('UPDATE sections SET name=$2 WHERE name=$1',[from,to]);await c.query('UPDATE agents SET section=$2 WHERE section=$1',[from,to]);});await event('agent',{section:to});return {name:to};});
 app.delete('/api/sections/:name',async req=>{const name=sectionName.parse((req.params as any).name);if(await one('SELECT 1 FROM agents WHERE section=$1',[name]))throw new Error('Mova ou exclua os agentes desta seção antes de removê-la.');await query('DELETE FROM sections WHERE name=$1',[name]);await event('agent',{section:name});return {ok:true};});
 app.put('/api/layout',async req=>{const d=z.object({sections:z.array(sectionName).max(100),agents:z.array(z.object({id:z.string().uuid(),section:sectionName})).max(500)}).parse(req.body);
  await transaction(async c=>{for(const [i,name] of d.sections.entries())await c.query('INSERT INTO sections(name,position) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET position=$2',[name,i]);for(const [i,a] of d.agents.entries()){await c.query('INSERT INTO sections(name,position) VALUES($1,$2) ON CONFLICT(name) DO NOTHING',[a.section,d.sections.length+i]);await c.query('UPDATE agents SET position=$2,section=$3 WHERE id=$1',[a.id,i,a.section]);}});
  await event('agent',{layout:true});return {ok:true};});
 app.get('/api/agents/:id/conversations',async req=>query('SELECT c.*,(SELECT count(*)::int FROM messages m WHERE m.conversation_id=c.id) AS message_count FROM conversations c WHERE agent_id=$1 ORDER BY archived_at IS NOT NULL,COALESCE(archived_at,created_at) DESC',[id(req)]));
 app.post('/api/agents/:id/conversations',async req=>one('INSERT INTO conversations(agent_id,title) VALUES($1,$2) RETURNING *',[id(req),z.object({title:z.string().max(120).default('Nova conversa')}).parse(req.body||{}).title]));
 // Archiving keeps the conversation in the history and opens a fresh, empty one for the agent.
 app.post('/api/conversations/:id/archive',async req=>{const cv=await one('SELECT * FROM conversations WHERE id=$1',[id(req)]);if(!cv)throw new Error('Conversa não encontrada.');if(cv.archived_at)throw new Error('Esta conversa já está arquivada.');
  if(await one("SELECT id FROM runs WHERE conversation_id=$1 AND state IN('queued','running','waiting_approval','waiting_agent')",[cv.id]))throw new Error('Aguarde ou cancele a tarefa em andamento antes de arquivar a conversa.');
  const fresh=await transaction(async c=>{await c.query('UPDATE conversations SET archived_at=now() WHERE id=$1',[cv.id]);return (await c.query('INSERT INTO conversations(agent_id) VALUES($1) RETURNING *',[cv.agent_id])).rows[0];});
  await event('conversation',{agentId:cv.agent_id});return fresh;});
 app.post('/api/conversations/:id/restore',async req=>{const cv=await one('UPDATE conversations SET archived_at=NULL WHERE id=$1 RETURNING *',[id(req)]);if(!cv)throw new Error('Conversa não encontrada.');await event('conversation',{agentId:cv.agent_id});return cv;});
 // Context window: estimated size of what the latest execution sent the model (it grows with tool results), against the limit.
 app.get('/api/conversations/:id/context',async req=>{const max=(await config()).contextTokens||16000;const run=await one('SELECT context,updated_at FROM runs WHERE conversation_id=$1 AND context_ready ORDER BY created_at DESC LIMIT 1',[id(req)]);return {max,used:run?estimateTokens(run.context):null,at:run?.updated_at||null};});
 app.get('/api/conversations/:id',async req=>{if((req.query as any).seen!=='0')await query('UPDATE conversations SET seen_at=now() WHERE id=$1',[id(req)]);return {conversation:await one('SELECT * FROM conversations WHERE id=$1',[id(req)]),messages:await query("SELECT m.*,(SELECT COALESCE(json_agg(json_build_object('id',f.id,'name',f.name,'mime',f.mime)),'[]') FROM files f WHERE f.id::text IN(SELECT jsonb_array_elements_text(m.files))) AS attachments FROM messages m WHERE conversation_id=$1 ORDER BY created_at,id",[id(req)]),routines:await query('SELECT id,name,kind,schedule,timezone,enabled,next_at,last_at,created_at FROM routines WHERE conversation_id=$1 ORDER BY created_at',[id(req)]),runs:await query('SELECT id,agent_id,conversation_id,parent_id,state,mode,model,steps,error,output,partial_output,usage,documents,created_at,updated_at FROM runs WHERE conversation_id=$1 ORDER BY created_at',[id(req)]),calls:await query('SELECT t.*,a.id AS approval_id,a.status AS approval_status,f.id IS NOT NULL AS undoable,f.undone_at FROM tool_calls t LEFT JOIN file_ops f ON f.call_id=t.id JOIN runs r ON r.id=t.run_id LEFT JOIN approvals a ON a.call_id=t.id WHERE r.conversation_id=$1 ORDER BY t.created_at',[id(req)])};});
 app.post('/api/conversations/:id/messages',async req=>{const input=messageInput.parse(req.body);const cv=await one('SELECT * FROM conversations WHERE id=$1',[id(req)]);if(!cv)throw new Error('Conversa não encontrada.');if(cv.archived_at)throw new Error('Conversa arquivada. Restaure-a para continuar.');const r=await createRun(cv.agent_id,cv.id,input.content,input.files,undefined,undefined,undefined,{mode:input.mode});if(cv.title==='Nova conversa')await query('UPDATE conversations SET title=$2 WHERE id=$1',[cv.id,input.content.slice(0,60)]);return {id:r.id,state:r.state};});
 // Voice message: store the recording, transcribe it and send the transcript as the message (the audio stays attached).
 app.post('/api/conversations/:id/audio',{config:{rateLimit:{max:30,timeWindow:'1 minute'}}},async req=>{
  const cv=await one('SELECT * FROM conversations WHERE id=$1',[id(req)]);if(!cv)throw new Error('Conversa não encontrada.');if(cv.archived_at)throw new Error('Conversa arquivada. Restaure-a para continuar.');
  const f=await req.file();if(!f)throw new Error('Áudio ausente.');const data=await f.toBuffer();if(data.length<800)throw new Error('Áudio muito curto.');
  const mime=String(f.mimetype||'').split(';')[0],ext=({'audio/webm':'.webm','audio/ogg':'.ogg','audio/mp4':'.m4a','audio/mpeg':'.mp3','audio/wav':'.wav','audio/x-wav':'.wav'} as Record<string,string>)[mime];
  if(!ext)throw new Error('Formato de áudio não suportado.');
  const mode=(f.fields as any)?.mode?.value==='plan'?'plan':'execute',call=(f.fields as any)?.call?.value==='1';
  const saved=await saveFile(`audio-${new Date().toISOString().slice(0,19).replace(/[-:T]/g,'')}${ext}`,data,cv.agent_id);
  let transcript:string;try{transcript=await transcribe(await config(),data,mime,'audio'+ext);}catch(e){await deleteFile(saved.id);throw e;}
  const r=await createRun(cv.agent_id,cv.id,transcript,[saved.id],undefined,undefined,undefined,{mode,voice:true,call});
  if(cv.title==='Nova conversa')await query('UPDATE conversations SET title=$2 WHERE id=$1',[cv.id,transcript.slice(0,60)]);
  return {id:r.id,state:r.state,transcript};
 });
 // Computer folders granted to agents (approving an agent's access request creates the grant); revoking is immediate.
 // Commands on the computer (Cell Host): installed?, switched on?, reachable?, and the latest commands with their result.
 // Computers for commands: this one (Cell Host) plus SSH machines. Status is checked live, in parallel.
 app.get('/api/computers',async()=>({enabled:await commandsSwitchOn(),hostInstalled:hostConfigured(),computers:await computersStatus(),alerts:await openAlerts()}));
 // Alerts thresholds (Settings → Computador).
 app.get('/api/computer-alerts/settings',async()=>alertSettings());
 app.put('/api/computer-alerts/settings',async req=>{const d=alertSettingsInput.parse(req.body);await query("INSERT INTO settings(id,value) VALUES(1,jsonb_build_object('alerts',$1::jsonb)) ON CONFLICT(id) DO UPDATE SET value=settings.value||jsonb_build_object('alerts',$1::jsonb)",[JSON.stringify(d)]);return d;});
 // Wake-on-LAN: MAC (and optional broadcast address) per SSH computer, and the button that sends the signal.
 app.patch('/api/computers/:id',async req=>{const d=z.object({mac:z.union([macInput,z.literal('')]).optional(),broadcast:z.union([z.string().trim().regex(/^\d{1,3}(\.\d{1,3}){3}$/,'Broadcast inválido.'),z.literal('')]).optional()}).parse(req.body);
  const row=await one('UPDATE computers SET mac=CASE WHEN $2::text IS NULL THEN mac ELSE NULLIF($2,\'\') END,broadcast=CASE WHEN $3::text IS NULL THEN broadcast ELSE NULLIF($3,\'\') END WHERE id=$1 RETURNING id,mac,broadcast',[id(req),d.mac??null,d.broadcast??null]);if(!row)throw new Error('Computador não encontrado.');return row;});
 app.post('/api/computers/:id/wake',{config:{rateLimit:{max:10,timeWindow:'1 minute'}}},async req=>{const c=await one('SELECT name,mac,broadcast FROM computers WHERE id=$1',[id(req)]);if(!c?.mac)throw new Error('Cadastre o endereço MAC deste computador.');return {sent:true,via:await wake(c.mac,c.broadcast||undefined)};});
 // Recipes: saved commands, run by the owner with one tap or by agents (trusted ones without approval).
 const recipeInput=z.object({name:z.string().trim().min(1).max(60),computer_key:z.string().min(1).max(60),command:z.string().trim().min(1).max(20000),cwd:z.string().max(500).optional().nullable(),background:z.boolean().default(false),trusted:z.boolean().default(false)});
 app.get('/api/recipes',async()=>query('SELECT * FROM command_recipes ORDER BY lower(name)'));
 app.post('/api/recipes',async req=>{const d=recipeInput.parse(req.body);if(!(await listComputers()).some(c=>c.key===d.computer_key))throw new Error('Computador desconhecido.');if(await one('SELECT 1 FROM command_recipes WHERE lower(name)=lower($1)',[d.name]))throw new Error('Já existe uma receita com esse nome.');
  return one('INSERT INTO command_recipes(name,computer_key,command,cwd,background,trusted) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[d.name,d.computer_key,d.command,d.cwd||null,d.background,d.trusted]);});
 app.patch('/api/recipes/:id',async req=>{const d=z.object({trusted:z.boolean().optional(),name:z.string().trim().min(1).max(60).optional()}).parse(req.body);const r=await one('UPDATE command_recipes SET trusted=COALESCE($2,trusted),name=COALESCE($3,name) WHERE id=$1 RETURNING *',[id(req),d.trusted??null,d.name??null]);if(!r)throw new Error('Receita não encontrada.');return r;});
 app.delete('/api/recipes/:id',async req=>{await query('DELETE FROM command_recipes WHERE id=$1',[id(req)]);return {ok:true};});
 app.post('/api/recipes/:id/run',{config:{rateLimit:{max:20,timeWindow:'1 minute'}}},async req=>{const r=await one('SELECT * FROM command_recipes WHERE id=$1',[id(req)]);if(!r)throw new Error('Receita não encontrada.');if(!await commandsSwitchOn())throw new Error('Os comandos estão desativados em Configurações → Computador.');return runRecipe(r);});
 // Adding an SSH computer: the first call (no fingerprint) connects, runs the status script and returns the server's
 // fingerprint for the owner to confirm; saving repeats the check pinned to that fingerprint.
 app.post('/api/computers/test',{config:{rateLimit:{max:20,timeWindow:'1 minute'}}},async req=>{const x=sshInput.parse(req.body);const r=await sshStatus({host:x.host,port:x.port,username:x.username,password:x.password,privateKey:x.privateKey,passphrase:x.passphrase,fingerprint:x.fingerprint},x.shell);return {fingerprint:r.fingerprint,info:r.info};});
 app.post('/api/computers',async req=>{const x=sshInput.parse(req.body);if(!x.fingerprint)throw new Error('Teste a conexão e confirme a impressão digital antes de salvar.');
  const r=await sshStatus({host:x.host,port:x.port,username:x.username,password:x.password,privateKey:x.privateKey,passphrase:x.passphrase,fingerprint:x.fingerprint},x.shell);
  if(await one('SELECT 1 FROM computers WHERE lower(name)=lower($1)',[x.name])||x.name.toLowerCase()==='este computador')throw new Error('Já existe um computador com esse nome.');
  const row=await one('INSERT INTO computers(name,host,port,username,auth,shell,fingerprint,info,last_seen) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()) RETURNING id,name',[x.name,x.host,x.port,x.username,sshAuth(x),x.shell,x.fingerprint,JSON.stringify(r.info)]);
  return row;});
 app.delete('/api/computers/:id',async req=>{await query('DELETE FROM computers WHERE id=$1',[id(req)]);return {ok:true};});
 // Undo a recorded computer file change: queued to the worker (it has the drives); waits up to 30 s for the result.
 app.post('/api/file-ops/:id/undo',async req=>{
  const op=await one('UPDATE file_ops SET undo_requested_at=now(),undo_error=NULL WHERE call_id=$1 AND undone_at IS NULL RETURNING id',[id(req)]);
  if(!op){if(await one('SELECT 1 FROM file_ops WHERE call_id=$1 AND undone_at IS NOT NULL',[id(req)]))return {ok:true,already:true};throw new Error('Nada para desfazer.');}
  await boss.send('file-undo',{id:op.id});
  for(let i=0;i<60;i++){await new Promise(r=>setTimeout(r,500));const s=await one('SELECT undone_at,undo_error FROM file_ops WHERE id=$1',[op.id]);if(s.undone_at)break;if(s.undo_error)throw new Error('Não foi possível desfazer tudo: '+s.undo_error);}
  const done=await one('SELECT undone_at FROM file_ops WHERE id=$1',[op.id]);if(!done.undone_at)throw new Error('O worker não respondeu. Tente de novo.');
  const cv=await one('SELECT r.conversation_id FROM tool_calls t JOIN runs r ON r.id=t.run_id WHERE t.id=$1',[id(req)]);if(cv)await event('message',{conversationId:cv.conversation_id});
  return {ok:true};
 });
 // Background jobs: live state (asked from the computer itself while running) and cancel.
 app.get('/api/computer-jobs',async()=>Promise.all((await query('SELECT j.*,a.name AS agent_name FROM computer_jobs j LEFT JOIN agents a ON a.id=j.agent_id ORDER BY j.started_at DESC LIMIT 20')).map(async j=>{
  if(j.status!=='running')return j;try{const s=await jobState(j);return {...j,output:s.output,finishing:!s.running};}catch(e){return {...j,unreachable:safeError(e)};}})));
 app.post('/api/computer-jobs/:id/cancel',async req=>{const j=await one("SELECT * FROM computer_jobs WHERE id=$1 AND status='running'",[id(req)]);if(!j)throw new Error('A tarefa não está rodando.');await cancelJob(j);return {ok:true};});
 app.get('/api/host-access/commands',async()=>{const configured=hostConfigured(),enabled=await commandsSwitchOn();let status=null,error='';if(configured){try{status=await hostStatus();}catch(e){error=safeError(e);}}
  const recent=await query("SELECT t.id,t.args->>'command' AS command,t.args->>'reason' AS reason,t.args->>'computer' AS computer,t.args->>'cwd' AS cwd,(t.args->>'background')::boolean AS background,t.status,t.result,t.created_at,a.name AS agent_name,ap.status AS approval FROM tool_calls t JOIN runs r ON r.id=t.run_id JOIN agents a ON a.id=r.agent_id LEFT JOIN approvals ap ON ap.call_id=t.id WHERE t.tool='pc_run' ORDER BY t.created_at DESC LIMIT 20");
  return {configured,enabled,status,error,recent:recent.map(c=>{let exitCode=null;try{exitCode=JSON.parse(c.result).exitCode;}catch{}return {...c,result:undefined,exitCode};})};});
 app.post('/api/host-access/commands',async req=>{const {enabled}=z.object({enabled:z.boolean()}).parse(req.body);await query("INSERT INTO settings(id,value) VALUES(1,jsonb_build_object('computerCommands',$1::boolean)) ON CONFLICT(id) DO UPDATE SET value=settings.value||jsonb_build_object('computerCommands',$1::boolean)",[enabled]);return {enabled};});
 app.get('/api/host-access',async()=>({drives:(await one("SELECT drives FROM worker_health WHERE id='primary'"))?.drives||[],grants:await query('SELECT g.id,g.path,g.created_at,a.id AS agent_id,a.name AS agent_name FROM host_grants g JOIN agents a ON a.id=g.agent_id ORDER BY a.name,g.path')}));
 app.delete('/api/host-access/:id',async req=>{await query('DELETE FROM host_grants WHERE id=$1',[id(req)]);return {ok:true};});
 app.get('/api/models/audio',async()=>audioModels());
 // Plays a short sample with the voice settings being edited (not saved yet).
 app.post('/api/models/voice-test',async(req,reply)=>{const d=z.object({ttsModel:z.string().min(1).max(200),ttsVoice:z.string().max(100).default('')}).parse(req.body);const audio=await synthesize({...await config(),...d},'Olá! Esta é a voz que o agente vai usar nas respostas em áudio.');return reply.type(audio.mime).send(audio.data);});
 app.delete('/api/messages/:id',async req=>{const m=await one('DELETE FROM messages WHERE id=$1 RETURNING conversation_id',[id(req)]);if(m)await event('message',{conversationId:m.conversation_id});return {ok:true};});
 // Only finished-with-error runs can be removed; completed runs keep usage history.
 app.delete('/api/runs/:id',async req=>{const r=await one("DELETE FROM runs WHERE id=$1 AND state IN('failed','cancelled') RETURNING conversation_id",[id(req)]);if(!r)throw new Error('Só é possível excluir execuções com erro ou canceladas.');await event('run',{id:id(req),state:'deleted'});return {ok:true};});
 app.post('/api/runs/:id/cancel',async req=>{await cancelRun(id(req));return {ok:true};});
 const decide=async(approvalId:string,decision:'approved'|'denied')=>{const runId=await transaction(async c=>{const a=(await c.query('SELECT a.*,t.run_id,r.state FROM approvals a JOIN tool_calls t ON t.id=a.call_id JOIN runs r ON r.id=t.run_id WHERE a.id=$1 FOR UPDATE OF a,r',[approvalId])).rows[0];if(!a||a.status!=='pending'||a.state!=='waiting_approval')throw new Error('Aprovação não está mais pendente.');await c.query('UPDATE approvals SET status=$2 WHERE id=$1',[a.id,decision]);return a.run_id;});await enqueue(runId);};
 app.post('/api/approvals/:id',async req=>{const {decision}=z.object({decision:z.enum(['approved','denied'])}).parse(req.body);await decide(id(req),decision);return {ok:true};});
 // From the buttons of the phone notification: no session (the service worker answers without opening the app). The
 // single-purpose token in the notification (HMAC of approval + decision) is the credential; it only works while pending.
 app.post('/api/approvals/:id/quick',{config:{rateLimit:{max:30,timeWindow:'1 minute'}}},async(req,reply)=>{
  const {decision,token}=z.object({decision:z.enum(['approved','denied']),token:z.string().regex(/^[0-9a-f]{64}$/)}).parse(req.body);
  if(!safeEqual(token,approvalToken(id(req),decision)))return reply.code(403).send({error:'Link de aprovação inválido.'});
  await decide(id(req),decision);return {ok:true};
 });
 app.get('/api/search',async req=>{const {q}=z.object({q:z.string().min(2).max(200)}).parse(req.query);return query("SELECT m.*,a.name AS agent_name,a.id AS agent_id FROM messages m JOIN conversations c ON c.id=m.conversation_id JOIN agents a ON a.id=c.agent_id WHERE to_tsvector('portuguese',m.content) @@ plainto_tsquery('portuguese',$1) ORDER BY m.created_at DESC LIMIT 50",[q]);});
 app.get('/api/skills',async()=>query('SELECT * FROM skills ORDER BY name'));
 app.post('/api/skills',async req=>{const d=skillInput.parse(req.body);return one('INSERT INTO skills(name,body) VALUES($1,$2) RETURNING *',[d.name,d.body]);});
 app.put('/api/skills/:id',async req=>{const d=skillInput.parse(req.body);return one('UPDATE skills SET name=$2,body=$3 WHERE id=$1 RETURNING *',[id(req),d.name,d.body]);});
 app.delete('/api/skills/:id',async req=>{await query('DELETE FROM skills WHERE id=$1',[id(req)]);return {ok:true};});
 app.post('/api/conversations/:id/teach',async req=>{const cv=await one('SELECT * FROM conversations WHERE id=$1',[id(req)]);if(!cv)throw new Error('Conversa não encontrada.');if(!await one("SELECT id FROM runs WHERE conversation_id=$1 AND state='completed'",[cv.id]))throw new Error('Conclua uma tarefa antes de criar a proposta.');const msgs=await query('SELECT role,content FROM messages WHERE conversation_id=$1 ORDER BY created_at DESC LIMIT 20',[cv.id]);return {name:`Procedimento: ${cv.title}`,body:`# ${cv.title}\n\n## Objetivo\n${msgs.filter(m=>m.role==='user').at(-1)?.content||''}\n\n## Procedimento proposto — revisar antes de salvar\n${msgs.filter(m=>m.role==='assistant')[0]?.content||''}\n\n## Validação\n- Conferir fontes e resultado.\n- Revisar parâmetros antes de agir.\n\n## Aprovações\nAções externas de escrita exigem aprovação do usuário.`};});
 app.get('/api/files',async()=>query('SELECT id,agent_id,name,mime,size,warning,created_at FROM files ORDER BY created_at DESC'));
 app.post('/api/files',async req=>{const f=await req.file();if(!f)throw new Error('Arquivo ausente.');const data=await f.toBuffer();if(f.file.truncated)throw new Error('Arquivo excede 25 MB.');return saveFile(f.filename,data);});
 app.get('/api/files/:id',async(req,reply)=>{const f=await one('SELECT * FROM files WHERE id=$1',[id(req)]);if(!f)return reply.code(404).send({error:'Arquivo não encontrado.'});const inline=(req.query as any).inline==='1'&&/^(image|audio)\//.test(String(f.mime));return reply.header('Content-Disposition',`${inline?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`).type(f.mime).send(createReadStream(contained(storage,f.storage_name)));});
 app.delete('/api/files/:id',async req=>{await deleteFile(id(req));return {ok:true};});
 app.get('/api/routines',async()=>query('SELECT r.*,a.name AS agent_name FROM routines r JOIN agents a ON a.id=r.agent_id ORDER BY r.created_at DESC'));
 app.post('/api/routines',async req=>{const d=routineInput.parse(req.body);const next=nextOccurrence(d.kind,d.schedule,d.timezone);if(d.enabled&&!next)throw new Error('Escolha uma data futura.');return one('INSERT INTO routines(agent_id,name,prompt,kind,schedule,timezone,enabled,next_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[d.agentId,d.name,d.prompt,d.kind,d.schedule,d.timezone,d.enabled,next]);});
 app.put('/api/routines/:id',async req=>{const d=routineInput.parse(req.body);const next=nextOccurrence(d.kind,d.schedule,d.timezone);if(d.enabled&&!next)throw new Error('Escolha uma data futura.');return one('UPDATE routines SET agent_id=$2,name=$3,prompt=$4,kind=$5,schedule=$6,timezone=$7,enabled=$8,next_at=$9 WHERE id=$1 RETURNING *',[id(req),d.agentId,d.name,d.prompt,d.kind,d.schedule,d.timezone,d.enabled,next]);});
 app.delete('/api/routines/:id',async req=>{await query('DELETE FROM routines WHERE id=$1',[id(req)]);return {ok:true};});
 app.post('/api/routines/:id/run',async req=>{const r=await one('SELECT * FROM routines WHERE id=$1',[id(req)]);if(!r)throw new Error('Rotina não encontrada.');const run=await transaction(async tx=>{const cv=await routineConversation(tx,r);const created=await createRun(r.agent_id,cv,routineMessage(r.name,r.prompt),[],undefined,undefined,undefined,{client:tx});await tx.query("INSERT INTO routine_history(routine_id,run_id,status,scheduled_at) VALUES($1,$2,'manual',now())",[r.id,created.id]);return created;});await enqueue(run.id);return {id:run.id};});
 // Activate or pause a routine (e.g. the proposal card in the chat). Activation recomputes the next run from now.
 app.post('/api/routines/:id/enabled',async req=>{const {enabled}=z.object({enabled:z.boolean()}).parse(req.body);const r=await one('SELECT * FROM routines WHERE id=$1',[id(req)]);if(!r)throw new Error('Rotina não encontrada.');let next=r.next_at;if(enabled){next=nextOccurrence(r.kind,r.schedule,r.timezone);if(!next)throw new Error('O horário desta rotina já passou. Edite a data em Rotinas para ativá-la.');}const row=await one('UPDATE routines SET enabled=$2,next_at=$3 WHERE id=$1 RETURNING *',[r.id,enabled,next]);await event('routine',{id:r.id});return row;});
 app.get('/api/routines/:id/history',async req=>query('SELECT h.*,r.state,r.error FROM routine_history h LEFT JOIN runs r ON r.id=h.run_id WHERE routine_id=$1 ORDER BY h.created_at DESC LIMIT 50',[id(req)]));
 app.get('/api/connections',async()=>{const rows=await query('SELECT * FROM connections ORDER BY name');return rows.map(({auth,oauth,...c})=>({...c,hasAuth:!!auth,authorizationUrl:oauth?decrypt<any>(oauth).authorizationUrl:null}));});
 const connectionInput=z.object({name:z.string().min(1).max(100),url:z.string().url(),headers:z.record(z.string(),z.string()).optional(),readTools:z.array(z.string()).default([])});
 app.post('/api/connections',async req=>{const d=connectionInput.parse(req.body);const row=await one('INSERT INTO connections(name,url,auth,read_tools) VALUES($1,$2,$3,$4) RETURNING id',[d.name,validateEndpoint(d.url),d.headers?encrypt(d.headers):null,JSON.stringify(d.readTools)]);return row;});
 app.put('/api/connections/:id',async req=>{const d=connectionInput.parse(req.body);await query('UPDATE connections SET name=$2,url=$3,auth=COALESCE($4,auth),read_tools=$5 WHERE id=$1',[id(req),d.name,validateEndpoint(d.url),d.headers?encrypt(d.headers):null,JSON.stringify(d.readTools)]);return {ok:true};});
 app.post('/api/connections/:id/test',async req=>{const c=await one('SELECT * FROM connections WHERE id=$1',[id(req)]);if(!c)throw new Error('Conexão não encontrada.');try{return {tools:await discover(c)};}catch{await query("UPDATE connections SET status='error' WHERE id=$1",[c.id]);const updated=await one('SELECT oauth FROM connections WHERE id=$1',[c.id]);return {error:'Conexão indisponível ou autenticação necessária.',authorizationUrl:updated?.oauth?decrypt<any>(updated.oauth).authorizationUrl:null};}});
 app.get('/api/connections/:id/oauth/callback',async(req,reply)=>{const input=z.object({code:z.string(),state:z.string()}).parse(req.query);const c=await one('SELECT * FROM connections WHERE id=$1',[id(req)]);const o=c?.oauth?decrypt<any>(c.oauth):null;if(!o?.state||!safeEqual(o.state,input.state))throw new Error('Estado OAuth inválido.');await finishOAuth(c,input.code);await discover(await one('SELECT * FROM connections WHERE id=$1',[c.id]));reply.redirect('/');});
 app.delete('/api/connections/:id',async req=>{await query('DELETE FROM connections WHERE id=$1',[id(req)]);return {ok:true};});
 app.get('/api/tools',async()=>{const tools:any[]=nativeToolNames.map(name=>({name,label:name,read:true}));for(const c of await query('SELECT * FROM connections'))for(const t of c.tools)tools.push({name:c.kind==='native'?t.name:mcpToolName(c.id,t.name),label:`${c.name}: ${t.name}`,read:c.read_tools.includes(t.name),allAgents:c.all_agents});return tools;});
 app.get('/api/usage',async()=>({runs:await query('SELECT state,count(*)::int AS count FROM runs GROUP BY state'),models:await query("SELECT model,sum(COALESCE((usage->>'prompt_tokens')::bigint,0)) AS input_tokens,sum(COALESCE((usage->>'completion_tokens')::bigint,0)) AS output_tokens FROM runs GROUP BY model")}));
 app.get('/api/events',async(req,reply)=>{
  const header=String(req.headers['last-event-id']||''),qs=(req.query as any).after;let cursor=/^\d+$/.test(header)?Number(header):/^\d+$/.test(String(qs||''))?Number(qs):Number((await one('SELECT COALESCE(max(id),0) AS id FROM events')).id);
  reply.hijack();reply.raw.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});reply.raw.write(': connected\n\n');let busy=false;
  const interval=setInterval(async()=>{if(busy||reply.raw.destroyed)return;busy=true;try{const valid=await one('SELECT 1 FROM sessions WHERE id=$1 AND expires_at>now()',[(req as any).session.id]);if(!valid){reply.raw.end();return;}for(const e of await query('SELECT * FROM events WHERE id>$1 ORDER BY id LIMIT 200',[cursor])){reply.raw.write(`id: ${e.id}\ndata: ${JSON.stringify({type:e.type,...e.payload})}\n\n`);cursor=Number(e.id);}reply.raw.write(': heartbeat\n\n');}catch{reply.raw.end();}finally{busy=false;}},400);reply.raw.on('close',()=>clearInterval(interval));
 });
 registerInsights(app);registerPush(app);registerConnectors(app);
 return app;
}
export async function seed(){if(await one('SELECT id FROM agents LIMIT 1'))return;const templates=[['Coordenador','Organiza o trabalho da equipe','#f1f0e9','animal',true],['Pesquisador','Investiga e verifica fontes','#18b99c','euglena',false],['Redator','Transforma ideias em textos','#fcad24','paramecio',false],['Revisor','Revisa qualidade e precisão','#9b6bff','vegetal',false]];await ensureSection('Equipe');for(const [name,role,color,shape,pinned] of templates)await query('INSERT INTO agents(name,role,color,shape,pinned,tools,instructions,is_master) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[name,role,color,shape,pinned,JSON.stringify(nativeToolNames),`Você é ${name}. ${role}. Trabalhe com clareza, confirme fatos e entregue resultados verificáveis.`,name==='Coordenador']);}
if(process.argv[1]?.endsWith('api.ts')){await migrate();await startQueue();await seed();const app=await buildApp();await app.listen({host:'0.0.0.0',port:Number(process.env.PORT||3001)});for(const s of ['SIGTERM','SIGINT'])process.on(s,async()=>{await app.close();await boss.stop();await pool.end();process.exit(0);});}
