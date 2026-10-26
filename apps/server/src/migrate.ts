import { readFile,readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { db,pool,transaction } from './db.js';
import { sql } from 'drizzle-orm';
export async function migrate(){
 await db.execute(sql`CREATE TABLE IF NOT EXISTS migrations(name text PRIMARY KEY,applied_at timestamptz DEFAULT now())`);
 const dir=fileURLToPath(new URL('../migrations/',import.meta.url));
 for(const name of (await readdir(dir)).filter(x=>x.endsWith('.sql')).sort())await transaction(async c=>{await c.query('SELECT pg_advisory_xact_lock(710001)');if((await c.query('SELECT 1 FROM migrations WHERE name=$1',[name])).rowCount)return;await c.query(await readFile(dir+name,'utf8'));await c.query('INSERT INTO migrations(name) VALUES($1)',[name]);});
}
if(process.argv[1]?.endsWith('migrate.ts')){await migrate();await pool.end();console.log('Migrações aplicadas.');}
