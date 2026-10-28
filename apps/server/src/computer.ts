import { z } from 'zod';
import crypto,{ createHash } from 'node:crypto';
import { Client } from 'ssh2';
import { one,query,event } from './db.js';
import { sendPush } from './push.js';
import { encrypt,decrypt } from './security.js';
import type { Tool } from './tools.js';

// Computers the agents can run commands on: this Windows computer through the Cell Host (host/cell-host.mjs, installed
// with scripts/host.ps1) and any number of machines over SSH (Linux with bash, or Windows OpenSSH with PowerShell).
// The tools belong to the "computador" app (loaded on demand), every command waits for the owner's approval, and the
// owner can switch commands off in Settings → Computador. SSH host keys are pinned when the computer is added.
const host=()=>({url:process.env.CELL_HOST_URL||'',token:process.env.CELL_HOST_TOKEN||''});
export const hostConfigured=()=>!!(host().url&&host().token);
// The owner's on/off switch for commands (Settings → Computador), and whether there is any computer to use.
export async function commandsSwitchOn(){return ((await one('SELECT value FROM settings WHERE id=1'))?.value?.computerCommands??true)!==false;}
export async function commandsEnabled(){return await commandsSwitchOn()&&(await listComputers()).length>0;}

export type Computer={key:string;id:string;name:string;kind:'local'|'ssh';shell:'powershell'|'bash';row?:any};
const slug=(s:string)=>s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'pc';
export async function listComputers():Promise<Computer[]>{
 const list:Computer[]=[];if(hostConfigured())list.push({key:'este-pc',id:'local',name:'Este computador',kind:'local',shell:'powershell'});
 for(const row of await query('SELECT * FROM computers WHERE enabled ORDER BY created_at')){let key=slug(row.name);while(list.some(c=>c.key===key))key+='-2';list.push({key,id:row.id,name:row.name,kind:'ssh',shell:row.shell,row});}
 return list;
}

// --- Cell Host (this computer)
async function hostCall(path:string,body?:any,timeoutMs=15000){
 const {url,token}=host();let res:Response;
 try{res=await fetch(url+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(timeoutMs)});}
 catch{throw new Error('Este computador não respondeu. Confira se ele está ligado, com você logado no Windows, e se o Cell Host está rodando (ícone na bandeja).');}
 const data=await res.json().catch(()=>({})) as any;
 if(!res.ok)throw new Error(res.status===401?'O Cell Host recusou o token. Rode scripts/host.ps1 de novo e depois o deploy.':`Cell Host: ${data.error||res.status}`);
 return data;
}
export const hostStatus=()=>hostCall('/status',undefined,5000);
// Internal PowerShell on this computer (Recycle Bin for approved deletions); not a tool, so no separate approval.
export const hostRun=(command:string,timeoutSeconds=60)=>hostCall('/run',{command,timeoutSeconds},(timeoutSeconds+15)*1000);

