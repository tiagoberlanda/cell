import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createHash,randomBytes } from 'node:crypto';
import { one,query,event } from './db.js';
import { encrypt,decrypt,safeEqual,safeError,hash } from './security.js';
import { discover,finishOAuth,fixedCallback,newState,startAuthorization } from './mcp.js';
import type { Tool } from './tools.js';

const G='https://www.googleapis.com/auth/';
export type CatalogEntry={key:string;name:string;description:string;category:string;color:string;auth:'oauth'|'google'|'google-native';url?:string;scopes?:string[];preview?:boolean;loopback?:boolean};
// One-click connectors. 'oauth': remote MCP with dynamic client registration (nothing to configure).
// 'google': Google's official MCP servers (developer preview), which need the owner's Google OAuth client once.
// 'google-native': Google Tasks has no MCP server, so Cell talks to the Tasks API directly with the same client.
export const catalog:CatalogEntry[]=[
 {key:'notion',name:'Notion',description:'Busque, leia e crie páginas e bancos de dados.',category:'Documentos',color:'#f5f5f2',auth:'oauth',url:'https://mcp.notion.com/mcp'},
 {key:'canva',name:'Canva',description:'Crie, encontre e edite designs.',category:'Criação',color:'#7d2ae8',auth:'oauth',url:'https://mcp.canva.com/mcp',loopback:true},
 {key:'todoist',name:'Todoist',description:'Tarefas, projetos e prazos.',category:'Tarefas',color:'#e44332',auth:'oauth',url:'https://ai.todoist.net/mcp'},
 {key:'linear',name:'Linear',description:'Issues, projetos e ciclos.',category:'Projetos',color:'#5e6ad2',auth:'oauth',url:'https://mcp.linear.app/mcp'},
 {key:'atlassian',name:'Jira e Confluence',description:'Issues do Jira e páginas do Confluence.',category:'Projetos',color:'#0c66e4',auth:'oauth',url:'https://mcp.atlassian.com/v1/mcp'},
 {key:'clickup',name:'ClickUp',description:'Tarefas, listas e documentos.',category:'Tarefas',color:'#7b68ee',auth:'oauth',url:'https://mcp.clickup.com/mcp'},
 {key:'monday',name:'monday.com',description:'Quadros, itens e atualizações.',category:'Projetos',color:'#6161ff',auth:'oauth',url:'https://mcp.monday.com/mcp'},
 {key:'airtable',name:'Airtable',description:'Bases, tabelas e registros.',category:'Dados',color:'#18bfff',auth:'oauth',url:'https://mcp.airtable.com/mcp'},
 {key:'miro',name:'Miro',description:'Quadros, notas e diagramas.',category:'Criação',color:'#ffd02f',auth:'oauth',url:'https://mcp.miro.com/'},
 {key:'zapier',name:'Zapier',description:'Ações em milhares de aplicativos.',category:'Automação',color:'#ff4f00',auth:'oauth',url:'https://mcp.zapier.com/api/mcp/mcp'},
 {key:'stripe',name:'Stripe',description:'Clientes, cobranças e pagamentos.',category:'Negócios',color:'#635bff',auth:'oauth',url:'https://mcp.stripe.com'},
 {key:'paypal',name:'PayPal',description:'Faturas, pedidos e transações.',category:'Negócios',color:'#002991',auth:'oauth',url:'https://mcp.paypal.com/mcp'},
 {key:'wix',name:'Wix',description:'Sites, loja e conteúdo.',category:'Sites',color:'#0c6efc',auth:'oauth',url:'https://mcp.wix.com/mcp'},
 {key:'webflow',name:'Webflow',description:'Sites, coleções e páginas.',category:'Sites',color:'#146ef5',auth:'oauth',url:'https://mcp.webflow.com/mcp'},
 {key:'supabase',name:'Supabase',description:'Projetos, bancos e tabelas.',category:'Desenvolvimento',color:'#3fcf8e',auth:'oauth',url:'https://mcp.supabase.com/mcp'},
 {key:'sentry',name:'Sentry',description:'Erros e incidentes das aplicações.',category:'Desenvolvimento',color:'#362d59',auth:'oauth',url:'https://mcp.sentry.dev/mcp'},
 {key:'cloudflare',name:'Cloudflare',description:'Documentação, Workers e contas.',category:'Desenvolvimento',color:'#f38020',auth:'oauth',url:'https://mcp.cloudflare.com/mcp'},
 {key:'huggingface',name:'Hugging Face',description:'Modelos, datasets e Spaces.',category:'Desenvolvimento',color:'#ffd21e',auth:'oauth',url:'https://huggingface.co/mcp'},
 {key:'gmail',name:'Gmail',description:'Pesquise e leia e-mails e crie rascunhos.',category:'Google',color:'#ea4335',auth:'google',url:'https://gmailmcp.googleapis.com/mcp/v1',scopes:[G+'gmail.readonly',G+'gmail.compose'],preview:true},
 {key:'google-drive',name:'Google Drive',description:'Encontre, leia e envie arquivos.',category:'Google',color:'#1fa463',auth:'google',url:'https://drivemcp.googleapis.com/mcp/v1',scopes:[G+'drive.readonly',G+'drive.file'],preview:true},
 {key:'google-calendar',name:'Google Agenda',description:'Consulte horários livres e gerencie eventos.',category:'Google',color:'#4285f4',auth:'google',url:'https://calendarmcp.googleapis.com/mcp/v1',scopes:[G+'calendar.calendarlist.readonly',G+'calendar.events.freebusy',G+'calendar.events'],preview:true},
 {key:'google-tasks',name:'Google Tarefas',description:'Liste, crie e conclua tarefas.',category:'Google',color:'#2684fc',auth:'google-native',scopes:[G+'tasks']},
];
// Test hooks: point catalog URLs and Google endpoints at local fakes. Unset in production.
const urlOf=(e:CatalogEntry)=>JSON.parse(process.env.CONNECTOR_URL_OVERRIDES||'{}')[e.key]||e.url;
const google=()=>({authorize:process.env.GOOGLE_OAUTH_AUTHORIZE||'https://accounts.google.com/o/oauth2/v2/auth',token:process.env.GOOGLE_OAUTH_TOKEN||'https://oauth2.googleapis.com/token',tasks:process.env.GOOGLE_TASKS_API||'https://tasks.googleapis.com/tasks/v1'});
export async function googleClient(){const r=await one("SELECT client_id,client_secret FROM oauth_clients WHERE provider='google'");return r?{client_id:r.client_id as string,client_secret:decrypt<string>(r.client_secret)}:null;}
const saveOAuth=(id:string,oauth:any)=>query('UPDATE connections SET oauth=$1 WHERE id=$2',[encrypt(oauth),id]);

