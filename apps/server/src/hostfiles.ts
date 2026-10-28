import path from 'node:path';
import { readdir,stat,rename,mkdir,readFile,cp,rm,writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { one,query } from './db.js';
import { extractText,saveFile,fileData } from './files.js';
import { hostConfigured,hostRun } from './computer.js';
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

// --- Undo journal and trash. Every change is recorded per tool call (file_ops) so the owner can undo it from the
// conversation. The Cell trash is .cell-lixeira inside the granted folder (hidden from agents: names starting with "."
// are blocked); overwritten files keep their previous content there too.
async function recordOp(r:any,kind:string,items:any[]){
 if(!r?.callId)return;
 await query('INSERT INTO file_ops(call_id,agent_id,kind,items) VALUES($1,$2,$3,$4) ON CONFLICT(call_id) DO UPDATE SET items=file_ops.items||$4',[r.callId,r.agent_id||null,kind,JSON.stringify(items)]);
}
async function grantRoot(agentId:string,p:{drive:string;parts:string[]}){
 for(const g of await query('SELECT path FROM host_grants WHERE agent_id=$1',[agentId])){const gp=parseWindowsPath(g.path);if(inside(gp,p))return gp;}
 throw new Error(`Sem acesso a ${formatWindowsPath(p)}.`);
}
async function toTrash(agentId:string,p:{drive:string;parts:string[]}){
 const root=toHost(await grantRoot(agentId,p)),dir=path.posix.join(root,'.cell-lixeira',new Date().toISOString().replace(/[:.]/g,'-')+'-'+Math.random().toString(36).slice(2,6));
 await mkdir(dir,{recursive:true});const dest=path.posix.join(dir,p.parts.at(-1)!);await moveItem(toHost(p),dest);return dest;
}
// Writes a file (pc_write, pc_save_file); an overwritten file goes to the trash first so undo can bring it back.
async function placeFile(r:any,kind:string,target:string,data:Buffer,overwrite:boolean){
 const p=await grantFor(r.agent_id,target);if(!p.parts.length)throw new Error('Informe o arquivo.');const file=toHost(p);
 if(/^\.env/i.test(p.parts.at(-1)!))throw new Error('Arquivos de configuração com segredos não podem ser escritos.');
 const info=await stat(file).catch(()=>null);if(info?.isDirectory())throw new Error('Já existe uma pasta com esse nome.');if(info&&!overwrite)throw new Error('O arquivo já existe. Peça de novo com overwrite=true para substituir.');
 const backup=info?await toTrash(r.agent_id,p):null;
 await mkdir(path.posix.dirname(file),{recursive:true});await writeFile(file,data);
 await recordOp(r,kind,[{path:formatWindowsPath(p),backup}]);
 return {written:formatWindowsPath(p),bytes:data.length,replaced:!!info};
}
// Windows Recycle Bin via the Cell Host (paths are Windows paths). Returns path → 'ok' or an error message.
async function recycle(paths:string[]):Promise<Record<string,string>>{
 const list=Buffer.from(JSON.stringify(paths),'utf8').toString('base64');
 const script=`Add-Type -AssemblyName Microsoft.VisualBasic;$r=@{};foreach($p in ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${list}'))|ConvertFrom-Json)){try{if(Test-Path -LiteralPath $p -PathType Container){[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($p,'OnlyErrorDialogs','SendToRecycleBin')}else{[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($p,'OnlyErrorDialogs','SendToRecycleBin')};$r[$p]='ok'}catch{$r[$p]=$_.Exception.Message}};$r|ConvertTo-Json -Compress`;
 const out=await hostRun(script,120);return JSON.parse(out.stdout||'{}');
}
// Brings items back from the Windows Recycle Bin (newest deletion of that path).
async function unrecycle(paths:string[]):Promise<Record<string,string>>{
 const list=Buffer.from(JSON.stringify(paths),'utf8').toString('base64');
 const script=`$sh=New-Object -ComObject Shell.Application;$bin=$sh.Namespace(10);$r=@{};foreach($p in ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${list}'))|ConvertFrom-Json)){$dir=Split-Path $p -Parent;$name=Split-Path $p -Leaf;if(Test-Path -LiteralPath $p){$r[$p]='já existe um item com esse nome';continue};$item=@($bin.Items()|Where-Object{$_.ExtendedProperty('System.Recycle.DeletedFrom') -eq $dir -and $_.Name -eq $name}|Sort-Object{$_.ExtendedProperty('System.Recycle.DateDeleted')} -Descending)[0];if(-not $item){$item=@($bin.Items()|Where-Object{$_.ExtendedProperty('System.Recycle.DeletedFrom') -eq $dir -and [IO.Path]::GetFileNameWithoutExtension($_.Name) -eq [IO.Path]::GetFileNameWithoutExtension($name)}|Sort-Object{$_.ExtendedProperty('System.Recycle.DateDeleted')} -Descending)[0]};if(-not $item){$r[$p]='não está mais na Lixeira';continue};if(-not(Test-Path -LiteralPath $dir)){New-Item -ItemType Directory -Path $dir|Out-Null};$sh.Namespace($dir).MoveHere($item,20);for($i=0;$i -lt 50 -and -not(Test-Path -LiteralPath $p);$i++){Start-Sleep -Milliseconds 200};$r[$p]=if(Test-Path -LiteralPath $p){'ok'}else{'não foi possível restaurar'}};$r|ConvertTo-Json -Compress`;
 const out=await hostRun(script,120);return JSON.parse(out.stdout||'{}');
}
// Undoes one recorded change, newest item first. Runs in the worker (it has the drives).
export async function undoFileOp(id:string){
 const op=await one('SELECT * FROM file_ops WHERE id=$1',[id]);if(!op)throw new Error('Alteração não encontrada.');if(op.undone_at)return {ok:true,already:true};
 const errors:string[]=[];const items=[...op.items].reverse();
 const back=async(fromWin:string,toWin:string)=>{const src=toHost(parseWindowsPath(fromWin)),dest=toHost(parseWindowsPath(toWin));if(!await exists(src))throw new Error(`${fromWin} não existe mais`);if(await exists(dest))throw new Error(`${toWin} já existe`);await mkdir(path.posix.dirname(dest),{recursive:true});await moveItem(src,dest);};
 if(op.kind==='delete'){
  const recycled=items.filter((i:any)=>i.method==='recycle').map((i:any)=>i.path);
  if(recycled.length){try{const res=await unrecycle(recycled);for(const pth of recycled)if(res[pth]!=='ok')errors.push(`${pth}: ${res[pth]||'sem resposta'}`);}catch(e:any){errors.push('Lixeira do Windows: '+String(e?.message||e));}}
  for(const i of items.filter((i:any)=>i.method==='trash')){try{const dest=toHost(parseWindowsPath(i.path));if(await exists(dest))throw new Error('já existe um item com esse nome');await mkdir(path.posix.dirname(dest),{recursive:true});await moveItem(i.trash,dest);}catch(e:any){errors.push(`${i.path}: ${e?.message||e}`);}}
 }else for(const i of items){try{
  if(op.kind==='move'||op.kind==='rename')await back(i.to,i.from);
  else if(op.kind==='mkdir'){const dir=toHost(parseWindowsPath(i.path));if((await readdir(dir).catch(()=>[])).length)throw new Error(`${i.path} não está vazia`);await rm(dir,{recursive:true});}
  else if(op.kind==='write'||op.kind==='save'){const p=parseWindowsPath(i.path),file=toHost(p);if(await exists(file))await toTrash(op.agent_id,p).catch(async()=>{await rm(file,{force:true});});if(i.backup)await moveItem(i.backup,file);}
 }catch(e:any){errors.push(String(e?.message||e));}}
 if(errors.length){await query('UPDATE file_ops SET undo_error=$2 WHERE id=$1',[id,errors.join('; ').slice(0,1000)]);return {ok:false,errors};}
 await query('UPDATE file_ops SET undone_at=now(),undo_error=NULL WHERE id=$1',[id]);return {ok:true};
}

export function hostFileTools():Tool[]{
 return [
  {name:'pc_request_access',description:'Pede ao usuário acesso a uma pasta do computador dele (com subpastas). Use antes de listar, ler ou organizar arquivos ali. Só vale depois que o usuário aprovar.',parameters:object({path:pathArg,reason:{type:'string',description:'Para que você precisa da pasta'}},['path']),write:true,target:'Pastas do computador',
   execute:async(a,r)=>{const x=z.object({path:z.string().min(2).max(500),reason:z.string().max(500).optional()}).parse(a);const p=parseWindowsPath(x.path);
    const info=await stat(toHost(p)).catch(()=>null);if(!info?.isDirectory())throw new Error(`Pasta não encontrada no computador: ${formatWindowsPath(p)}.`);
    const win=formatWindowsPath(p);await query('INSERT INTO host_grants(agent_id,path) VALUES($1,$2) ON CONFLICT(agent_id,lower(path)) DO NOTHING',[r.agent_id,win]);
    return JSON.stringify({granted:win,message:'Acesso concedido. Ler, listar e trazer arquivos para a conversa não pedem aprovação; criar, gravar, mover, renomear e excluir pedem.'});}},
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
    const moved=results.filter(x=>x.ok);if(moved.length)await recordOp(r,'move',moved.map(x=>({from:x.from,to:x.to})));
    return JSON.stringify({moved:moved.length,failed:results.filter(x=>!x.ok).length,results});}},
  {name:'pc_rename',description:'Renomeia um arquivo ou pasta numa pasta liberada. newName é só o novo nome, sem caminho.',parameters:object({path:pathArg,newName:{type:'string'}},['path','newName']),write:true,target:'Pastas do computador',
   execute:async(a,r)=>{const x=z.object({path:z.string().min(2).max(500),newName:z.string().trim().min(1).max(200).refine(n=>!/[\\/:*?"<>|]/.test(n)&&!blocked(n),'Nome inválido.')}).parse(a);
    const p=await grantFor(r.agent_id,x.path);if(!p.parts.length)throw new Error('Não é possível renomear um disco.');const src=toHost(p);if(!await exists(src))throw new Error(`Item não encontrado: ${formatWindowsPath(p)}.`);
    const next={drive:p.drive,parts:[...p.parts.slice(0,-1),x.newName]},dest=toHost(next);
    if(await exists(dest)&&x.newName.toLowerCase()!==p.parts.at(-1)!.toLowerCase())throw new Error('Já existe um item com esse nome.');
    await rename(src,dest);await recordOp(r,'rename',[{from:formatWindowsPath(p),to:formatWindowsPath(next)}]);return JSON.stringify({renamed:formatWindowsPath(p),to:formatWindowsPath(next)});}},
  {name:'pc_mkdir',description:'Cria uma pasta (e as pastas intermediárias) dentro de uma pasta liberada.',parameters:object({path:pathArg},['path']),write:true,target:'Pastas do computador',
   execute:async(a,r)=>{const x=z.object({path:z.string().min(2).max(500)}).parse(a);const p=await grantFor(r.agent_id,x.path);const dir=toHost(p);const existed=await exists(dir);
    await mkdir(dir,{recursive:true});if(!existed)await recordOp(r,'mkdir',[{path:formatWindowsPath(p)}]);return JSON.stringify({created:formatWindowsPath(p),alreadyExisted:existed});}},
  {name:'pc_write',description:'Cria um arquivo de texto (txt, md, csv, json, html, ps1, etc.) numa pasta liberada. Não sobrescreve, a menos que overwrite=true (o usuário vê isso na aprovação; o arquivo anterior é guardado e pode ser restaurado com Desfazer).',parameters:object({path:pathArg,content:{type:'string'},overwrite:{type:'boolean'}},['path','content']),write:true,target:'Pastas do computador',
   execute:async(a,r)=>{const x=z.object({path:z.string().min(2).max(500),content:z.string().max(2_000_000),overwrite:z.boolean().optional()}).parse(a);
    return JSON.stringify(await placeFile(r,'write',x.path,Buffer.from(x.content,'utf8'),!!x.overwrite));}},
  {name:'pc_save_file',description:'Salva um arquivo da biblioteca do Cell (por exemplo um PDF, planilha ou imagem que você gerou, ou um anexo da conversa) numa pasta liberada do computador. path é o caminho final com o nome do arquivo. Não sobrescreve, a menos que overwrite=true.',parameters:object({fileId:{type:'string'},path:pathArg,overwrite:{type:'boolean'}},['fileId','path']),write:true,target:'Pastas do computador',
   execute:async(a,r)=>{const x=z.object({fileId:z.string().uuid(),path:z.string().min(2).max(500),overwrite:z.boolean().optional()}).parse(a);const f=await fileData(x.fileId);
    return JSON.stringify({...await placeFile(r,'save',x.path,f.data,!!x.overwrite),from:f.name});}},
  {name:'pc_import',description:'Traz um arquivo de uma pasta liberada do computador para a conversa (fica anexado à sua resposta e salvo na biblioteca do Cell), até 25 MB. Use quando o usuário pedir para mandar ou mostrar um arquivo do computador.',parameters:object({path:pathArg},['path']),write:false,
   execute:async(a,r)=>{const x=z.object({path:z.string().min(2).max(500)}).parse(a);const p=await grantFor(r.agent_id,x.path);const file=toHost(p);
    const info=await stat(file).catch(()=>null);if(!info?.isFile())throw new Error(`Arquivo não encontrado: ${formatWindowsPath(p)}.`);
    if(/^\.env/i.test(p.parts.at(-1)!))throw new Error('Arquivos de configuração com segredos não podem ser enviados.');
    if(info.size>25*1024*1024)throw new Error('O arquivo passa de 25 MB, o limite da biblioteca.');
    return JSON.stringify({...await saveFile(p.parts.at(-1)!,await readFile(file),r.agent_id,r.callId,{anyType:true}),from:formatWindowsPath(p)});}},
  {name:'pc_delete',description:'Exclui arquivos ou pastas (com o conteúdo) dentro das pastas liberadas, vários de uma vez, com uma única aprovação. Vão para a Lixeira do Windows (ou para a lixeira do Cell) e podem ser restaurados com Desfazer. Nunca exclui a própria pasta liberada.',parameters:object({paths:{type:'array',maxItems:200,items:pathArg}},['paths']),write:true,target:'Pastas do computador',
   execute:async(a,r)=>{const x=z.object({paths:z.array(z.string().min(2).max(500)).min(1).max(200)}).parse(a);const results:any[]=[],done:any[]=[];
    const grants=(await query('SELECT path FROM host_grants WHERE agent_id=$1',[r.agent_id])).map(g=>parseWindowsPath(g.path));
    const ready:{p:any;info:any}[]=[];
    for(const item of x.paths){try{const p=await grantFor(r.agent_id,item);
     if(grants.some(g=>g.drive===p.drive&&g.parts.length===p.parts.length&&inside(g,p)))throw new Error('a pasta liberada em si não pode ser excluída');
     const info=await stat(toHost(p)).catch(()=>null);if(!info)throw new Error('não encontrado');ready.push({p,info});}
     catch(e:any){results.push({path:item,ok:false,error:String(e?.message||e)});}}
    // Windows Recycle Bin through the Cell Host when installed; otherwise the Cell trash inside the granted folder.
    const recycled=ready.length&&hostConfigured()?await recycle(ready.map(x=>formatWindowsPath(x.p))).catch(()=>null):null;
    for(const {p,info} of ready){const win=formatWindowsPath(p),type=info.isDirectory()?'pasta':'arquivo';
     try{
      if(recycled&&recycled[win]==='ok'){done.push({path:win,method:'recycle'});results.push({path:win,type,ok:true,to:'Lixeira do Windows'});continue;}
      if(recycled&&recycled[win]&&recycled[win]!=='ok')throw new Error(recycled[win]);
      const trash=await toTrash(r.agent_id,p);done.push({path:win,method:'trash',trash});results.push({path:win,type,ok:true,to:'lixeira do Cell'});
     }catch(e:any){results.push({path:win,ok:false,error:String(e?.message||e)});}}
    if(done.length)await recordOp(r,'delete',done);
    return JSON.stringify({deleted:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length,results});}},
 ];
}
