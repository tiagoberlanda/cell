import path from 'node:path';
import { readdir,stat,rename,mkdir,readFile,cp,rm } from 'node:fs/promises';
import { z } from 'zod';
import { one,query } from './db.js';
import { extractText } from './files.js';
import type { Tool } from './tools.js';

// Folders on the owner's computer. The worker sees the host drives under HOST_DRIVES_ROOT (C:\ → /host/c, mounted by
// compose.override.yaml from scripts/drives.ps1). Nothing is reachable until the owner approves an agent's access request
// for a folder; inside granted folders reading is free and every change still needs approval. There is no delete.
const root=()=>process.env.HOST_DRIVES_ROOT||'/host';
const blocked=(segment:string)=>segment.startsWith('.')||segment.startsWith('$')||/^system volume information$/i.test(segment);

// "k:/Pasta\\sub/" → {drive:'K',parts:['Pasta','sub']}; rejects relative paths, "..", hidden and system entries.
export function parseWindowsPath(input:string){
 const m=/^\s*([A-Za-z]):(?:[\\/](.*))?$/.exec(String(input||'').trim());
 if(!m)throw new Error('Informe o caminho completo, como K:\\Pasta\\Subpasta.');
 const parts=(m[2]||'').split(/[\\/]+/).map(p=>p.trim()).filter(Boolean);
 if(parts.some(p=>p==='..'||p==='.'))throw new Error('Caminho inválido.');
 if(parts.some(blocked))throw new Error('Pastas e arquivos ocultos ou de sistema não podem ser acessados.');
 return {drive:m[1].toUpperCase(),parts};
}
export const formatWindowsPath=(p:{drive:string;parts:string[]})=>`${p.drive}:\\${p.parts.join('\\')}`;
const toHost=(p:{drive:string;parts:string[]})=>path.posix.join(root(),p.drive.toLowerCase(),...p.parts);
const inside=(grant:{drive:string;parts:string[]},p:{drive:string;parts:string[]})=>grant.drive===p.drive&&grant.parts.length<=p.parts.length&&grant.parts.every((s,i)=>s.toLowerCase()===p.parts[i].toLowerCase());

export async function mountedDrives(){try{return (await readdir(root())).filter(d=>/^[a-z]$/.test(d)).map(d=>d.toUpperCase()).sort();}catch{return [];}}
async function grantFor(agentId:string,input:string){
 const p=parseWindowsPath(input);
 for(const g of await query('SELECT path FROM host_grants WHERE agent_id=$1',[agentId]))if(inside(parseWindowsPath(g.path),p))return p;
 throw new Error(`Sem acesso a ${formatWindowsPath(p)}. Peça acesso à pasta com pc_request_access e aguarde a aprovação.`);
}
const exists=(file:string)=>stat(file).then(()=>true,()=>false);
async function moveItem(from:string,to:string){
 try{await rename(from,to);}
 catch(e:any){if(e?.code!=='EXDEV')throw e;await cp(from,to,{recursive:true,errorOnExist:true,force:false});await rm(from,{recursive:true});}
}
const object=(properties:any,required:string[])=>({type:'object',properties,required,additionalProperties:false});
const pathArg={type:'string',description:'Caminho completo no Windows, como K:\\Pasta\\arquivo.pdf'};