// Google Tasks API with automatic token refresh (refresh tokens come from access_type=offline + prompt=consent).
async function googleToken(connectionId:string,force=false){
 const c=await one('SELECT oauth FROM connections WHERE id=$1',[connectionId]);if(!c?.oauth)throw new Error('Google Tarefas não está conectado.');
 const oauth=decrypt<any>(c.oauth),t=oauth.tokens;if(!t?.access_token)throw new Error('Google Tarefas não está conectado.');
 if(!force&&t.expires_at&&t.expires_at>Date.now()+60000)return t.access_token as string;
 const client=await googleClient();if(!client||!t.refresh_token)throw new Error('Reconecte o Google Tarefas.');
 const res=await fetch(google().token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:t.refresh_token,client_id:client.client_id,client_secret:client.client_secret}),signal:AbortSignal.timeout(15000)});
 if(!res.ok){await query("UPDATE connections SET status='error' WHERE id=$1",[connectionId]);throw new Error('O Google recusou a renovação do acesso. Reconecte o Google Tarefas.');}
 const fresh=await res.json() as any;oauth.tokens={...t,access_token:fresh.access_token,expires_at:Date.now()+(fresh.expires_in||3600)*1000};await saveOAuth(connectionId,oauth);return fresh.access_token as string;
}
async function tasksApi(connectionId:string,path:string,init:{method?:string;body?:any}={}){
 for(const retry of [false,true]){
  const token=await googleToken(connectionId,retry);
  const res=await fetch(google().tasks+path,{method:init.method||'GET',headers:{Authorization:`Bearer ${token}`,...(init.body?{'Content-Type':'application/json'}:{})},body:init.body?JSON.stringify(init.body):undefined,signal:AbortSignal.timeout(20000)});
  if(res.status===401&&!retry)continue;
  if(!res.ok)throw new Error(`Google Tarefas: HTTP ${res.status} ${(await res.text()).slice(0,200)}`);
  return res.status===204?{ok:true}:await res.json();
 }
}
const list=(v?:string)=>encodeURIComponent(v||'@default');
const str={type:'string'};
const object=(properties:any,required:string[])=>({type:'object',properties,required,additionalProperties:false});
// Fixed names so agents and approvals stay stable across reconnections. Writes need the owner's approval.
export const googleTasksDefs=[
 {name:'gtasks_list_tasklists',description:'Lista as listas de tarefas do Google Tarefas.',parameters:object({},[]),write:false},
 {name:'gtasks_list_tasks',description:'Lista tarefas de uma lista do Google Tarefas (padrão: a lista principal). Use showCompleted=true para incluir concluídas.',parameters:object({tasklist:str,showCompleted:{type:'boolean'}},[]),write:false},
 {name:'gtasks_create_task',description:'Cria uma tarefa no Google Tarefas. due é a data no formato AAAA-MM-DD.',parameters:object({title:str,notes:str,due:str,tasklist:str},['title']),write:true},
 {name:'gtasks_complete_task',description:'Marca uma tarefa do Google Tarefas como concluída.',parameters:object({taskId:str,tasklist:str},['taskId']),write:true},
 {name:'gtasks_delete_task',description:'Exclui uma tarefa do Google Tarefas.',parameters:object({taskId:str,tasklist:str},['taskId']),write:true},
];
export function googleTasksTools(c:any):Tool[]{
 const run:Record<string,(a:any)=>Promise<any>>={
  gtasks_list_tasklists:async()=>((await tasksApi(c.id,'/users/@me/lists?maxResults=100')) as any).items?.map((l:any)=>({id:l.id,title:l.title}))||[],
  gtasks_list_tasks:async a=>{const x=z.object({tasklist:z.string().max(200).optional(),showCompleted:z.boolean().optional()}).parse(a);const r:any=await tasksApi(c.id,`/lists/${list(x.tasklist)}/tasks?maxResults=100&showCompleted=${x.showCompleted?'true':'false'}&showHidden=${x.showCompleted?'true':'false'}`);return (r.items||[]).map((t:any)=>({id:t.id,title:t.title,notes:t.notes,due:t.due,status:t.status}));},
  gtasks_create_task:async a=>{const x=z.object({title:z.string().trim().min(1).max(1024),notes:z.string().max(8000).optional(),due:z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional(),tasklist:z.string().max(200).optional()}).parse(a);const t:any=await tasksApi(c.id,`/lists/${list(x.tasklist)}/tasks`,{method:'POST',body:{title:x.title,notes:x.notes,...(x.due?{due:`${x.due.slice(0,10)}T00:00:00.000Z`}:{})}});return {id:t.id,title:t.title,due:t.due,status:'Tarefa criada.'};},
  gtasks_complete_task:async a=>{const x=z.object({taskId:z.string().min(1).max(200),tasklist:z.string().max(200).optional()}).parse(a);const t:any=await tasksApi(c.id,`/lists/${list(x.tasklist)}/tasks/${encodeURIComponent(x.taskId)}`,{method:'PATCH',body:{status:'completed'}});return {id:t.id,title:t.title,status:'Tarefa concluída.'};},
  gtasks_delete_task:async a=>{const x=z.object({taskId:z.string().min(1).max(200),tasklist:z.string().max(200).optional()}).parse(a);await tasksApi(c.id,`/lists/${list(x.tasklist)}/tasks/${encodeURIComponent(x.taskId)}`,{method:'DELETE'});return {status:'Tarefa excluída.'};},
 };
 return googleTasksDefs.map(d=>({...d,binding:hash(JSON.stringify({connection:c.id,tool:d.name})),target:`Google Tarefas — ${d.name.replace('gtasks_','').replace(/_/g,' ')}`,execute:async(a:any)=>JSON.stringify(await run[d.name](a||{})).slice(0,30000)}));
}

