import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir,writeFile,readFile,unlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
import mammoth from 'mammoth';
import { one,query } from './db.js';
import { contained } from './security.js';
const require=createRequire(import.meta.url);
export const workspace=path.resolve(process.env.WORKSPACE_PATH||'./data');
export const storage=path.join(workspace,'files');
const types:Record<string,string>={'.txt':'text/plain','.md':'text/markdown','.csv':'text/csv','.json':'application/json','.pdf':'application/pdf','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.webm':'audio/webm','.ogg':'audio/ogg','.mp3':'audio/mpeg','.m4a':'audio/mp4','.wav':'audio/wav'};
export async function saveFile(name:string,data:Buffer,agentId?:string,sourceCallId?:string){
 if(sourceCallId){const existing=await one('SELECT id,name,mime,size,warning FROM files WHERE source_call_id=$1',[sourceCallId]);if(existing)return existing;}
 const ext=path.extname(name).toLowerCase(),mime=types[ext];if(!mime)throw new Error('Formato não suportado.');if(data.length>25*1024*1024)throw new Error('Limite de 25 MB por arquivo.');
 let extracted='',warning='';
 if(mime.startsWith('text/')||ext==='.json')extracted=data.toString('utf8');
 if(ext==='.pdf'){const pdf=require('pdf-parse/lib/pdf-parse.js');try{extracted=(await pdf(data,{max:100})).text;if(!extracted.trim())warning='PDF sem texto extraível. OCR não está incluído.';}catch{warning='Não foi possível extrair o texto deste PDF.';}}
 if(ext==='.docx'){try{extracted=(await mammoth.extractRawText({buffer:data})).value;}catch{warning='Não foi possível extrair o texto deste DOCX.';}}
 if(extracted.length>100000){extracted=extracted.slice(0,100000);warning='Texto limitado aos primeiros 100 mil caracteres.';}
 await mkdir(storage,{recursive:true});const id=randomUUID(),storageName=id+ext;await writeFile(contained(storage,storageName),data,{flag:'wx'});
 return (await query('INSERT INTO files(id,agent_id,name,mime,size,storage_name,extracted,warning,source_call_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,name,mime,size,warning',[id,agentId||null,path.basename(name).slice(0,200),mime,data.length,storageName,extracted,warning||null,sourceCallId||null]))[0];
}
export async function fileData(id:string){const file=await one('SELECT * FROM files WHERE id=$1',[id]);if(!file)throw new Error('Arquivo não encontrado.');return {...file,data:await readFile(contained(storage,file.storage_name))};}
export async function deleteFile(id:string){const f=await one('DELETE FROM files WHERE id=$1 RETURNING storage_name',[id]);if(f)await unlink(contained(storage,f.storage_name)).catch(()=>{});}
