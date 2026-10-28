import { one,query } from './db.js';

// Memory shared by every agent, kept in the database so it survives updates and goes into backups.
export const SHARED_MEMORY_MAX=100000;

export async function readSharedMemory():Promise<string>{
 return (await one('SELECT body FROM shared_memory WHERE id=1'))?.body||'';
}

// append adds a block at the end; replace swaps the whole text (empty clears it).
export async function writeSharedMemory(content:string,mode:'append'|'replace'='append'):Promise<string>{
 const text=content.trim();
 const row=await one(`UPDATE shared_memory SET body=CASE WHEN $2='replace' THEN $1 WHEN body='' THEN $1 ELSE body||E'\n\n'||$1 END,updated_at=now() WHERE id=1 AND length(CASE WHEN $2='replace' THEN $1 ELSE body||$1 END)<=$3 RETURNING body`,[text,mode,SHARED_MEMORY_MAX]);
 if(!row)throw new Error(`A memória compartilhada passaria de ${SHARED_MEMORY_MAX} caracteres. Resuma o texto atual com mode=replace.`);
 return row.body;
}

// The prompt carries the start of it; the rest is read with read_shared_memory.
export async function sharedMemoryForPrompt(limit=6000):Promise<string>{
 const body=await readSharedMemory();
 return body.length<=limit?body:`${body.slice(0,limit)}\n[… mais ${body.length-limit} caracteres: use read_shared_memory para ler tudo]`;
}
