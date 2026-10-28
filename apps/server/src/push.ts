import webpush from 'web-push';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { one,query } from './db.js';
import { createHmac } from 'node:crypto';
import { encrypt,decrypt,appOrigins,safeError } from './security.js';
import { stripThinking } from '../../../packages/shared/src/index.js';

// One VAPID key pair per installation, created on first use. Both the API and the worker may race to create it.
let keys:{publicKey:string;privateKey:string}|null=null;
export async function vapidKeys(){
 if(keys)return keys;
 let row=await one('SELECT public_key,private_key FROM push_keys WHERE id=1');
 if(!row){const k=webpush.generateVAPIDKeys();await query('INSERT INTO push_keys(id,public_key,private_key) VALUES(1,$1,$2) ON CONFLICT(id) DO NOTHING',[k.publicKey,encrypt(k.privateKey)]);row=await one('SELECT public_key,private_key FROM push_keys WHERE id=1');}
 return keys={publicKey:row.public_key,privateKey:decrypt<string>(row.private_key)};
}
const subject=()=>{const o=appOrigins()[0]||'';return o.startsWith('https://')?o:'mailto:cell@localhost';};
export type PushPayload={title:string;body:string;url:string;tag:string;actions?:{action:string;title:string}[];quick?:Record<string,{url:string;decision:string;token:string}>};
// Token for the Approve/Deny buttons of a notification: valid for one approval and one decision, while it is pending.
export const approvalToken=(approvalId:string,decision:string)=>createHmac('sha256',String(process.env.SECRET_KEY||'')).update(`approval:${approvalId}:${decision}`).digest('hex');
// Sends to every subscribed device. Gone subscriptions (404/410) are removed; repeated failures too.
export async function sendPush(payload:PushPayload){
 const subs=await query('SELECT * FROM push_subscriptions');if(!subs.length)return {sent:0,failed:0};
 const k=await vapidKeys();let sent=0,failed=0;
 for(const s of subs){
  try{
   // The request is built (encrypted, VAPID-signed) by web-push and sent with fetch, which also allows a local test push service.
   const req=webpush.generateRequestDetails({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth}},JSON.stringify(payload),{vapidDetails:{subject:subject(),publicKey:k.publicKey,privateKey:k.privateKey},TTL:6*3600,urgency:'high',topic:payload.tag.replace(/[^A-Za-z0-9_-]/g,'').slice(0,32)});
   const res=await fetch(req.endpoint,{method:req.method,headers:req.headers as Record<string,string>,body:req.body as any,signal:AbortSignal.timeout(10000)});
   if(res.ok){sent++;await query('UPDATE push_subscriptions SET failures=0,last_success_at=now() WHERE id=$1',[s.id]);continue;}
   failed++;if([404,410].includes(res.status)){await query('DELETE FROM push_subscriptions WHERE id=$1',[s.id]);continue;}
   await query('UPDATE push_subscriptions SET failures=failures+1 WHERE id=$1',[s.id]);
  }catch(e){failed++;console.error('Falha ao enviar notificação push:',safeError(e));await query('UPDATE push_subscriptions SET failures=failures+1 WHERE id=$1',[s.id]);}
 }
 await query('DELETE FROM push_subscriptions WHERE failures>=5');
 return {sent,failed};
}
const plain=(text:string)=>stripThinking(text).replace(/```[\s\S]*?```/g,' ').replace(/[*_#>`|~]+/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/\s+/g,' ').trim();
const clip=(s:string,n:number)=>s.length>n?s.slice(0,n-1)+'…':s;
// What the approval is about, readable on a lock screen: the command and computer, the files, the folder.
function approvalSummary(tool:string,args:any,target:string|null){
 const a=args||{};
 if(tool==='pc_run')return `${a.background?'Tarefa em segundo plano':'Comando'}${a.computer?` em ${a.computer}`:''}: ${String(a.command||'').replace(/\s+/g,' ')}`;
 if(tool==='pc_delete')return `Excluir (vai para a Lixeira): ${(a.paths||[]).join(', ')}`;
 if(tool==='pc_move')return `Mover ${(a.moves||[]).length} item(ns): ${(a.moves||[]).slice(0,3).map((m:any)=>`${m.from} → ${m.to}`).join('; ')}`;
 if(tool==='pc_request_access')return `Acesso à pasta ${a.path}`;
 if(tool==='pc_rename')return `Renomear ${a.path} → ${a.newName}`;
 if(tool==='pc_write'||tool==='pc_save_file')return `${a.overwrite?'Substituir':'Criar'} ${a.path}`;
 if(tool==='pc_mkdir')return `Criar pasta ${a.path}`;
 return target||tool;
}
// Delay before notifying: if the conversation is opened on any device in the meantime (seen_at moves forward), no push is sent.
const delay=()=>Number(process.env.PUSH_DELAY_MS||10000);
export function notifyAnswer(runId:string){setTimeout(()=>{answerPush(runId).catch(e=>console.error('Falha na notificação:',safeError(e)));},delay());}
async function answerPush(runId:string){
 const m=await one(`SELECT m.content,m.created_at,c.id AS conversation_id,c.seen_at,c.agent_id,a.name AS agent_name,(SELECT i.content FROM messages i WHERE i.id=r.input_message_id) AS input
  FROM runs r JOIN messages m ON m.run_id=r.id AND m.role='assistant' JOIN conversations c ON c.id=r.conversation_id JOIN agents a ON a.id=c.agent_id WHERE r.id=$1 AND r.parent_id IS NULL AND a.notify`,[runId]);
 if(!m||new Date(m.seen_at)>=new Date(m.created_at))return;
 const routine=/^\[Rotina agendada: ([^\]]+)\]/.exec(m.input||'')?.[1];
 await sendPush({title:routine?`${m.agent_name} · ${routine}`:m.agent_name,body:clip(plain(m.content),180)||'Nova mensagem',url:`/?agent=${m.agent_id}&conversation=${m.conversation_id}`,tag:`conv-${m.conversation_id}`});
}
export function notifyApproval(runId:string){setTimeout(()=>{approvalPush(runId).catch(e=>console.error('Falha na notificação:',safeError(e)));},delay());}
async function approvalPush(runId:string){
 const a=await one(`SELECT ap.id AS approval_id,t.tool,t.target,t.args,r.conversation_id,r.agent_id,ag.name AS agent_name FROM approvals ap JOIN tool_calls t ON t.id=ap.call_id JOIN runs r ON r.id=t.run_id JOIN agents ag ON ag.id=r.agent_id
  WHERE t.run_id=$1 AND ap.status='pending' AND r.state='waiting_approval' AND ag.notify ORDER BY ap.created_at LIMIT 1`,[runId]);
 if(!a)return;
 const quick=Object.fromEntries((['approved','denied'] as const).map(d=>[d==='approved'?'approve':'deny',{url:`/api/approvals/${a.approval_id}/quick`,decision:d,token:approvalToken(a.approval_id,d)}]));
 await sendPush({title:`${a.agent_name} precisa da sua aprovação`,body:clip(approvalSummary(a.tool,a.args,a.target),240),url:`/?agent=${a.agent_id}&conversation=${a.conversation_id}`,tag:`approval-${runId}`,
  actions:[{action:'approve',title:'Aprovar'},{action:'deny',title:'Negar'}],quick});
}

export function registerPush(app:FastifyInstance){
 app.get('/api/push',async()=>({publicKey:(await vapidKeys()).publicKey,devices:(await query('SELECT id,label,failures,last_success_at,created_at,endpoint FROM push_subscriptions ORDER BY created_at')).map(({endpoint,...d})=>({...d,service:(()=>{try{return new URL(endpoint).host;}catch{return '';}})()}))}));
 const subscription=z.object({endpoint:z.string().url().max(2000),keys:z.object({p256dh:z.string().min(20).max(200),auth:z.string().min(8).max(100)}),label:z.string().max(120).default('')});
 app.post('/api/push/subscribe',async req=>{const s=subscription.parse(req.body);
  // Real push services are always HTTPS; plain HTTP is only accepted when explicitly allowed (tests).
  if(!s.endpoint.startsWith('https://')&&process.env.ALLOW_HTTP_PUSH!=='1')throw new Error('Endereço de notificação inválido.');
  const row=await one('INSERT INTO push_subscriptions(endpoint,p256dh,auth,label) VALUES($1,$2,$3,$4) ON CONFLICT(endpoint) DO UPDATE SET p256dh=$2,auth=$3,label=$4,failures=0 RETURNING id',[s.endpoint,s.keys.p256dh,s.keys.auth,s.label]);return {id:row.id};});
 app.post('/api/push/unsubscribe',async req=>{const {endpoint}=z.object({endpoint:z.string().max(2000)}).parse(req.body);await query('DELETE FROM push_subscriptions WHERE endpoint=$1',[endpoint]);return {ok:true};});
 app.delete('/api/push/devices/:id',async req=>{await query('DELETE FROM push_subscriptions WHERE id=$1',[z.string().uuid().parse((req.params as any).id)]);return {ok:true};});
 // Notification center: unread agent messages (top-level conversations, agents with notifications on) and pending approvals.
 app.get('/api/notifications',async()=>{
  const messages=await query(`SELECT 'message' AS kind,m.id,m.content AS text,m.created_at AS at,c.id AS conversation_id,c.title,a.id AS agent_id,a.name AS agent_name,a.color,a.shape,(SELECT i.content FROM messages i WHERE i.id=r.input_message_id) AS input
   FROM messages m JOIN conversations c ON c.id=m.conversation_id JOIN agents a ON a.id=c.agent_id LEFT JOIN runs r ON r.id=m.run_id
   WHERE m.role='assistant' AND m.created_at>c.seen_at AND c.archived_at IS NULL AND a.notify AND NOT a.archived AND r.parent_id IS NULL ORDER BY m.created_at DESC LIMIT 30`);
  const approvals=await query(`SELECT 'approval' AS kind,ap.id,COALESCE(t.target,t.tool) AS text,ap.created_at AS at,r.conversation_id,c.title,a.id AS agent_id,a.name AS agent_name,a.color,a.shape
   FROM approvals ap JOIN tool_calls t ON t.id=ap.call_id JOIN runs r ON r.id=t.run_id JOIN conversations c ON c.id=r.conversation_id JOIN agents a ON a.id=r.agent_id
   WHERE ap.status='pending' AND r.state='waiting_approval' AND a.notify ORDER BY ap.created_at DESC LIMIT 20`);
  const items=[...approvals,...messages].map(({input,...n}:any)=>({...n,routine:/^\[Rotina agendada: ([^\]]+)\]/.exec(input||'')?.[1]||null,text:clip(n.kind==='message'?plain(n.text):n.text,160)})).sort((x,y)=>new Date(y.at).getTime()-new Date(x.at).getTime());
  return {items,unread:items.length};
 });
 app.post('/api/notifications/read-all',async()=>{await query('UPDATE conversations SET seen_at=now() WHERE archived_at IS NULL');return {ok:true};});
 app.post('/api/push/test',async()=>{const r=await sendPush({title:'Cell',body:'Notificações ativadas. Você será avisado quando um agente ou uma rotina enviar mensagem.',url:'/',tag:'cell-test'});if(!r.sent&&!r.failed)throw new Error('Nenhum aparelho com notificações ativadas.');return r;});
}
