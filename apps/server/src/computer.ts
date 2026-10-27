import { z } from 'zod';
import { one } from './db.js';
import type { Tool } from './tools.js';

// Commands on the owner's computer through the Cell Host (host/cell-host.mjs), installed with scripts/host.ps1.
// The tools belong to the "computador" app, so they are loaded only when the model opens it with use_app, and every
// command waits for the owner's approval. The owner can switch them off in Settings → Computador.
const host=()=>({url:process.env.CELL_HOST_URL||'',token:process.env.CELL_HOST_TOKEN||''});
export const hostConfigured=()=>!!(host().url&&host().token);
export async function commandsEnabled(){return hostConfigured()&&((await one('SELECT value FROM settings WHERE id=1'))?.value?.computerCommands??true)!==false;}

async function call(path:string,body?:any,timeoutMs=15000){
 const {url,token}=host();
 let res:Response;
 try{res=await fetch(url+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(timeoutMs)});}
 catch{throw new Error('O computador não respondeu. Confira se ele está ligado, com você logado no Windows, e se o Cell Host está instalado (scripts/host.ps1).');}
 const data=await res.json().catch(()=>({})) as any;
 if(!res.ok)throw new Error(res.status===401?'O Cell Host recusou o token. Rode scripts/host.ps1 de novo e depois o deploy.':`Cell Host: ${data.error||res.status}`);
 return data;
}
export const hostStatus=()=>call('/status',undefined,5000);

const object=(properties:any,required:string[])=>({type:'object',properties,required,additionalProperties:false});
export function computerTools():Tool[]{
 return [
  {name:'pc_status',app:'computador',write:false,description:'Mostra o estado do computador: nome, usuário, sistema, tempo ligado, memória e processadores.',parameters:object({},[]),
   execute:async()=>JSON.stringify(await hostStatus())},
  {name:'pc_run',app:'computador',write:true,target:'Comando no computador',
   description:'Roda um comando PowerShell no computador do usuário, com o usuário dele e sem administrador. Sempre pede aprovação, mostrando o comando. Prefira comandos curtos e explique o que fazem em reason. Para excluir arquivos, use pc_delete. A saída volta limitada a 20 mil caracteres.',
   parameters:object({command:{type:'string',description:'Script PowerShell'},cwd:{type:'string',description:'Pasta onde rodar (opcional), como C:\\Users\\User\\Documents'},timeoutSeconds:{type:'number',description:'Limite em segundos (padrão 60, máximo 600)'},reason:{type:'string',description:'O que o comando faz, em uma frase'}},['command','reason']),
   execute:async(a)=>{const x=z.object({command:z.string().trim().min(1).max(20000),cwd:z.string().max(500).optional(),timeoutSeconds:z.number().min(1).max(600).optional(),reason:z.string().max(500).optional()}).parse(a);
    const r=await call('/run',{command:x.command,cwd:x.cwd,timeoutSeconds:x.timeoutSeconds||60},((x.timeoutSeconds||60)+15)*1000);
    return JSON.stringify({exitCode:r.exitCode,ok:r.exitCode===0&&!r.timedOut,...(r.timedOut?{note:'Tempo esgotado: o comando foi encerrado.'}:{}),stdout:r.stdout,...(r.stderr?{stderr:r.stderr}:{}),...(r.truncated?{truncated:true}:{}),seconds:Math.round(r.ms/100)/10});}},
 ];
}
