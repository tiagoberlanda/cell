import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {pool} from '../apps/server/src/db.js';
import {autoApproval} from '../apps/server/src/approval-policy.js';
import {computerTools} from '../apps/server/src/computer.js';

// Stub only the database boundary; no SSH connection or host command may be made in these tests.
test('computer approval policy and immutable destinations',async t=>{
 const oldUrl=process.env.CELL_HOST_URL,oldToken=process.env.CELL_HOST_TOKEN;
 delete process.env.CELL_HOST_URL;delete process.env.CELL_HOST_TOKEN;
 let agent:any={approval_mode:'safe',auto_approve:[]};
 let computers:any[]=[{id:'stable-a',name:'Linux',host:'server-a',port:22,username:'owner',fingerprint:'SHA256:a',auth:'encrypted',shell:'bash'}];
 let recipes:any[]=[{id:'recipe-a',name:'Backup',trusted:false,computer_key:'linux',command:'echo backup',cwd:'/home/owner',background:false}];
 const db=mock.method(pool,'query',async(sql:any)=>({rows:String(sql).includes('FROM agents')?[structuredClone(agent)]:String(sql).includes('FROM computers')?structuredClone(computers):String(sql).includes('FROM command_recipes')?structuredClone(recipes):[]}));
 const tool=async(name:string)=>(await computerTools()).find(x=>x.name===name)!;
 try{
  await t.test('safe mode always requires approval for shell commands, recipes and access grants',async()=>{
   const screenshot='Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height; $graphics = [System.Drawing.Graphics]::FromImage($bitmap); $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size); $bitmap.Save("C:\\Temp\\screenshot.png"); $graphics.Dispose(); $bitmap.Dispose()';
   for(const command of ['Get-Date','Get-Command ffmpeg','Get-ChildItem C:\\Temp',screenshot,'echo hello','Remove-Item data','rm -rf data'])assert.equal(await autoApproval('a',{tool:'pc_run',args:{command}}),null,command);
   assert.equal(await autoApproval('a',{tool:'pc_recipe',args:{name:'Backup'}}),null);
   assert.equal(await autoApproval('a',{tool:'pc_request_access',args:{path:'C:\\Data'}}),null);
   assert.equal(await autoApproval('a',{tool:'pc_write',args:{},target:'Pastas do computador'}),null);
   assert.equal(await autoApproval('a',{tool:'pc_delete',args:{},target:'Pastas do computador'}),null);
  });
  await t.test('safe mode auto-approves only explicit allowlist capabilities',async()=>{
   assert.equal(await autoApproval('a',{tool:'write_shared_memory',args:{}}),'mode');
   assert.equal(await autoApproval('a',{tool:'gtasks_create_task',args:{}}),'mode');
   assert.equal(await autoApproval('a',{tool:'gtasks_complete_task',args:{}}),'mode');
   assert.equal(await autoApproval('a',{tool:'gtasks_delete_task',args:{}}),null);
  });
  await t.test('policy re-reads the current mode and explicit overrides retain precedence',async()=>{
   const call={tool:'write_shared_memory',args:{}};
   agent.approval_mode='ask';assert.equal(await autoApproval('a',call),null);
   agent.approval_mode='safe';assert.equal(await autoApproval('a',call),'mode');
   agent.approval_mode='ask';assert.equal(await autoApproval('a',call),null);
   agent.auto_approve=[{tool:'pc_run'}];assert.equal(await autoApproval('a',{tool:'pc_run',args:{command:'ri data'}}),'always');
   agent={approval_mode:'yolo',auto_approve:[]};assert.equal(await autoApproval('a',{tool:'pc_recipe',args:{name:'Backup'}}),'mode');
   assert.equal(await autoApproval('a',{tool:'pc_delete',args:{}}),'mode');
   agent={approval_mode:'safe',auto_approve:[]};
  });
  await t.test('sole computer replacement invalidates binding even with omitted computer',async()=>{
   const before=await tool('pc_run'),original=structuredClone(computers);
   computers[0].id='stable-b';
   assert.notEqual(before.binding,(await tool('pc_run')).binding);
   await assert.rejects(before.execute({command:'echo ok'},{},{}),/computador mudou/);
   computers=original;
  });
  await t.test('same ID and label with changed SSH destination or credentials invalidates binding',async()=>{
   for(const [key,value] of Object.entries({host:'server-b',port:2222,username:'other',fingerprint:'SHA256:b',auth:'new-secret',shell:'powershell'})){
    const original=structuredClone(computers),before=await tool('pc_run');computers[0][key]=value;
    assert.notEqual(before.binding,(await tool('pc_run')).binding,key);
    await assert.rejects(before.execute({command:'echo ok'},{},{}),/computador mudou/);computers=original;
   }
  });
  await t.test('local host destination and token changes invalidate approval',async()=>{
   process.env.CELL_HOST_URL='http://host-a';process.env.CELL_HOST_TOKEN='secret-a';
   const before=await tool('pc_run');process.env.CELL_HOST_TOKEN='secret-b';
   assert.notEqual(before.binding,(await tool('pc_run')).binding);
   await assert.rejects(before.execute({computer:'este-pc',command:'echo ok'},{},{}),/computador mudou/);
   process.env.CELL_HOST_URL='http://host-b';assert.notEqual(before.binding,(await tool('pc_run')).binding);
   delete process.env.CELL_HOST_URL;delete process.env.CELL_HOST_TOKEN;
  });
  await t.test('all executable recipe fields invalidate binding and stale execution',async()=>{
   for(const [key,value] of Object.entries({id:'recipe-b',name:'Other',trusted:true,computer_key:'other',command:'rm data',cwd:'/tmp',background:true})){
    const original=structuredClone(recipes),before=await tool('pc_recipe');recipes[0][key]=value;
    assert.notEqual(before.binding,(await tool('pc_recipe'))?.binding,key);
    await assert.rejects(before.execute({name:'Backup'},{},{}),/receita mudou/);recipes=original;
   }
  });
  await t.test('activity timestamps do not invalidate a recipe approval',async()=>{
   const before=await tool('pc_recipe');recipes[0].last_run_at=new Date();recipes[0].updated_at=new Date();
   assert.equal(before.binding,(await tool('pc_recipe')).binding);
  });
  await t.test('recipe destination is bound independently of recipe content',async()=>{
   const before=await tool('pc_recipe');computers[0].host='server-b';
   assert.notEqual(before.binding,(await tool('pc_recipe')).binding);
   await assert.rejects(before.execute({name:'Backup'},{},{}),/computador mudou/);
  });
 }finally{
  db.mock.restore();
  if(oldUrl===undefined)delete process.env.CELL_HOST_URL;else process.env.CELL_HOST_URL=oldUrl;
  if(oldToken===undefined)delete process.env.CELL_HOST_TOKEN;else process.env.CELL_HOST_TOKEN=oldToken;
 }
});
