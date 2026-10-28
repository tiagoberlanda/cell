import path from 'node:path';
import { createReadStream,createWriteStream } from 'node:fs';
import { mkdir,readdir,readFile,rename,rm,stat,writeFile,open,appendFile } from 'node:fs/promises';
import { createCipheriv,createDecipheriv,randomBytes,scrypt as scryptCb } from 'node:crypto';
import { createGzip,createGunzip } from 'node:zlib';
import { Readable,Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import { pool,query,one } from './db.js';
import { key } from './security.js';
import { storage,workspace } from './files.js';

// Full backup of a Cell installation in one encrypted file (.cellbackup): every table row (agents, conversations,
// messages, runs, files metadata, routines, connections, settings, account…) and every stored file. The file is
// encrypted with a key derived from a password (normally the account password), so it can be kept anywhere. It also
// carries the installation's SECRET_KEY: restoring on another installation re-encrypts the stored secrets for it.
//
// Layout: "CELLBACKUP1\n" | salt(16) | iv(12) | AES-256-GCM( gzip( NDJSON ) ) | tag(16)
// NDJSON: {"meta":…} first, then {"t":table,"r":row} rows and {"f":storage name,"d":base64} files.
const MAGIC=Buffer.from('CELLBACKUP1\n'),HEAD=MAGIC.length+16+12,TAG=16;
const scrypt=promisify(scryptCb) as (p:string,s:Buffer,n:number,o:any)=>Promise<Buffer>;
const derive=(password:string,salt:Buffer)=>scrypt(password,salt,32,{N:2**15,r:8,p:1,maxmem:64*1024*1024});
// Temporary files (downloads being served, uploads waiting for confirmation) and backups made from the command line.
export const backupDir=()=>path.join(workspace,'backups');
export const savedDir=()=>path.join(workspace,'backups','saved');
// Runtime state that is not worth restoring: sessions (everyone signs in again), live events, worker heartbeat.
const SKIP=new Set(['sessions','events','worker_health','migrations']);

async function tables(){
 return (await query("SELECT table_name AS t FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")).map(r=>r.t as string).filter(t=>!SKIP.has(t));
}
const ident=(t:string)=>{if(!/^[a-z_][a-z0-9_]*$/.test(t))throw new Error('Nome de tabela inválido: '+t);return `"${t}"`;};

export type BackupMeta={format:1;app:'cell';version:string;createdAt:string;migrations:string[];secretKey:string;counts:Record<string,number>;files:number};

// Writes a backup to backupDir() and returns its path and summary.
export async function createBackup(password:string,version:string,dir=backupDir()){
 if(password.length<8)throw new Error('Senha curta demais para proteger o backup.');
 await mkdir(dir,{recursive:true});
 const file=path.join(dir,`cell-${new Date().toISOString().slice(0,19).replace(/[-:T]/g,'')}-${randomBytes(3).toString('hex')}.cellbackup`);
 const list=await tables(),counts:Record<string,number>={};
 for(const t of list)counts[t]=Number((await one(`SELECT count(*)::int AS n FROM ${ident(t)}`)).n);
 const names=(await readdir(storage).catch(()=>[] as string[])).filter(n=>!n.startsWith('.'));
 const meta:BackupMeta={format:1,app:'cell',version,createdAt:new Date().toISOString(),migrations:(await query('SELECT name FROM migrations ORDER BY name')).map(r=>r.name),secretKey:key().toString('hex'),counts,files:names.length};
 async function* lines(){
  yield JSON.stringify({meta})+'\n';
  for(const t of list){
   // In pages, so large tables (messages, runs) never sit in memory all at once.
   for(let offset=0;;offset+=500){const rows=await query(`SELECT row_to_json(x) AS r FROM (SELECT * FROM ${ident(t)} ORDER BY ctid OFFSET $1 LIMIT 500) x`,[offset]);for(const row of rows)yield JSON.stringify({t,r:row.r})+'\n';if(rows.length<500)break;}
  }
  for(const n of names){const data=await readFile(path.join(storage,n)).catch(()=>null);if(data)yield JSON.stringify({f:n,d:data.toString('base64')})+'\n';}
 }
 const salt=randomBytes(16),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',await derive(password,salt),iv);
 await writeFile(file,Buffer.concat([MAGIC,salt,iv]));
 await pipeline(Readable.from(lines()),createGzip(),cipher,createWriteStream(file,{flags:'a'}));
 await appendFile(file,cipher.getAuthTag());
 return {file,name:path.basename(file),size:(await stat(file)).size,meta:{...meta,secretKey:undefined}};
}

// Decrypts a backup to a temporary NDJSON file. A wrong password or a damaged file fails here (GCM tag).
async function decryptToTemp(file:string,password:string){
 const size=(await stat(file)).size;if(size<HEAD+TAG)throw new Error('Arquivo de backup inválido.');
 const fh=await open(file,'r');const head=Buffer.alloc(HEAD),tag=Buffer.alloc(TAG);
 try{await fh.read(head,0,HEAD,0);await fh.read(tag,0,TAG,size-TAG);}finally{await fh.close();}
 if(!head.subarray(0,MAGIC.length).equals(MAGIC))throw new Error('Este arquivo não é um backup do Cell.');
 const salt=head.subarray(MAGIC.length,MAGIC.length+16),iv=head.subarray(MAGIC.length+16,HEAD);
 const decipher=createDecipheriv('aes-256-gcm',await derive(password,salt),iv);decipher.setAuthTag(tag);
 const out=file+'.ndjson';
 try{await pipeline(createReadStream(file,{start:HEAD,end:size-TAG-1}),decipher,createGunzip(),createWriteStream(out));}
 catch{await rm(out,{force:true});throw new Error('Senha incorreta ou arquivo de backup danificado.');}
 return out;
}
async function* readLines(file:string){for await(const line of createInterface({input:createReadStream(file),crlfDelay:Infinity}))if(line)yield JSON.parse(line);}

// Checks a backup without changing anything: password, format, version compatibility and contents.
export async function inspectBackup(file:string,password:string){
 const plain=await decryptToTemp(file,password);
 try{
  let meta:BackupMeta|null=null;for await(const x of readLines(plain)){meta=x.meta;break;}
  if(!meta||meta.app!=='cell'||meta.format!==1)throw new Error('Formato de backup desconhecido.');
  const current=new Set((await query('SELECT name FROM migrations')).map(r=>r.name)),newer=meta.migrations.filter(m=>!current.has(m));
  return {meta:{...meta,secretKey:undefined},compatible:!newer.length,newer,sameKey:meta.secretKey===key().toString('hex')};
 }finally{await rm(plain,{force:true});}
}

// Secrets in rows are AES-GCM values under the old SECRET_KEY: re-encrypt any value that decrypts with it (the GCM
// tag makes a false match practically impossible), anywhere in the row, including inside JSON (settings.token).
function rekeyer(oldKey:Buffer,newKey:Buffer){
 const tryRekey=(s:string)=>{if(s.length<40||!/^[A-Za-z0-9+/]+={0,2}$/.test(s))return s;
  try{const b=Buffer.from(s,'base64');const d=createDecipheriv('aes-256-gcm',oldKey,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));const plain=Buffer.concat([d.update(b.subarray(28)),d.final()]);
   const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',newKey,iv);const data=Buffer.concat([c.update(plain),c.final()]);return Buffer.concat([iv,c.getAuthTag(),data]).toString('base64');}catch{return s;}};
 const walk=(v:any):any=>typeof v==='string'?tryRekey(v):Array.isArray(v)?v.map(walk):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,walk(x)])):v;
 return walk;
}

