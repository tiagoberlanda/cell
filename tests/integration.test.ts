import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,type ChildProcess} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import Fastify from 'fastify';
import argon2 from 'argon2';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {z} from 'zod';

test('API, worker, 9router e MCP integrados', {skip:!process.env.TEST_DATABASE_URL,timeout:180000},async t=>{
 process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;process.env.SECRET_KEY='ca'.repeat(32);process.env.COOKIE_SECURE='false';process.env.APP_ORIGIN='http://localhost:5173';process.env.WORKSPACE_PATH='./.cache/integration-data';
 const {query,one,pool}=await import('../apps/server/src/db.js');
 const {migrate}=await import('../apps/server/src/migrate.js');
 const {buildApp,seed}=await import('../apps/server/src/api.js');
 const {startQueue,boss,enqueue}=await import('../apps/server/src/runtime.js');
 const fake=Fastify();let writes=0,reads=0,worker:ChildProcess|undefined;let workerErrors='';
 let targetAgent='';let mcpName='';
 fake.get('/v1/models',async(req,reply)=>req.headers.authorization==='Bearer test-secret'?{data:[{id:'cell-test',name:'Modelo de teste'}]}:reply.code(401).send({error:'unauthorized'}));
 fake.get('/v1/models/web',async()=>({data:[{id:'test/search',kind:'webSearch'},{id:'test/fetch',kind:'webFetch'}]}));
 fake.post('/v1/search',async()=>({results:[{title:'Fonte de teste',url:'https://example.com',snippet:'Resultado controlado.'}]}));
 fake.post('/v1/web/fetch',async()=>({text:'Texto público de teste.'}));
 fake.post('/v1/chat/completions',async(req,reply)=>{
  const b=req.body as any;if(req.headers.authorization!=='Bearer test-secret')return reply.code(401).send({error:'bad token'});
  if(!b.stream)return {choices:[{message:{content:'Imagem recebida.',tool_calls:[{id:'probe',type:'function',function:{name:'cell_probe',arguments:'{"ok":true}'}}]}}]};
  const last=b.messages.at(-1),text=typeof last.content==='string'?last.content:JSON.stringify(last.content);let tool:string|undefined,args:any={};
  if(last.role==='user'){
   if(text.includes('MAKE_FILE')){tool='write_file';args={name:'resultado.md',content:'# Entrega\nArquivo produzido.'};}
   if(text.includes('SEARCH_WEB')){tool='web_search';args={query:'teste'};}
   if(text.includes('CALL_MCP')){tool=mcpName;args={value:'resultado'};}
   if(text.includes('DELEGATE')){tool='delegate';args={agentId:targetAgent,task:'Responda como especialista.'};}
  }
  reply.hijack();reply.raw.writeHead(200,{'Content-Type':'text/event-stream'});
  const packet=(p:any)=>reply.raw.write('data: '+JSON.stringify(p)+'\n\n');
  if(text.includes('SLOW_TEST'))await sleep(2500);
  if(tool){packet({choices:[{delta:{tool_calls:[{index:0,id:'call_'+Math.random().toString(36).slice(2),type:'function',function:{name:tool,arguments:JSON.stringify(args)}}]}}]});}
  else{packet({choices:[{delta:{content:'Resultado '}}]});await sleep(20);packet({choices:[{delta:{content:'concluído com evidências.'}}]});}
  packet({choices:[],usage:{prompt_tokens:15,completion_tokens:9}});if(!text.includes('BROKEN_STREAM'))reply.raw.write('data: [DONE]\n\n');reply.raw.end();
 });
 fake.post('/mcp',async(req,reply)=>{if(req.headers.authorization!=='Bearer mcp-secret')return reply.code(401).send({error:'unauthorized'});const server=new McpServer({name:'cell-test',version:'1.0.0'});server.registerTool('read_public',{description:'Leitura controlada',inputSchema:{value:z.string()}},async a=>{reads++;return {content:[{type:'text',text:a.value}]};});server.registerTool('write_external',{description:'Escrita controlada',inputSchema:{value:z.string()}},async a=>{writes++;return {content:[{type:'text',text:a.value}]};});const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});await server.connect(transport);reply.hijack();await transport.handleRequest(req.raw,reply.raw,req.body);reply.raw.on('close',()=>{transport.close();server.close();});});
 await fake.listen({host:'127.0.0.1',port:0});const base=`http://127.0.0.1:${(fake.server.address() as any).port}`;
 process.env.NINEROUTER_BASE_URL=base+'/v1';process.env.NINEROUTER_API_KEY='test-secret';process.env.NINEROUTER_DEFAULT_MODEL='cell-test';
 // TEST_DATABASE_URL must point at a disposable test database; never production.
 assert.ok(new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith('_test'),'Use um banco com sufixo _test.');
 await query('DROP SCHEMA IF EXISTS pgboss CASCADE');await query('DROP SCHEMA public CASCADE');await query('CREATE SCHEMA public');await migrate();await seed();await startQueue();
 await query('INSERT INTO users(username,password_hash) VALUES($1,$2)',['tester',await argon2.hash('test-password-long')]);
 const app=await buildApp();await app.ready();let cookie='',csrf='';
 const request=async(method:any,url:string,payload?:any)=>{const r=await app.inject({method,url:'/api'+url,headers:{cookie,'x-csrf-token':csrf,origin:'http://localhost:5173'},payload});if(r.statusCode>=400)throw new Error(`${r.statusCode}: ${r.body}`);return r.json();};
 const poll=async(id:string,state:string,timeout=35000)=>{const deadline=Date.now()+timeout;while(Date.now()<deadline){const r=await one('SELECT * FROM runs WHERE id=$1',[id]);if(r.state===state)return r;if(r.state==='failed'&&state!=='failed')throw new Error(r.error+'\n'+workerErrors);await sleep(200);}throw new Error(`Timeout ${state}: ${JSON.stringify(await one('SELECT state,error FROM runs WHERE id=$1',[id]))}\n${workerErrors}`);};
 const launch=()=>{worker=spawn(process.execPath,['--import','tsx','apps/server/src/worker.ts'],{cwd:process.cwd(),env:process.env,stdio:['ignore','pipe','pipe']});worker.stderr?.on('data',d=>workerErrors+=d.toString());};
 t.after(async()=>{worker?.kill();await app.close();await boss.stop({graceful:false});await fake.close();await pool.end();});
 let agent:any;
 await t.test('login, CSRF, segredos e modelos',async()=>{
  assert.equal((await app.inject('/api/agents')).statusCode,401);
  const login=await app.inject({method:'POST',url:'/api/login',payload:{username:'tester',password:'test-password-long'}});assert.equal(login.statusCode,200);cookie=String(login.headers['set-cookie']).split(';')[0];csrf=login.json().csrf;
  const settings=await request('GET','/settings');assert.equal(settings.hasToken,true);assert.ok(!JSON.stringify(settings).includes('test-secret'));
  assert.equal((await app.inject({method:'PUT',url:'/api/settings',headers:{cookie},payload:{}})).statusCode,403);
  const models=await request('GET','/models');assert.equal(models.models[0].id,'cell-test');assert.equal((await request('POST','/models/probe',{model:'cell-test'})).tools,true);
  agent=(await request('GET','/agents'))[0];targetAgent=(await request('GET','/agents'))[1].id;launch();
 });
 const task=async(prompt:string)=>{const cv=await request('POST',`/agents/${agent.id}/conversations`,{});return request('POST',`/conversations/${cv.id}/messages`,{content:prompt});};
 await t.test('streaming completo e recuperação de histórico',async()=>{const r=await task('Olá');await poll(r.id,'completed');const run=await one('SELECT * FROM runs WHERE id=$1',[r.id]);const view=await request('GET','/conversations/'+run.conversation_id);assert.equal(view.messages.at(-1).content,'Resultado concluído com evidências.');assert.ok(!JSON.stringify(view).includes('test-secret'));assert.equal(view.runs[0].usage.prompt_tokens,15);});
 await t.test('arquivo produzido e pesquisa web reais pelo adaptador',async()=>{const r=await task('MAKE_FILE');await poll(r.id,'completed');assert.equal((await request('GET','/files'))[0].name,'resultado.md');const search=await task('SEARCH_WEB');await poll(search.id,'completed');assert.ok((await one('SELECT result FROM tool_calls WHERE run_id=$1',[search.id])).result.includes('Fonte de teste'));});
 let connectionId='';
 await t.test('MCP descobre ferramentas; escrita espera aprovação',async()=>{const c=await request('POST','/connections',{name:'MCP teste',url:base+'/mcp',headers:{Authorization:'Bearer mcp-secret'},readTools:['read_public']});connectionId=c.id;const discovery=await request('POST',`/connections/${c.id}/test`);assert.equal(discovery.tools.length,2);mcpName=(await request('GET','/tools')).find((x:any)=>x.label.includes('write_external')).name;agent.tools.push(mcpName);await request('PUT','/agents/'+agent.id,agent);const r=await task('CALL_MCP');await poll(r.id,'waiting_approval');assert.equal(writes,0);const approval=await one('SELECT a.id FROM approvals a JOIN tool_calls t ON t.id=a.call_id WHERE t.run_id=$1',[r.id]);await request('POST','/approvals/'+approval.id,{decision:'approved'});await poll(r.id,'completed');assert.equal(writes,1);await enqueue(r.id);await sleep(500);assert.equal(writes,1);});
 await t.test('negar uma chamada impede escrita externa',async()=>{const r=await task('CALL_MCP');await poll(r.id,'waiting_approval');const a=await one('SELECT a.id FROM approvals a JOIN tool_calls t ON t.id=a.call_id WHERE t.run_id=$1',[r.id]);await request('POST','/approvals/'+a.id,{decision:'denied'});await poll(r.id,'completed');assert.equal(writes,1);});
 await t.test('mudança de parâmetros invalida a aprovação',async()=>{const r=await task('CALL_MCP');await poll(r.id,'waiting_approval');const a=await one('SELECT a.id,a.call_id FROM approvals a JOIN tool_calls t ON t.id=a.call_id WHERE t.run_id=$1',[r.id]);await query('UPDATE tool_calls SET args=$2 WHERE id=$1',[a.call_id,JSON.stringify({value:'changed'})]);await request('POST','/approvals/'+a.id,{decision:'approved'});await poll(r.id,'failed');assert.equal(writes,1);});
 await t.test('delegação volta ao pai sem bloquear a fila',async()=>{const r=await task('DELEGATE');await poll(r.id,'completed',50000);const child=await one('SELECT * FROM runs WHERE parent_id=$1',[r.id]);assert.equal(child.state,'completed');assert.equal(child.agent_id,targetAgent);});
 await t.test('cancelar streaming não grava mensagem final',async()=>{const r=await task('SLOW_TEST');await poll(r.id,'running');await request('POST','/runs/'+r.id+'/cancel');await sleep(3000);assert.equal((await one('SELECT state FROM runs WHERE id=$1',[r.id])).state,'cancelled');});
 await t.test('streaming incompleto é marcado como falha',async()=>{const r=await task('BROKEN_STREAM');await poll(r.id,'failed');});
 await t.test('rotina perdida não acumula execuções',async()=>{const r=await request('POST','/routines',{agentId:agent.id,name:'Rotina teste',prompt:'Olá',kind:'daily',schedule:'08:00',timezone:'America/Sao_Paulo',enabled:true});await query("UPDATE routines SET next_at=now()-interval '10 minutes' WHERE id=$1",[r.id]);await sleep(12000);const h=await request('GET',`/routines/${r.id}/history`);assert.equal(h[0].status,'missed');assert.equal(h[0].run_id,null);});
 await t.test('excluir mensagens e avisos de erro',async()=>{const failed=await one("SELECT id FROM runs WHERE state='failed' LIMIT 1");assert.ok(failed,'precisa de uma execução com falha');await request('DELETE','/runs/'+failed.id);assert.equal(await one('SELECT id FROM runs WHERE id=$1',[failed.id]),undefined);const done=await one("SELECT id,conversation_id FROM runs WHERE state='completed' LIMIT 1");await assert.rejects(request('DELETE','/runs/'+done.id),/400/);const msg=await one('SELECT id FROM messages WHERE conversation_id=$1 LIMIT 1',[done.conversation_id]);await request('DELETE','/messages/'+msg.id);assert.equal(await one('SELECT id FROM messages WHERE id=$1',[msg.id]),undefined);});
 await t.test('Coordenador é o agente principal e gerencia a equipe',async()=>{const {toolsFor}=await import('../apps/server/src/tools.js');const master=await one('SELECT * FROM agents WHERE is_master');assert.equal(master.name,'Coordenador');await assert.rejects(request('DELETE','/agents/'+master.id),/400/);await assert.rejects(request('POST','/agents/'+master.id+'/archive',{archived:true}),/400/);const other=await one('SELECT id FROM agents WHERE NOT is_master LIMIT 1');const cfg={agent:{tools:[]}};assert.equal((await toolsFor({agent_id:other.id},cfg)).some((x:any)=>x.name==='create_agent'),false);const tools=await toolsFor({agent_id:master.id},cfg),create=tools.find((x:any)=>x.name==='create_agent'),remove=tools.find((x:any)=>x.name==='delete_agent');assert.ok(create&&remove);assert.equal(remove.write,true,'excluir exige aprovação');await assert.rejects(create.execute({name:'Sem cargo'},{},{}));const made=JSON.parse(await create.execute({name:'Analista',role:'Analista de Dados',description:'Analisa planilhas e métricas.'},{},{}));const row=await one('SELECT role,description,shape FROM agents WHERE id=$1',[made.id]);assert.equal(row.role,'Analista de Dados');assert.equal(row.description,'Analisa planilhas e métricas.');await assert.rejects(create.execute({name:'analista',role:'X',description:'Y'},{},{}),/Já existe/);await assert.rejects(remove.execute({agentId:made.id,name:'Outro'},{},{}),/pertence a Analista/);await assert.rejects(remove.execute({agentId:master.id,name:'Coordenador'},{},{}),/principal/);await remove.execute({agentId:made.id,name:'Analista'},{},{});assert.equal(await one('SELECT id FROM agents WHERE id=$1',[made.id]),undefined);});
 await t.test('memória, habilidades e conversa persistem',async()=>{const skill=await request('POST','/skills',{name:'Checklist',body:'# Revisar\nConferir as fontes.'});agent.skills=[skill.id];agent.memory='Prefere respostas objetivas.';await request('PUT','/agents/'+agent.id,agent);const r=await task('Persistência');await poll(r.id,'completed');const stored=await one('SELECT context FROM runs WHERE id=$1',[r.id]);assert.ok(stored.context[0].content.includes('Prefere respostas objetivas.'));assert.ok(stored.context[0].content.includes('Conferir as fontes.'));});
});