export function hostFileTools():Tool[]{
 return [
  {name:'pc_request_access',description:'Pede ao usuário acesso a uma pasta do computador dele (com subpastas). Use antes de listar, ler ou organizar arquivos ali. Só vale depois que o usuário aprovar.',parameters:object({path:pathArg,reason:{type:'string',description:'Para que você precisa da pasta'}},['path']),write:true,target:'Pastas do computador',
   execute:async(a,r)=>{const x=z.object({path:z.string().min(2).max(500),reason:z.string().max(500).optional()}).parse(a);const p=parseWindowsPath(x.path);
    const info=await stat(toHost(p)).catch(()=>null);if(!info?.isDirectory())throw new Error(`Pasta não encontrada no computador: ${formatWindowsPath(p)}.`);
    const win=formatWindowsPath(p);await query('INSERT INTO host_grants(agent_id,path) VALUES($1,$2) ON CONFLICT(agent_id,lower(path)) DO NOTHING',[r.agent_id,win]);
    return JSON.stringify({granted:win,message:'Acesso concedido. Ler e listar não pedem aprovação; mover, renomear e criar pastas pedem.'});}},
  {name:'pc_list',description:'Lista o conteúdo de uma pasta liberada do computador. recursive=true percorre subpastas (até 5 níveis e 2000 itens).',parameters:object({path:pathArg,recursive:{type:'boolean'}},['path']),write:false,
   execute:async(a,r)=>{const x=z.object({path:z.string().min(2).max(500),recursive:z.boolean().optional()}).parse(a);const p=await grantFor(r.agent_id,x.path);
    const entries:any[]=[];let truncated=false;
    const walk=async(dir:string,rel:string[],depth:number)=>{
     let items;try{items=await readdir(dir,{withFileTypes:true});}catch{throw new Error(`Pasta não encontrada: ${formatWindowsPath({drive:p.drive,parts:[...p.parts,...rel]})}.`);}
     for(const it of items){if(blocked(it.name))continue;if(entries.length>=(x.recursive?2000:300)){truncated=true;return;}
      const full=path.posix.join(dir,it.name),info=await stat(full).catch(()=>null);if(!info)continue;
      entries.push({path:[...rel,it.name].join('\\'),type:it.isDirectory()?'pasta':'arquivo',...(it.isDirectory()?{}:{size:info.size}),modified:info.mtime.toISOString().slice(0,16)});
      if(x.recursive&&it.isDirectory()&&depth<5)await walk(full,[...rel,it.name],depth+1);}
    };
    await walk(toHost(p),[],1);return JSON.stringify({folder:formatWindowsPath(p),entries,truncated});}},
  {name:'pc_read',description:'Lê o texto de um arquivo numa pasta liberada (txt, md, csv, json, pdf, docx; até 20 mil caracteres). Outros formatos retornam só tamanho e data.',parameters:object({path:pathArg},['path']),write:false,
   execute:async(a,r)=>{const x=z.object({path:z.string().min(2).max(500)}).parse(a);const p=await grantFor(r.agent_id,x.path);const file=toHost(p);
    const info=await stat(file).catch(()=>null);if(!info?.isFile())throw new Error(`Arquivo não encontrado: ${formatWindowsPath(p)}.`);
    const name=p.parts.at(-1)||'';if(/^\.env/i.test(name))throw new Error('Arquivos de configuração com segredos não podem ser lidos.');
    const meta={file:formatWindowsPath(p),size:info.size,modified:info.mtime.toISOString().slice(0,16)};
    if(info.size>25*1024*1024)return JSON.stringify({...meta,note:'Arquivo grande demais para ler (limite de 25 MB).'});
    const text=await extractText(name,await readFile(file));
    return JSON.stringify(text===null?{...meta,note:'Formato sem texto para ler.'}:{...meta,text:text.text.slice(0,20000),...(text.text.length>20000?{truncated:true}:{}),...(text.warning?{warning:text.warning}:{})});}},
  {name:'pc_move',description:'Move arquivos ou pastas dentro das pastas liberadas (vários de uma vez, com uma única aprovação). to é o caminho final completo ou uma pasta existente (o item vai para dentro dela). Nunca sobrescreve; pastas de destino são criadas se faltarem.',parameters:object({moves:{type:'array',maxItems:200,items:object({from:pathArg,to:pathArg},['from','to'])}},['moves']),write:true,target:'Pastas do computador',
   execute:async(a,r)=>{const x=z.object({moves:z.array(z.object({from:z.string().min(2).max(500),to:z.string().min(2).max(500)})).min(1).max(200)}).parse(a);
    const results:any[]=[];
    for(const m of x.moves){try{
     const from=await grantFor(r.agent_id,m.from),to=await grantFor(r.agent_id,m.to);const src=toHost(from);if(!await exists(src))throw new Error('origem não encontrada');
     let dest=toHost(to),final=to;const target=await stat(dest).catch(()=>null);
     if(target?.isDirectory()){final={drive:to.drive,parts:[...to.parts,from.parts.at(-1)!]};dest=toHost(final);}
     if(inside(from,final)&&from.parts.length<final.parts.length)throw new Error('não dá para mover uma pasta para dentro dela mesma');
     if(await exists(dest))throw new Error('já existe um item com esse nome no destino');
     await mkdir(path.posix.dirname(dest),{recursive:true});await moveItem(src,dest);results.push({from:formatWindowsPath(from),to:formatWindowsPath(final),ok:true});
    }catch(e:any){results.push({from:m.from,to:m.to,ok:false,error:String(e?.message||e)});}}
    return JSON.stringify({moved:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length,results});}},
  {name:'pc_rename',description:'Renomeia um arquivo ou pasta numa pasta liberada. newName é só o novo nome, sem caminho.',parameters:object({path:pathArg,newName:{type:'string'}},['path','newName']),write:true,target:'Pastas do computador',
   execute:async(a,r)=>{const x=z.object({path:z.string().min(2).max(500),newName:z.string().trim().min(1).max(200).refine(n=>!/[\\/:*?"<>|]/.test(n)&&!blocked(n),'Nome inválido.')}).parse(a);
    const p=await grantFor(r.agent_id,x.path);if(!p.parts.length)throw new Error('Não é possível renomear um disco.');const src=toHost(p);if(!await exists(src))throw new Error(`Item não encontrado: ${formatWindowsPath(p)}.`);
    const next={drive:p.drive,parts:[...p.parts.slice(0,-1),x.newName]},dest=toHost(next);
    if(await exists(dest)&&x.newName.toLowerCase()!==p.parts.at(-1)!.toLowerCase())throw new Error('Já existe um item com esse nome.');
    await rename(src,dest);return JSON.stringify({renamed:formatWindowsPath(p),to:formatWindowsPath(next)});}},
  {name:'pc_mkdir',description:'Cria uma pasta (e as pastas intermediárias) dentro de uma pasta liberada.',parameters:object({path:pathArg},['path']),write:true,target:'Pastas do computador',
   execute:async(a,r)=>{const x=z.object({path:z.string().min(2).max(500)}).parse(a);const p=await grantFor(r.agent_id,x.path);await mkdir(toHost(p),{recursive:true});return JSON.stringify({created:formatWindowsPath(p)});}},
 ];
}
