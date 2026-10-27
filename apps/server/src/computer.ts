import { z } from 'zod';
import { createHash } from 'node:crypto';
import { Client } from 'ssh2';
import { one,query } from './db.js';
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
  {name:'pc_run',app:'computador',write:true,target:'Comando no computador',
   description:'Roda um comando num computador conectado, com o usuário configurado e sem administrador: PowerShell nos computadores Windows, bash nos Linux. Sempre pede aprovação, mostrando o computador e o comando. Prefira comandos curtos e explique o que fazem em reason. A saída volta limitada a 20 mil caracteres.',
   parameters:object({...(many?{computer:which}:{}),command:{type:'string',description:'Script (PowerShell ou bash, conforme o computador)'},cwd:{type:'string',description:'Pasta onde rodar (opcional)'},timeoutSeconds:{type:'number',description:'Limite em segundos (padrão 60, máximo 600)'},reason:{type:'string',description:'O que o comando faz, em uma frase'}},[...(many?['computer']:[]),'command','reason']),
   execute:async(a)=>{const x=z.object({computer:z.string().optional(),command:z.string().trim().min(1).max(20000),cwd:z.string().max(500).optional(),timeoutSeconds:z.number().min(1).max(600).optional(),reason:z.string().max(500).optional()}).parse(a);
    // Current list, not the one from when the tools were built: a computer removed or re-keyed meanwhile must not run.
    const c=await pick(await listComputers(),x.computer),limit=x.timeoutSeconds||60;let r:any;
    if(c.kind==='local')r=await hostCall('/run',{command:x.command,cwd:x.cwd,timeoutSeconds:limit},(limit+15)*1000);
    else{const cmd=x.cwd?(c.shell==='bash'?`cd '${x.cwd.replace(/'/g,`'\\''`)}' && ${x.command}`:`Set-Location -LiteralPath '${x.cwd.replace(/'/g,"''")}'; ${x.command}`):x.command;r=await sshExec(sshTarget(c.row),wrap(c.shell,cmd),limit*1000);}
    return JSON.stringify({computer:c.name,exitCode:r.exitCode,ok:r.exitCode===0&&!r.timedOut,...(r.timedOut?{note:'Tempo esgotado: o comando foi encerrado.'}:{}),stdout:r.stdout,...(r.stderr?{stderr:r.stderr}:{}),...(r.truncated?{truncated:true}:{}),seconds:Math.round(r.ms/100)/10});}},
 ];
}
