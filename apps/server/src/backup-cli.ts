import path from 'node:path';
import { readFileSync } from 'node:fs';
import { pool } from './db.js';
import { createBackup,inspectBackup,restoreBackup,savedDir } from './backup.js';

// Backup from the command line, inside the api container (any OS with Docker). The password comes from
// CELL_BACKUP_PASSWORD, never from the command line. Files live in /data/backups/saved; copy them with docker compose cp.
//   docker compose exec -e CELL_BACKUP_PASSWORD api npm run backup -- create
//   docker compose exec -e CELL_BACKUP_PASSWORD api npm run backup -- verify /data/backups/saved/<arquivo>
//   docker compose exec -e CELL_BACKUP_PASSWORD api npm run backup -- restore /data/backups/saved/<arquivo>
const [command,file]=process.argv.slice(2);
const password=process.env.CELL_BACKUP_PASSWORD||'';
const {version}=JSON.parse(readFileSync(new URL('../../../package.json',import.meta.url),'utf8'));
try{
 if(!password)throw new Error('Defina CELL_BACKUP_PASSWORD com a senha do backup (normalmente a senha da conta).');
 if(command==='create'){const b=await createBackup(password,version,savedDir());console.log(`Backup criado: ${b.file} (${(b.size/1e6).toFixed(1)} MB)`);console.log(`Copie com: docker compose cp api:${b.file} .`);}
 else if(command==='verify'||command==='restore'){
  if(!file)throw new Error('Informe o arquivo, por exemplo /data/backups/saved/cell-20261028.cellbackup');
  const target=path.resolve(file);
  if(command==='verify'){const i=await inspectBackup(target,password);console.log(JSON.stringify({ok:i.compatible,version:i.meta.version,createdAt:i.meta.createdAt,counts:i.meta.counts,files:i.meta.files,sameKey:i.sameKey,newerMigrations:i.newer},null,2));if(!i.compatible)process.exitCode=1;}
  else{const r=await restoreBackup(target,password);console.log(`Restaurado: backup de ${r.meta.createdAt} (Cell ${r.meta.version}), ${r.files} arquivos.${r.rekeyed?' Segredos re-cifrados para esta instalação.':''} Entre de novo no Cell.`);}
 }else throw new Error('Uso: npm run backup -- create | verify <arquivo> | restore <arquivo>');
}catch(e:any){console.error(e?.message||e);process.exitCode=1;}
finally{await pool.end();}