// --- SSH
export type SshTarget={host:string;port:number;username:string;password?:string;privateKey?:string;passphrase?:string;fingerprint?:string};
export const sshFingerprint=(key:Buffer)=>'SHA256:'+createHash('sha256').update(key).digest('base64').replace(/=+$/,'');
const MAX_OUTPUT=20000;
// Runs one command. With target.fingerprint set, any other host key is refused (possible impersonation).
export function sshExec(t:SshTarget,command:string,timeoutMs=60000):Promise<{exitCode:number;stdout:string;stderr:string;timedOut:boolean;truncated:boolean;ms:number;fingerprint:string}>{
 return new Promise((resolve,reject)=>{
  const conn=new Client(),started=Date.now();let fingerprint='',stdout='',stderr='',truncated=false,timedOut=false,settled=false;
  const done=(fn:()=>void)=>{if(settled)return;settled=true;clearTimeout(timer);conn.end();fn();};
  const take=(cur:string,chunk:Buffer)=>{const next=cur+chunk.toString('utf8');if(next.length>MAX_OUTPUT){truncated=true;return next.slice(0,MAX_OUTPUT);}return next;};
  const timer=setTimeout(()=>{timedOut=true;done(()=>resolve({exitCode:-1,stdout:stdout.trim(),stderr:stderr.trim(),timedOut,truncated,ms:Date.now()-started,fingerprint}));},timeoutMs);
  conn.on('ready',()=>conn.exec(command,(err,stream)=>{
   if(err)return done(()=>reject(new Error('SSH: '+err.message)));
   stream.on('data',(c:Buffer)=>{stdout=take(stdout,c);});stream.stderr.on('data',(c:Buffer)=>{stderr=take(stderr,c);});
   stream.on('close',(code:number|null)=>done(()=>resolve({exitCode:code??-1,stdout:stdout.trim(),stderr:stderr.trim(),timedOut,truncated,ms:Date.now()-started,fingerprint})));
  }));
  conn.on('error',(e:any)=>done(()=>reject(new Error(e?.level==='client-authentication'?'SSH: usuário, senha ou chave recusados.':fingerprint&&t.fingerprint&&fingerprint!==t.fingerprint?`SSH: a impressão digital do servidor mudou (esperada ${t.fingerprint}, recebida ${fingerprint}). Conexão recusada.`:`SSH: ${e?.message||e}`))));
  try{conn.connect({host:t.host,port:t.port||22,username:t.username,password:t.password,privateKey:t.privateKey,passphrase:t.passphrase,readyTimeout:Math.min(timeoutMs,15000),
   hostVerifier:(key:Buffer)=>{fingerprint=sshFingerprint(key);return !t.fingerprint||fingerprint===t.fingerprint;}} as any);}
  catch(e:any){done(()=>reject(new Error('SSH: '+(e?.message||e))));}
 });
}
// PowerShell over SSH travels encoded, so quotes and line breaks need no escaping (same as the Cell Host).
const wrap=(shell:string,command:string)=>shell==='powershell'?`powershell -NoLogo -NoProfile -NonInteractive -EncodedCommand ${Buffer.from('[Console]::OutputEncoding=[Text.Encoding]::UTF8;$ProgressPreference="SilentlyContinue";\n'+command,'utf16le').toString('base64')}`:command;
const statusScript:Record<string,string>={
 bash:`echo "computer=$(hostname)"; echo "user=$(whoami)"; echo "os=$( (. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME") || uname -sr)"; echo "uptime=$(cut -d' ' -f1 /proc/uptime 2>/dev/null)"; echo "mem=$(awk '/MemTotal/{t=$2}/MemAvailable/{a=$2}END{print t" "a}' /proc/meminfo 2>/dev/null)"; echo "cpus=$(nproc 2>/dev/null)"`,
 powershell:`$o=Get-CimInstance Win32_OperatingSystem; "computer=$env:COMPUTERNAME"; "user=$env:USERNAME"; "os=$($o.Caption)"; "uptime=$([int]((Get-Date)-$o.LastBootUpTime).TotalSeconds)"; "mem=$($o.TotalVisibleMemorySize) $($o.FreePhysicalMemory)"; "cpus=$env:NUMBER_OF_PROCESSORS"`,
};
function parseStatus(text:string){
 const v=Object.fromEntries(text.split(/\r?\n/).map(l=>l.split('=')).filter(p=>p.length>1).map(([k,...r])=>[k.trim(),r.join('=').trim()]));
 const [total,free]=String(v.mem||'').split(/\s+/).map(Number);
 return {computer:v.computer||'',user:v.user||'',os:v.os||'',uptimeHours:Math.round((Number(v.uptime)||0)/360)/10,memory:{totalGb:Math.round((total||0)/1e5)/10,freeGb:Math.round((free||0)/1e5)/10},cpus:Number(v.cpus)||0};
}
const sshTarget=(row:any):SshTarget=>({host:row.host,port:row.port,username:row.username,fingerprint:row.fingerprint,...decrypt<any>(row.auth)});
export async function sshStatus(t:SshTarget,shell:string){const r=await sshExec(t,wrap(shell,statusScript[shell]),12000);if(r.exitCode!==0&&!r.stdout)throw new Error(r.stderr||'O comando de estado falhou.');return {info:parseStatus(r.stdout),fingerprint:r.fingerprint};}

