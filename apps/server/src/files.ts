import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir,writeFile,readFile,unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';
import { one,query } from './db.js';
import { contained } from './security.js';
// PDF text runs in a plain Node process (see pdf-text.cjs), with a time limit for broken files.
const pdfText=(data:Buffer,max:number)=>new Promise<string>((resolve,reject)=>{
 const child=spawn(process.execPath,[fileURLToPath(new URL('./pdf-text.cjs',import.meta.url)),String(max)],{stdio:['pipe','pipe','ignore'],timeout:30000});
 const out:Buffer[]=[];child.stdout.on('data',c=>out.push(c));child.on('error',reject);
 child.on('close',()=>{try{const r=JSON.parse(Buffer.concat(out).toString('utf8'));if(r.error)reject(new Error(r.error));else resolve(String(r.text||''));}catch{reject(new Error('Não foi possível ler o PDF.'));}});
 child.stdin.on('error',()=>{});child.stdin.end(data);
});
export const workspace=path.resolve(process.env.WORKSPACE_PATH||'./data');
export const storage=path.join(workspace,'files');
const types:Record<string,string>={'.txt':'text/plain','.md':'text/markdown','.csv':'text/csv','.json':'application/json','.pdf':'application/pdf','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.webm':'audio/webm','.ogg':'audio/ogg','.mp3':'audio/mpeg','.m4a':'audio/mp4','.wav':'audio/wav'};
// Text of a document by extension (txt, md, csv, json, pdf, docx); null for formats without text.
export async function extractText(name:string,data:Buffer):Promise<{text:string;warning:string}|null>{
 const ext=path.extname(name).toLowerCase();let text='',warning='';
 if(data.length>15*1024*1024)return {text:'',warning:'Arquivo grande demais para extrair texto (limite de 15 MB).'};
 if(['.txt','.md','.csv','.json'].includes(ext))text=data.toString('utf8');
 else if(ext==='.pdf'){try{text=await pdfText(data,100);if(!text.trim())warning='PDF sem texto extraível. OCR não está incluído.';}catch{warning='Não foi possível extrair o texto deste PDF.';}}
 else if(ext==='.docx'){try{text=(await mammoth.extractRawText({buffer:data})).value;}catch{warning='Não foi possível extrair o texto deste DOCX.';}}
 // Spreadsheets as text: one section per sheet, cells separated by ";" (formulas show their computed value when saved).
 else if(ext==='.xlsx'){try{const wb=new ExcelJS.Workbook();await wb.xlsx.load(data as any);text=wb.worksheets.slice(0,20).map(ws=>{const rows:string[]=[];let count=0;ws.eachRow(r=>{if(count++<5000)rows.push((r.values as any[]).slice(1,100).map(v=>v&&typeof v==='object'?('result' in v&&v.result!==undefined?v.result:'formula' in v?'='+v.formula:'text' in v?v.text:v instanceof Date?v.toISOString().slice(0,10):''):v??'').join(';'));});return `## ${ws.name}\n${rows.join('\n')}`;}).join('\n\n');}catch{warning='Não foi possível ler esta planilha.';}}
 else return null;
 if(text.length>100000){text=text.slice(0,100000);warning='Texto limitado aos primeiros 100 mil caracteres.';}
 return {text,warning};
}
// Canonical links for tool results: host paths are not browser download URLs.
function downloadableFile<T extends {id:string}>(file:T){return {...file,downloadUrl:'/api/files/'+file.id,linkGuidance:'Para oferecer o download, use downloadUrl no link Markdown. Nunca use caminhos locais, sandbox ou nomes de arquivo como URL.'};}
// anyType: keep files of any format (imported from the computer) as downloads, without extracted text.
export async function saveFile(name:string,data:Buffer,agentId?:string,sourceCallId?:string,{anyType=false}:{anyType?:boolean}={}){
 if(sourceCallId){const existing=await one('SELECT id,name,mime,size,warning FROM files WHERE source_call_id=$1',[sourceCallId]);if(existing)return downloadableFile(existing);}
 const ext=path.extname(name).toLowerCase(),mime=types[ext]||(anyType?'application/octet-stream':'');if(!mime)throw new Error('Formato não suportado.');if(data.length>25*1024*1024)throw new Error('Limite de 25 MB por arquivo.');
 let {text:extracted,warning}=await extractText(name,data)||{text:'',warning:''};
 if(extracted.length>100000){extracted=extracted.slice(0,100000);warning='Texto limitado aos primeiros 100 mil caracteres.';}
 await mkdir(storage,{recursive:true});const id=randomUUID(),storageName=id+(/^\.[a-z0-9]{1,10}$/.test(ext)?ext:'');await writeFile(contained(storage,storageName),data,{flag:'wx'});
 return downloadableFile((await query('INSERT INTO files(id,agent_id,name,mime,size,storage_name,extracted,warning,source_call_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,name,mime,size,warning',[id,agentId||null,path.basename(name).slice(0,200),mime,data.length,storageName,extracted,warning||null,sourceCallId||null]))[0]);
}
export async function fileData(id:string){const file=await one('SELECT * FROM files WHERE id=$1',[id]);if(!file)throw new Error('Arquivo não encontrado.');return {...file,data:await readFile(contained(storage,file.storage_name))};}
export async function deleteFile(id:string){const f=await one('DELETE FROM files WHERE id=$1 RETURNING storage_name',[id]);if(f)await unlink(contained(storage,f.storage_name)).catch(()=>{});}