// Replaces everything with the backup's contents. Runs in one transaction; files are swapped in after it commits.
export async function restoreBackup(file:string,password:string){
 const info=await inspectBackup(file,password);
 if(!info.compatible)throw new Error(`Este backup é de uma versão mais nova do Cell (${info.meta.version}). Atualize o Cell antes de restaurar.`);
 const plain=await decryptToTemp(file,password);
 const stage=`${storage}.restore-${Date.now()}`;await mkdir(stage,{recursive:true});
 const client=await pool.connect();const counts:Record<string,number>={};let files=0;
 try{
  const current=await tables();const columns=new Map<string,Set<string>>();
  for(const t of current)columns.set(t,new Set((await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",[t])).rows.map(r=>r.column_name)));
  let meta:BackupMeta|null=null,walk:((v:any)=>any)|null=null;
  await client.query('BEGIN');
  // Rows go in any order; foreign keys are checked by the data itself (it came from a consistent database).
  await client.query("SET LOCAL session_replication_role = replica");
  await client.query(`TRUNCATE ${[...current,'sessions','events'].map(ident).join(',')} CASCADE`);
  const batch=new Map<string,any[]>();
  const flush=async(t:string)=>{const rows=batch.get(t);if(!rows?.length)return;batch.set(t,[]);
   // Only columns that exist now: a backup from an older version leaves newer columns at their defaults.
   const cols=[...new Set(rows.flatMap(r=>Object.keys(r)))].filter(c=>columns.get(t)!.has(c));const list=cols.map(c=>`"${c.replace(/"/g,'')}"`).join(',');
   await client.query(`INSERT INTO ${ident(t)} (${list}) SELECT ${list} FROM json_populate_recordset(null::${ident(t)},$1::json)`,[JSON.stringify(rows)]);};
  for await(const x of readLines(plain)){
   if(x.meta){meta=x.meta;const oldKey=Buffer.from(meta!.secretKey,'hex'),newKey=key();walk=oldKey.equals(newKey)?null:rekeyer(oldKey,newKey);continue;}
   if(x.t){if(!columns.has(x.t))continue;const rows=batch.get(x.t)||[];rows.push(walk?walk(x.r):x.r);batch.set(x.t,rows);counts[x.t]=(counts[x.t]||0)+1;if(rows.length>=200)await flush(x.t);continue;}
   if(x.f){const name=path.basename(String(x.f));if(name.startsWith('.'))continue;await writeFile(path.join(stage,name),Buffer.from(x.d,'base64'));files++;}
  }
  for(const t of batch.keys())await flush(t);
  // Work that was in progress when the backup was taken cannot continue.
  await client.query("UPDATE runs SET state='failed',error='Interrompida: o Cell foi restaurado de um backup.',finished_at=now() WHERE state IN('queued','running','waiting_agent')");
  await client.query("UPDATE computer_jobs SET status='lost',finished_at=now() WHERE status='running'");
  // Serial columns continue after the restored rows.
  for(const r of (await client.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND column_default LIKE 'nextval(%'")).rows)
   await client.query(`SELECT setval(pg_get_serial_sequence($1,$2),COALESCE((SELECT max(${ident(r.column_name)}) FROM ${ident(r.table_name)}),0)+1,false)`,[r.table_name,r.column_name]);
  await client.query('COMMIT');
 }catch(e){await client.query('ROLLBACK').catch(()=>{});await rm(stage,{recursive:true,force:true});throw e;}
 finally{client.release();await rm(plain,{force:true});}
 const old=`${storage}.old-${Date.now()}`;await rename(storage,old).catch(()=>{});await rename(stage,storage);await rm(old,{recursive:true,force:true});
 return {meta:info.meta,counts,files,rekeyed:!info.sameKey};
}

// Temporary backup files older than an hour (downloads already served, abandoned uploads) are removed; saved/ is kept.
export async function cleanBackups(){
 const dir=backupDir();for(const n of await readdir(dir).catch(()=>[] as string[])){if(!/\.cellbackup(\.ndjson)?$/.test(n))continue;const p=path.join(dir,n);const s=await stat(p).catch(()=>null);if(s&&Date.now()-s.mtimeMs>3600000)await rm(p,{force:true,recursive:true});}
}