// Status of every computer, checked in parallel. SSH computers remember when they were last seen.
export async function computersStatus(){
 return Promise.all((await listComputers()).map(async c=>{
  const base={key:c.key,id:c.id,name:c.name,kind:c.kind,shell:c.shell,...(c.row?{host:c.row.host,port:c.row.port,username:c.row.username,fingerprint:c.row.fingerprint}:{})};
  try{
   const info=c.kind==='local'?await hostStatus():(await sshStatus(sshTarget(c.row),c.shell)).info;
   if(c.row)await query('UPDATE computers SET info=$2,last_seen=now() WHERE id=$1',[c.id,JSON.stringify(info)]);
   return {...base,online:true,info,lastSeen:new Date().toISOString()};
  }catch(e:any){return {...base,online:false,error:String(e?.message||e),info:c.row?.info||null,lastSeen:c.row?.last_seen||null};}
 }));
}
export const sshInput=z.object({name:z.string().trim().min(1).max(60),host:z.string().trim().min(1).max(255).regex(/^[A-Za-z0-9.:_-]+$/,'Endereço inválido.'),port:z.number().int().min(1).max(65535).default(22),username:z.string().trim().min(1).max(100),
 password:z.string().max(500).optional(),privateKey:z.string().max(20000).optional(),passphrase:z.string().max(500).optional(),shell:z.enum(['bash','powershell']).default('bash'),fingerprint:z.string().max(200).optional()}).refine(x=>x.password||x.privateKey,'Informe a senha ou a chave privada.');
export const sshAuth=(x:z.infer<typeof sshInput>)=>encrypt({...(x.password?{password:x.password}:{}),...(x.privateKey?{privateKey:x.privateKey,...(x.passphrase?{passphrase:x.passphrase}:{})}:{})});

const object=(properties:any,required:string[])=>({type:'object',properties,required,additionalProperties:false});
async function pick(computers:Computer[],key?:string){
 if(!key){if(computers.length===1)return computers[0];throw new Error('Informe o computador: '+computers.map(c=>c.key).join(', ')+'.');}
 const c=computers.find(x=>x.key===key);if(!c)throw new Error(`Computador desconhecido: ${key}. Disponíveis: ${computers.map(x=>x.key).join(', ')}.`);return c;
}
export async function computerTools():Promise<Tool[]>{
 const computers=await listComputers();if(!computers.length)return [];
 const which={type:'string',enum:computers.map(c=>c.key),description:'Computador: '+computers.map(c=>`${c.key} = ${c.name} (${c.kind==='local'?'Windows, PowerShell':c.shell==='bash'?'Linux, bash':'Windows, PowerShell'})`).join('; ')};
 const many=computers.length>1;
 return [
  {name:'pc_status',app:'computador',write:false,description:'Mostra o estado dos computadores conectados (ligado ou não, nome, usuário, sistema, tempo ligado, memória). Sem computer, mostra todos.',parameters:object({computer:which},[]),
   execute:async(a)=>{const x=z.object({computer:z.string().optional()}).parse(a);const all=await computersStatus();return JSON.stringify(x.computer?all.filter(c=>c.key===x.computer):all);}},
  {name:'pc_job',app:'computador',write:false,description:'Mostra as tarefas em segundo plano (as mais recentes ou uma pelo jobId), com o estado e o fim da saída.',parameters:object({jobId:{type:'string'}},[]),
   execute:async(a)=>{const x=z.object({jobId:z.string().uuid().optional()}).parse(a);
    const rows=x.jobId?await query('SELECT * FROM computer_jobs WHERE id=$1',[x.jobId]):await query('SELECT * FROM computer_jobs ORDER BY started_at DESC LIMIT 10');
    return JSON.stringify(await Promise.all(rows.map(async j=>{let live:any=null;if(j.status==='running'){try{live=await jobState(j);}catch{}}
     return {jobId:j.id,computer:j.computer_name,command:j.command.slice(0,300),status:j.status==='running'&&live&&!live.running?'finishing':j.status,exitCode:j.exit_code,startedAt:j.started_at,finishedAt:j.finished_at,output:(live?.output??j.output).slice(-4000)};})));}},
  {name:'pc_run',app:'computador',write:true,target:'Comando no computador',
   description:'Roda um comando num computador conectado, com o usuário configurado e sem administrador: PowerShell nos computadores Windows, bash nos Linux. Sempre pede aprovação, mostrando o computador e o comando. Prefira comandos curtos e explique o que fazem em reason. A saída volta limitada a 20 mil caracteres.',
   parameters:object({...(many?{computer:which}:{}),command:{type:'string',description:'Script (PowerShell ou bash, conforme o computador)'},cwd:{type:'string',description:'Pasta onde rodar (opcional)'},timeoutSeconds:{type:'number',description:'Limite em segundos (padrão 60, máximo 600)'},background:{type:'boolean',description:'true para tarefas longas (backup, download, compactação): roda em segundo plano, sem limite de tempo; o usuário é avisado quando terminar e você acompanha com pc_job'},reason:{type:'string',description:'O que o comando faz, em uma frase'}},[...(many?['computer']:[]),'command','reason']),
   execute:async(a,run)=>{const x=z.object({computer:z.string().optional(),command:z.string().trim().min(1).max(20000),cwd:z.string().max(500).optional(),timeoutSeconds:z.number().min(1).max(600).optional(),background:z.boolean().optional(),reason:z.string().max(500).optional()}).parse(a);
    // Current list, not the one from when the tools were built: a computer removed or re-keyed meanwhile must not run.
    const c=await pick(await listComputers(),x.computer),limit=x.timeoutSeconds||60;let r:any;
    if(x.background){
     // Idempotent per tool call: a retried step must not start the job twice.
     const existing=run?.callId?await one('SELECT id FROM computer_jobs WHERE call_id=$1',[run.callId]):null;
     const jobId=existing?.id||(await one('INSERT INTO computer_jobs(computer_key,computer_name,computer_id,remote_id,call_id,agent_id,conversation_id,command,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',[c.key,c.name,c.id,await startJob(c,x.command,x.cwd),run?.callId||null,run?.agent_id||null,run?.conversation_id||null,x.command,x.reason||null])).id;
     return JSON.stringify({computer:c.name,background:true,jobId,note:'Tarefa iniciada em segundo plano. O usuário será avisado quando terminar; acompanhe com pc_job.'});
    }
    if(c.kind==='local')r=await hostCall('/run',{command:x.command,cwd:x.cwd,timeoutSeconds:limit},(limit+15)*1000);
    else{const cmd=x.cwd?(c.shell==='bash'?`cd '${x.cwd.replace(/'/g,`'\\''`)}' && ${x.command}`:`Set-Location -LiteralPath '${x.cwd.replace(/'/g,"''")}'; ${x.command}`):x.command;r=await sshExec(sshTarget(c.row),wrap(c.shell,cmd),limit*1000);}
    return JSON.stringify({computer:c.name,exitCode:r.exitCode,ok:r.exitCode===0&&!r.timedOut,...(r.timedOut?{note:'Tempo esgotado: o comando foi encerrado.'}:{}),stdout:r.stdout,...(r.stderr?{stderr:r.stderr}:{}),...(r.truncated?{truncated:true}:{}),seconds:Math.round(r.ms/100)/10});}},
 ];
}

