import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const memoryPath=resolve(process.cwd(),'memory.md');

export async function readSharedMemory():Promise<string>{
 try{return await readFile(memoryPath,'utf8');}catch(error:any){if(error?.code==='ENOENT')return '';throw error;}
}

export async function writeSharedMemory(content:string):Promise<void>{
 const text=content.trim();
 if(!text)throw new Error('A memória compartilhada não pode ficar vazia.');
 await mkdir(dirname(memoryPath),{recursive:true});
 await writeFile(memoryPath,text+'\n','utf8');
}

export function sharedMemoryFile():string{return memoryPath;}