const pkce=()=>{const verifier=randomBytes(48).toString('base64url');return {verifier,challenge:createHash('sha256').update(verifier).digest('base64url')};};
async function startNativeGoogle(c:any,entry:CatalogEntry){
 const client=await googleClient();if(!client)throw new Error('Configure o Google antes de conectar.');
 const {verifier,challenge}=pkce(),oauth={fixedRedirect:true,state:newState(c.id),state_expires_at:Date.now()+15*60*1000,verifier};await saveOAuth(c.id,oauth);
 const url=new URL(google().authorize);for(const [k,v] of Object.entries({client_id:client.client_id,redirect_uri:fixedCallback(),response_type:'code',scope:entry.scopes!.join(' '),access_type:'offline',prompt:'consent',include_granted_scopes:'true',state:oauth.state,code_challenge:challenge,code_challenge_method:'S256'}))url.searchParams.set(k,v);
 return url.toString();
}
async function finishNativeGoogle(c:any,oauth:any,code:string){
 const client=await googleClient();if(!client)throw new Error('Configure o Google antes de conectar.');
 const res=await fetch(google().token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code,client_id:client.client_id,client_secret:client.client_secret,redirect_uri:fixedCallback(),code_verifier:oauth.verifier}),signal:AbortSignal.timeout(15000)});
 if(!res.ok)throw new Error('O Google recusou a autorização: '+(await res.text()).slice(0,200));
 const t=await res.json() as any;oauth.tokens={access_token:t.access_token,refresh_token:t.refresh_token,expires_at:Date.now()+(t.expires_in||3600)*1000};delete oauth.verifier;await saveOAuth(c.id,oauth);
 await query("UPDATE connections SET status='connected',tools=$2,read_tools=$3 WHERE id=$1",[c.id,JSON.stringify(googleTasksDefs.map(d=>({name:d.name,description:d.description,inputSchema:d.parameters}))),JSON.stringify(googleTasksDefs.filter(d=>!d.write).map(d=>d.name))]);
}

