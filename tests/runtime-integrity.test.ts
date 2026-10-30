import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import pg from 'pg';

const worker=await readFile(new URL('../apps/server/src/worker.ts',import.meta.url),'utf8');
test('worker persists model array order and resumes by ordinal, including legacy fallback',()=>{
 assert.match(worker,/ORDER BY ordinal NULLS LAST,created_at,id/);
 assert.match(worker,/for\(const c of result.calls\)\{ordinal\+\+;/);
 assert.match(worker,/binding,ordinal\) VALUES\(\$1,\$2,\$3,\$4,\$5,\$6,\$7,\$8,\$9\)/);
 assert.match(worker,/t\.binding\|\|'',ordinal\]/);
});

test('isolated database: ordinal migration and delegation/cancellation serialization',{skip:!process.env.TEST_DATABASE_URL,timeout:30000},async t=>{
 // Never migrate, truncate or drop public: integration.test.ts can run concurrently.
 const admin=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});await admin.connect();
 const schema='runtime_test_'+randomUUID().replaceAll('-','');
 await admin.query(`CREATE SCHEMA ${schema}`);
 const url=new URL(process.env.TEST_DATABASE_URL!);url.searchParams.set('options',`-c search_path=${schema}`);
 process.env.DATABASE_URL=url.toString();process.env.SECRET_KEY='bc'.repeat(32);
 let pool:pg.Pool|undefined;
 try{
  const db=await import('../apps/server/src/db.js');pool=db.pool;
  const dir=new URL('../apps/server/migrations/',import.meta.url);
  const migrations=(await readdir(dir)).filter(x=>x.endsWith('.sql')).sort();
  for(const name of migrations.filter(x=>x<'0026'))await db.query(await readFile(new URL(name,dir),'utf8'));
  const agent=async(name:string)=>(await db.one("INSERT INTO agents(name,color,shape) VALUES($1,'blue','circle') RETURNING *",[name]))!;
  const a=await agent('parent'),b=await agent('child'),c=await agent('grandchild');
  const conversation=(await db.one('INSERT INTO conversations(agent_id) VALUES($1) RETURNING id',[a.id]))!.id;
  const root=(await db.one("INSERT INTO runs(agent_id,conversation_id,model,config) VALUES($1,$2,'test','test') RETURNING *",[a.id,conversation]))!;
  const ids=['ffffffff-ffff-4fff-afff-ffffffffffff','00000000-0000-4000-a000-000000000001'];
  for(const [i,id] of ids.entries())await db.query("INSERT INTO tool_calls(id,run_id,call_id,tool,args,fingerprint,created_at) VALUES($1,$2,$3,'test','{}','test','2026-01-01')",[id,root.id,'legacy'+i]);
  await db.query(await readFile(new URL('0026_tool_call_order.sql',dir),'utf8'));
  for(const name of migrations.filter(x=>x>'0026_tool_call_order.sql'))await db.query(await readFile(new URL(name,dir),'utf8'));
  await t.test('backfill retains old timestamp/UUID order; explicit order overrides UUIDs',async()=>{
   assert.deepEqual((await db.query('SELECT id FROM tool_calls WHERE run_id=$1 ORDER BY ordinal',[root.id])).map(x=>x.id),[...ids].reverse());
   await db.query('UPDATE tool_calls SET ordinal=CASE WHEN id=$1 THEN 1 ELSE 2 END WHERE run_id=$2',[ids[0],root.id]);
   const order=worker.match(/SELECT \* FROM tool_calls WHERE run_id=\$1 AND status NOT IN\('done','denied','error'\) ORDER BY ordinal NULLS LAST,created_at,id/)![0];
   assert.deepEqual((await db.query(order,[root.id])).map(x=>x.id),ids);
  });
  const {createRun,cancelRun}=await import('../apps/server/src/runtime.js');
  const cfg={baseUrl:'http://localhost',token:'',defaultModel:'test',timezone:'UTC',concurrency:3,maxSteps:10,maxDepth:4};
  const tx=await pool.connect();
  try{
   await tx.query('BEGIN');
   const child=await createRun(b.id,conversation,'child',[],root,cfg,undefined,{client:tx});
   // A descendant insertion also holds the shared tree lock. Cancellation must
   // wait for this transaction and then see BOTH generations in its fresh snapshot.
   const grandchild=await createRun(c.id,conversation,'grandchild',[],child,cfg,undefined,{client:tx});
   const cancelling=cancelRun(root.id);let settled=false;void cancelling.then(()=>{settled=true;});
   let waiting=false;
   for(let i=0;i<100;i++){const lock=await admin.query("SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=720002 AND NOT granted");if(lock.rowCount){waiting=true;break;}await sleep(10);}
   assert.equal(waiting,true,'cancellation waits for descendant insertion');assert.equal(settled,false);
   await tx.query('COMMIT');await cancelling;
   const tree=await db.query('SELECT id,state FROM runs WHERE id=ANY($1::uuid[])',[[root.id,child.id,grandchild.id]]);
   assert.equal(tree.length,3);assert.ok(tree.every(x=>x.state==='cancelled'));
   await assert.rejects(createRun(b.id,conversation,'late child',[],root,cfg),/não está mais ativa/);
   await assert.rejects(createRun(a.id,conversation,'late grandchild',[],grandchild,cfg),/não está mais ativa|circular/);
   assert.equal((await db.one('SELECT count(*)::int AS n FROM runs'))!.n,3);
  }finally{await tx.query('ROLLBACK');tx.release();}
 }finally{if(pool)await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