// --- Background jobs. Started by pc_run with background=true (after approval); the worker follows them (pollJobs) and
// posts the result in the conversation with a phone notification. Linux runs them detached with setsid/nohup under
// /tmp/cell-job-<id>.*; this computer runs them in the Cell Host. Windows over SSH has no background mode.
const sq=(s:string)=>`'${s.replace(/'/g,`'\''`)}'`;
const jobFile=(id:string)=>`/tmp/cell-job-${id.replace(/[^a-f0-9-]/g,'')}`;
export async function startJob(c:Computer,command:string,cwd?:string){
 if(c.kind==='local'){const j=await hostCall('/jobs',{command,cwd},20000);return j.id as string;}
 if(c.shell!=='bash')throw new Error('Tarefas em segundo plano por SSH só funcionam em computadores Linux. Rode sem background.');
 const id=crypto.randomUUID(),f=jobFile(id),script=(cwd?`cd ${sq(cwd)} || exit 1\n`:'')+command;
 const start=`echo ${Buffer.from(script,'utf8').toString('base64')} | base64 -d > ${f}.sh && setsid nohup bash -c 'bash ${f}.sh > ${f}.log 2>&1; echo $? > ${f}.exit' > /dev/null 2>&1 < /dev/null & echo $! > ${f}.pid; echo started`;
 const r=await sshExec(sshTarget(c.row),start,20000);if(!r.stdout.includes('started'))throw new Error('Não foi possível iniciar a tarefa: '+(r.stderr||r.stdout).slice(0,300));
 return id;
}
export type JobState={running:boolean;exitCode:number|null;cancelled?:boolean;output:string;lost?:boolean};
export async function jobState(job:any):Promise<JobState>{
 const c=(await listComputers()).find(x=>x.id===job.computer_id);if(!c)return {running:false,exitCode:null,output:job.output,lost:true};
 if(c.kind==='local'){
  try{const j=await hostCall('/jobs/'+job.remote_id,undefined,10000);return {running:j.running,exitCode:j.exitCode,cancelled:j.cancelled,output:j.output};}
  catch(e:any){if(/não encontrada/.test(String(e?.message)))return {running:false,exitCode:null,output:job.output,lost:true};throw e;}
 }
 const f=jobFile(job.remote_id);
 const r=await sshExec(sshTarget(c.row),`if [ -f ${f}.exit ]; then echo "__EXIT__=$(cat ${f}.exit)"; elif [ -f ${f}.pid ] && kill -0 $(cat ${f}.pid) 2>/dev/null; then echo "__RUNNING__"; else echo "__LOST__"; fi; echo "__OUT__"; tail -c 8000 ${f}.log 2>/dev/null`,15000);
 const [head,...rest]=r.stdout.split('__OUT__'),output=rest.join('__OUT__').replace(/^\r?\n/,'');
 const exit=/__EXIT__=(-?\d+)/.exec(head);
 if(exit)return {running:false,exitCode:Number(exit[1]),output};
 if(head.includes('__RUNNING__'))return {running:true,exitCode:null,output};
 return {running:false,exitCode:null,output,lost:true};
}
export async function cancelJob(job:any){
 const c=(await listComputers()).find(x=>x.id===job.computer_id);if(!c)return;
 if(c.kind==='local'){await hostCall('/jobs/'+job.remote_id+'/cancel',{},10000);return;}
 const f=jobFile(job.remote_id);await sshExec(sshTarget(c.row),`[ -f ${f}.pid ] && kill -- -$(cat ${f}.pid) 2>/dev/null; kill $(cat ${f}.pid) 2>/dev/null; echo 130 > ${f}.exit`,15000);
}