export function registerConnectors(app:FastifyInstance){
 app.get('/api/connectors',async()=>{
  const rows=await query('SELECT id,catalog_key,status,jsonb_array_length(tools) AS tools FROM connections WHERE catalog_key IS NOT NULL');
  const client=await googleClient();
  return {googleConfigured:!!client,googleClientId:client?.client_id||'',redirectUri:fixedCallback(),connectors:catalog.map(e=>{const c=rows.find(r=>r.catalog_key===e.key);return {key:e.key,name:e.name,description:e.description,category:e.category,color:e.color,auth:e.auth,preview:!!e.preview,manualReturn:!!e.loopback,connectionId:c?.id||null,status:c?.status||'disconnected',tools:c?.tools||0};})};
 });
 app.put('/api/connectors/google',async req=>{
  const d=z.object({clientId:z.string().trim().regex(/^[\w.-]+\.apps\.googleusercontent\.com$/,'Client ID do Google inválido (termina em .apps.googleusercontent.com).'),clientSecret:z.string().trim().min(10).max(200).optional()}).parse(req.body);
  const prev=await googleClient();if(!d.clientSecret&&!prev)throw new Error('Informe o Client Secret.');
  await query("INSERT INTO oauth_clients(provider,client_id,client_secret) VALUES('google',$1,$2) ON CONFLICT(provider) DO UPDATE SET client_id=$1,client_secret=$2,updated_at=now()",[d.clientId,encrypt(d.clientSecret||prev!.client_secret)]);
  return {ok:true};
 });
 app.delete('/api/connectors/google',async()=>{await query("DELETE FROM oauth_clients WHERE provider='google'");return {ok:true};});
 // One click: create (or reuse) the connection and start its OAuth flow. Public servers connect directly.
 app.post('/api/connectors/:key/connect',async req=>{
  const entry=catalog.find(e=>e.key===(req.params as any).key);if(!entry)throw new Error('Conector desconhecido.');
  if(entry.auth!=='oauth'&&!(await googleClient()))throw new Error('Configure o Google uma vez antes de conectar os serviços do Google.');
  const native=entry.auth==='google-native';
  let c=await one('SELECT * FROM connections WHERE catalog_key=$1',[entry.key]);
  if(!c)c=await one("INSERT INTO connections(name,url,catalog_key,all_agents,kind,read_tools) VALUES($1,$2,$3,true,$4,'[]') RETURNING *",[entry.name,native?google().tasks:urlOf(entry),entry.key,native?'native':'mcp']);
  await query("UPDATE connections SET status='connecting' WHERE id=$1",[c.id]);
  if(native)return {authorizationUrl:await startNativeGoogle(c,entry)};
  const oauth:any={fixedRedirect:true,state:newState(c.id),state_expires_at:Date.now()+15*60*1000,...(entry.loopback?{loopback:true}:{})};
  if(entry.auth==='google'){const g=(await googleClient())!;oauth.client={client_id:g.client_id,client_secret:g.client_secret,redirect_uris:[fixedCallback()],token_endpoint_auth_method:'client_secret_post'};oauth.staticClient=true;oauth.scope=entry.scopes!.join(' ');}
  await saveOAuth(c.id,oauth);
  // Catalog apps always authorize first (fresh state each click); tools are listed only with a token.
  try{const url=await startAuthorization({...c,oauth:encrypt(oauth)});if(url)return {authorizationUrl:url,manualReturn:!!entry.loopback};const tools=await discover(await one('SELECT * FROM connections WHERE id=$1',[c.id]));await event('connection',{id:c.id});return {connected:true,tools:tools.length};}
  catch(e){
   const after=decrypt<any>((await one('SELECT oauth FROM connections WHERE id=$1',[c.id])).oauth);
   if(after.authorizationUrl)return {authorizationUrl:after.authorizationUrl,manualReturn:!!entry.loopback};
   await query("UPDATE connections SET status='error' WHERE id=$1",[c.id]);throw new Error(`Não foi possível conectar ${entry.name}: ${safeError(e)}`);
  }
 });
 app.delete('/api/connectors/:key',async req=>{await query('DELETE FROM connections WHERE catalog_key=$1',[(req.params as any).key]);await event('connection',{key:(req.params as any).key});return {ok:true};});
 const callbacks=new Map<string,Promise<{key?:string;error?:string}>>();
 const completeCallback=async(state:string,code:string):Promise<{key?:string;error?:string}>=>{
 const c=await one('SELECT * FROM connections WHERE id=$1',[state.split('.')[0]]);const oauth=c?.oauth?decrypt<any>(c.oauth):null;
 if(!oauth?.state||!safeEqual(oauth.state,state))return {error:'Autorização expirada. Tente conectar de novo.'};
 if(oauth.state_expires_at&&Date.now()>oauth.state_expires_at)return {error:'Autorização expirada. Tente conectar de novo.'};
 delete oauth.state;delete oauth.state_expires_at;await saveOAuth(c.id,oauth);
 try{
  if(c.kind==='native')await finishNativeGoogle(c,oauth,code);
  else{await finishOAuth(c,code);await discover(await one('SELECT * FROM connections WHERE id=$1',[c.id]));}
 }catch(e){await query("UPDATE connections SET status='error' WHERE id=$1",[c.id]);return {error:safeError(e)};}
 await event('connection',{id:c.id});return {key:String(c.catalog_key||c.id)};
 };
 // Single OAuth callback for catalog connections. Protected by the random state (no session needed, so connecting from the
 // LAN address still completes even though the provider returns to the public address).
 app.get('/api/connections/oauth/callback',async(req,reply)=>{
  const q=req.query as any,fail=(m:string)=>reply.redirect('/?connector_error='+encodeURIComponent(m.slice(0,200)));
  if(q.error)return fail(q.error_description||q.error);
  const parsed=z.object({code:z.string().min(1),state:z.string().regex(/^[0-9a-f-]{36}\.[0-9a-f]+$/)}).safeParse(q);if(!parsed.success)return fail('Retorno de autorização inválido.');
  // Android delivers the same return twice when the installed app takes over the link; the code is single-use, so the
  // repeat must reuse the first exchange instead of failing and marking the connection as broken.
  let pending=callbacks.get(parsed.data.state);
  if(!pending){pending=completeCallback(parsed.data.state,parsed.data.code);callbacks.set(parsed.data.state,pending);setTimeout(()=>callbacks.delete(parsed.data.state),10*60000).unref();}
  const r=await pending;return r.error?fail(r.error):reply.redirect('/?connected='+encodeURIComponent(r.key!));
 });
 // Loopback-return apps: the owner pastes the address of the unreachable page the provider sent them to.
 app.post('/api/connectors/:key/complete',async req=>{
  const entry=catalog.find(e=>e.key===(req.params as any).key);if(!entry)throw new Error('Conector desconhecido.');
  let back:URL;try{back=new URL(z.object({url:z.string().trim().min(10).max(4000)}).parse(req.body).url);}catch{throw new Error('Cole o endereço completo da página (começa com http://127.0.0.1).');}
  if(back.searchParams.get('error'))throw new Error(back.searchParams.get('error_description')||back.searchParams.get('error')!);
  const code=back.searchParams.get('code'),state=back.searchParams.get('state')||'';
  const c=await one('SELECT id FROM connections WHERE catalog_key=$1',[entry.key]);
  if(!code||!c||!state.startsWith(c.id+'.'))throw new Error('Este endereço não tem a autorização do '+entry.name+'. Copie o endereço da página aberta depois de autorizar.');
  let pending=callbacks.get(state);
  if(!pending){pending=completeCallback(state,code);callbacks.set(state,pending);setTimeout(()=>callbacks.delete(state),10*60000).unref();}
  const res=await pending;if(res.error)throw new Error(res.error);
  const row=await one('SELECT jsonb_array_length(tools) AS tools FROM connections WHERE id=$1',[c.id]);return {connected:true,tools:row.tools};
 });
}