// Follows running jobs (worker tick, every 10 s). When one ends, its result goes to the conversation it came from, with a
// phone notification when the agent's notifications are on.
export async function pollJobs(){
 for(const job of await query("SELECT * FROM computer_jobs WHERE status='running' ORDER BY started_at LIMIT 50")){
  let s:JobState;try{s=await jobState(job);}catch{continue;} // computer off for now: try again next tick
  if(s.running){if(s.output!==job.output)await query('UPDATE computer_jobs SET output=$2 WHERE id=$1',[job.id,s.output]);continue;}
  const status=s.lost?'lost':s.cancelled||s.exitCode===130?'cancelled':s.exitCode===0?'done':'failed';
  const row=await one("UPDATE computer_jobs SET status=$2,exit_code=$3,output=$4,finished_at=now() WHERE id=$1 AND status='running' RETURNING *",[job.id,status,s.exitCode,s.output]);
  if(!row||!row.conversation_id)continue;
  const title={done:'Tarefa concluída',failed:'Tarefa terminou com erro',cancelled:'Tarefa cancelada',lost:'Tarefa perdida'}[status];
  const out=s.output.trim().slice(-3000);
  const text=`**${title}** em ${row.computer_name}${status==='failed'?` (saída ${s.exitCode})`:''}${row.reason?` · ${row.reason}`:''}\n\n${status==='lost'?'O computador foi reiniciado ou o Cell Host foi reaberto durante a tarefa; não dá para saber se ela terminou.\n\n':''}${out?'```\n'+out.replace(/```/g,'ʼʼʼ')+'\n```':'Sem saída.'}`;
  await query("INSERT INTO messages(conversation_id,role,content) VALUES($1,'assistant',$2)",[row.conversation_id,text]);
  await event('message',{conversationId:row.conversation_id});
  const agent=row.agent_id?await one('SELECT name,notify FROM agents WHERE id=$1',[row.agent_id]):null;
  if(agent?.notify!==false)await sendPush({title:`${title} · ${row.computer_name}`,body:(row.reason||row.command).slice(0,160),url:`/?agent=${row.agent_id}&conversation=${row.conversation_id}`,tag:`job-${row.id}`}).catch(()=>{});
 }
}
