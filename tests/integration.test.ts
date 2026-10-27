import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,type ChildProcess} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import Fastify from 'fastify';
import argon2 from 'argon2';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {z} from 'zod';

test('API, worker, 9router e MCP integrados', {skip:!process.env.TEST_DATABASE_URL,timeout:360000},async t=>{
 process.env.ALLOW_HTTP_PUSH='1';process.env.PUSH_DELAY_MS='800';process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;process.env.SECRET_KEY='ca'.repeat(32);process.env.COOKIE_SECURE='false';process.env.APP_ORIGIN='http://localhost:5173';process.env.WORKSPACE_PATH='./.cache/integration-data';
 const {mkdtempSync,mkdirSync,writeFileSync,existsSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const hostRoot=mkdtempSync(join(tmpdir(),'cell-host-'));process.env.HOST_DRIVES_ROOT=hostRoot;
 mkdirSync(join(hostRoot,'k','Downloads','sub'),{recursive:true});mkdirSync(join(hostRoot,'k','Outros'),{recursive:true});
 writeFileSync(join(hostRoot,'k','Downloads','notas.txt'),'Lista de compras: pão e café.');writeFileSync(join(hostRoot,'k','Downloads','foto.jpg'),Buffer.alloc(300,7));
 writeFileSync(join(hostRoot,'k','Downloads','.env'),'SECRET=1');writeFileSync(join(hostRoot,'k','Downloads','sub','x.txt'),'interno');writeFileSync(join(hostRoot,'k','Outros','privado.txt'),'não liberado');
 const {query,one,pool}=await import('../apps/server/src/db.js');
 const {migrate}=await import('../apps/server/src/migrate.js');
 const {buildApp,seed}=await import('../apps/server/src/api.js');
 const {startQueue,boss,enqueue}=await import('../apps/server/src/runtime.js');
 const {fileData,saveFile}=await import('../apps/server/src/files.js');
 const fake=Fastify();let writes=0,reads=0,worker:ChildProcess|undefined;let workerErrors='';
 let targetAgent='';let mcpName='';let mcpFailName='';const summaryRequests:any[]=[];
 fake.get('/v1/models',async(req,reply)=>req.headers.authorization==='Bearer test-secret'?{data:[{id:'cell-test',name:'Modelo de teste'}]}:reply.code(401).send({error:'unauthorized'}));
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');let imageCalls:any[]=[];
 fake.get('/v1/models/image',async()=>({data:[{id:'test/image'}]}));
 fake.post('/v1/images/generations',async(req:any,reply)=>{imageCalls.push({query:req.query,body:req.body});if(req.body.size)return reply.code(400).send({error:{message:'size not allowed'}});return reply.type('image/png').send(png);});
 // Fake push service: records encrypted Web Push deliveries; '/push/gone' answers 410 like an expired subscription.
 const pushes:{id:string;headers:any;body:Buffer}[]=[];
 fake.addContentTypeParser('application/octet-stream',{parseAs:'buffer'},(_req:any,body:any,done:any)=>done(null,body));
 fake.post('/push/:id',async(req:any,reply)=>{pushes.push({id:req.params.id,headers:req.headers,body:req.body});return reply.code(req.params.id==='gone'?410:201).send();});
 // Fake speech services: transcription (multipart, like Whisper) and text to speech (raw MP3 bytes).
 const transcriptionRequests:string[]=[],speechRequests:any[]=[];
 fake.addContentTypeParser(/^multipart\/form-data/,{parseAs:'buffer'},(_req:any,body:any,done:any)=>done(null,body));
 fake.get('/v1/models/stt',async()=>({data:[{id:'test/stt'}]}));fake.get('/v1/models/tts',async()=>({data:[{id:'test/tts'}]}));
 fake.post('/v1/audio/transcriptions',async(req:any)=>{transcriptionRequests.push(req.body.toString('latin1'));return {text:'Quais são as tarefas de amanhã?'};});
 fake.post('/v1/audio/speech',async(req:any,reply)=>{speechRequests.push(req.body);return reply.type('audio/mpeg').send(Buffer.from('ID3fake-mp3-audio-'.repeat(20)));});
 fake.get('/v1/models/web',async()=>({data:[{id:'test/search',kind:'webSearch'},{id:'test/fetch',kind:'webFetch'}]}));
 fake.post('/v1/search',async()=>({results:[{title:'Fonte de teste',url:'https://example.com',snippet:'Resultado controlado.'}]}));
 fake.post('/v1/web/fetch',async()=>({text:'Texto público de teste.'}));
 fake.post('/v1/chat/completions',async(req,reply)=>{
  const b=req.body as any;if(req.headers.authorization!=='Bearer test-secret')return reply.code(401).send({error:'bad token'});
  if(String(b.messages?.[0]?.content||'').startsWith('Atualize o resumo'))summaryRequests.push(b);
  if(!b.stream)return {choices:[{message:{content:'Imagem recebida.',tool_calls:[{id:'probe',type:'function',function:{name:'cell_probe',arguments:'{"ok":true}'}}]}}]};
  const last=b.messages.at(-1),text=typeof last.content==='string'?last.content:JSON.stringify(last.content);let tool:string|undefined,args:any={};
  if(last.role==='user'){
   if(text.includes('MAKE_FILE')){tool='write_file';args={name:'resultado.md',content:'# Entrega\nArquivo produzido.'};}
   if(text.includes('SEARCH_WEB')){tool='web_search';args={query:'teste'};}
   if(text.includes('CALL_MCP')){tool=mcpName;args={value:'resultado'};}
   if(text.includes('DELEGATE')){tool='delegate';args={agentId:/DELEGATE_TO:([0-9a-f-]{36})/.exec(text)?.[1]||targetAgent,task:'Responda como especialista.'};}
   if(text.includes('CALL_MCP_FAIL')){tool=mcpFailName;args={value:'falha'};}
   // Keys in an order jsonb rewrites (it sorts by length): the approval must survive the round trip through the database.
   if(text.includes('MAKE_SHEET')){tool='create_spreadsheet';args={name:'Vendas: 3º trimestre.xlsx',sheets:[{name:'Resumo',columns:['Mês','Vendas','Meta','Atingido'],rows:[['Julho',120,100,'=B2/C2'],['Agosto',98,110,'=B3/C3']]}]};}
   if(text.includes('PC_ACCESS')){tool='pc_request_access';args={path:'k:/Downloads/',reason:'Organizar os downloads'};}
   if(text.includes('CALL_MCP_ORDER')){tool=mcpName;args={value:'ordem',properties:{Status:'Sugestões',TAG:'Natureza',Nome:'Florestas'}};}
  }
  reply.hijack();reply.raw.writeHead(200,{'Content-Type':'text/event-stream'});
  const packet=(p:any)=>reply.raw.write('data: '+JSON.stringify(p)+'\n\n');
  if(text.includes('SLOW_TEST'))await sleep(2500);
  if(tool){packet({choices:[{delta:{tool_calls:[{index:0,id:'call_'+Math.random().toString(36).slice(2),type:'function',function:{name:tool,arguments:JSON.stringify(args)}}]}}]});}
  else{packet({choices:[{delta:{content:'Resultado '}}]});await sleep(20);packet({choices:[{delta:{content:'concluído com evidências.'}}]});}
  packet({choices:[],usage:{prompt_tokens:15,completion_tokens:9}});if(!text.includes('BROKEN_STREAM'))reply.raw.write('data: [DONE]\n\n');reply.raw.end();
 });
 fake.post('/mcp',async(req,reply)=>{if(req.headers.authorization!=='Bearer mcp-secret')return reply.code(401).send({error:'unauthorized'});const server=new McpServer({name:'cell-test',version:'1.0.0'});server.registerTool('read_public',{description:'Leitura controlada',inputSchema:{value:z.string()}},async a=>{reads++;return {content:[{type:'text',text:a.value}]};});server.registerTool('write_external',{description:'Escrita controlada',inputSchema:{value:z.string()}},async a=>{writes++;return {content:[{type:'text',text:a.value}]};});server.registerTool('fail_external',{description:'Escrita que falha',inputSchema:{value:z.string()}},async()=>({isError:true,content:[{type:'text',text:'Serviço recusou a operação.'}]}));const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});await server.connect(transport);reply.hijack();await transport.handleRequest(req.raw,reply.raw,req.body);reply.raw.on('close',()=>{transport.close();server.close();});});
 // Fake OAuth world for one-click connectors: an authorization server with dynamic registration (Notion-like), one without
 // it that needs a pre-registered client (Google-like MCP), MCP servers that demand a bearer token, and Google Tasks.
 const oauthCodes=new Map<string,any>(),validTokens=new Set<string>();let registered:any[]=[],googleRefreshes=0;const tasksDb:any[]=[];
 fake.addContentTypeParser('application/x-www-form-urlencoded',{parseAs:'string'},(_req:any,body:any,done:any)=>done(null,Object.fromEntries(new URLSearchParams(body))));
 const asMeta=(issuer:string,dcr:boolean)=>({issuer:fakeBase+issuer,authorization_endpoint:fakeBase+issuer+'/authorize',token_endpoint:fakeBase+issuer+'/token',...(dcr?{registration_endpoint:fakeBase+issuer+'/register'}:{}),response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:dcr?['none']:['client_secret_post']});
 let fakeBase='';
 for(const [issuer,dcr] of [['/as',true],['/gas',false]] as const){
  fake.get('/.well-known/oauth-authorization-server'+issuer,async()=>asMeta(issuer,dcr));
  fake.post(issuer+'/register',async(req:any)=>{const c={...req.body,client_id:'dcr-'+(registered.length+1)};registered.push(c);return c;});
  fake.get(issuer+'/authorize',async(req:any,reply)=>{const q=req.query;const code='code-'+Math.random().toString(36).slice(2);oauthCodes.set(code,{client:q.client_id,challenge:q.code_challenge,redirect:q.redirect_uri,scope:q.scope});return reply.redirect(`${q.redirect_uri}?code=${code}&state=${encodeURIComponent(q.state)}`);});
  fake.post(issuer+'/token',async(req:any,reply)=>{const b=req.body,c=oauthCodes.get(b.code);const {createHash}=await import('node:crypto');
   if(!c||createHash('sha256').update(b.code_verifier||'').digest('base64url')!==c.challenge||b.redirect_uri!==c.redirect||(!dcr&&b.client_secret!=='gsecret-1234567'))return reply.code(400).send({error:'invalid_grant'});
   oauthCodes.delete(b.code);const token='tok-'+Math.random().toString(36).slice(2);validTokens.add(token);return {access_token:token,token_type:'Bearer',expires_in:3600,refresh_token:'refresh-1'};});
 }
 for(const [path,issuer] of [['/oauth-mcp','/as'],['/google-mcp','/gas']]){
  fake.get('/.well-known/oauth-protected-resource'+path,async()=>({resource:fakeBase+path,authorization_servers:[fakeBase+issuer]}));
  fake.post(path,async(req:any,reply)=>{const token=String(req.headers.authorization||'').replace('Bearer ','');
   if(!validTokens.has(token))return reply.code(401).header('WWW-Authenticate',`Bearer resource_metadata="${fakeBase}/.well-known/oauth-protected-resource${path}"`).send({error:'unauthorized'});
   const server=new McpServer({name:'oauth-test',version:'1.0.0'});
   server.registerTool('search_pages',{description:'Busca páginas',inputSchema:{query:z.string()},annotations:{readOnlyHint:true}},async a=>({content:[{type:'text',text:`1 página encontrada para ${a.query}`}]}));
   server.registerTool('list_items',{description:'Lista itens',inputSchema:{}},async()=>({content:[{type:'text',text:'[]'}]}));
   server.registerTool('create_page',{description:'Cria página',inputSchema:{title:z.string()}},async a=>({content:[{type:'text',text:`criada ${a.title}`}]}));
   const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});await server.connect(transport);reply.hijack();await transport.handleRequest(req.raw,reply.raw,req.body);reply.raw.on('close',()=>{transport.close();server.close();});});
 }
 fake.get('/google/authorize',async(req:any,reply)=>{const q=req.query;const code='g-'+Math.random().toString(36).slice(2);oauthCodes.set(code,{challenge:q.code_challenge,redirect:q.redirect_uri,client:q.client_id});return reply.redirect(`${q.redirect_uri}?code=${code}&state=${encodeURIComponent(q.state)}`);});
 fake.post('/google/token',async(req:any,reply)=>{const b=req.body;if(b.client_secret!=='gsecret-1234567')return reply.code(401).send({error:'invalid_client'});
  if(b.grant_type==='refresh_token'){googleRefreshes++;const t='gt-'+Math.random().toString(36).slice(2);validTokens.add(t);return {access_token:t,expires_in:3600};}
  const c=oauthCodes.get(b.code);const {createHash}=await import('node:crypto');if(!c||createHash('sha256').update(b.code_verifier||'').digest('base64url')!==c.challenge)return reply.code(400).send({error:'invalid_grant'});
  const t='gt-'+Math.random().toString(36).slice(2);validTokens.add(t);return {access_token:t,refresh_token:'g-refresh',expires_in:1};});
 const gAuth=(req:any,reply:any)=>{if(!validTokens.has(String(req.headers.authorization||'').replace('Bearer ',''))){reply.code(401).send({error:'unauthorized'});return false;}return true;};
 fake.get('/google/tasks/users/@me/lists',async(req,reply)=>gAuth(req,reply)&&{items:[{id:'@default',title:'Minhas tarefas'}]});
 fake.get('/google/tasks/lists/:list/tasks',async(req:any,reply)=>gAuth(req,reply)&&{items:tasksDb.filter(t=>req.query.showCompleted==='true'||t.status!=='completed')});
 fake.post('/google/tasks/lists/:list/tasks',async(req:any,reply)=>{if(!gAuth(req,reply))return;const t={id:'t'+(tasksDb.length+1),status:'needsAction',...req.body};tasksDb.push(t);return t;});
 fake.patch('/google/tasks/lists/:list/tasks/:id',async(req:any,reply)=>{if(!gAuth(req,reply))return;const t=tasksDb.find(x=>x.id===req.params.id);Object.assign(t,req.body);return t;});
 await fake.listen({host:'127.0.0.1',port:0});const base=`http://127.0.0.1:${(fake.server.address() as any).port}`;
 fakeBase=base;process.env.CONNECTOR_URL_OVERRIDES=JSON.stringify({notion:base+'/oauth-mcp',canva:base+'/oauth-mcp',gmail:base+'/google-mcp'});process.env.GOOGLE_OAUTH_AUTHORIZE=base+'/google/authorize';process.env.GOOGLE_OAUTH_TOKEN=base+'/google/token';process.env.GOOGLE_TASKS_API=base+'/google/tasks';process.env.NINEROUTER_BASE_URL=base+'/v1';process.env.NINEROUTER_API_KEY='test-secret';process.env.NINEROUTER_DEFAULT_MODEL='cell-test';
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
 await t.test('MCP descobre ferramentas; escrita espera aprovação',async()=>{const c=await request('POST','/connections',{name:'MCP teste',url:base+'/mcp',headers:{Authorization:'Bearer mcp-secret'},readTools:['read_public']});connectionId=c.id;const discovery=await request('POST',`/connections/${c.id}/test`);assert.equal(discovery.tools.length,3);mcpName=(await request('GET','/tools')).find((x:any)=>x.label.includes('write_external')).name;agent.tools.push(mcpName);await request('PUT','/agents/'+agent.id,agent);const r=await task('CALL_MCP');await poll(r.id,'waiting_approval');assert.equal(writes,0);const approval=await one('SELECT a.id FROM approvals a JOIN tool_calls t ON t.id=a.call_id WHERE t.run_id=$1',[r.id]);await request('POST','/approvals/'+approval.id,{decision:'approved'});await poll(r.id,'completed');assert.equal(writes,1);await enqueue(r.id);await sleep(500);assert.equal(writes,1);});
 await t.test('negar uma chamada impede escrita externa',async()=>{const r=await task('CALL_MCP');await poll(r.id,'waiting_approval');const a=await one('SELECT a.id FROM approvals a JOIN tool_calls t ON t.id=a.call_id WHERE t.run_id=$1',[r.id]);await request('POST','/approvals/'+a.id,{decision:'denied'});await poll(r.id,'completed');assert.equal(writes,1);});
 await t.test('aprovação sobrevive à reordenação de chaves do banco e expira se a execução acaba',async()=>{
  const r=await task('CALL_MCP_ORDER');await poll(r.id,'waiting_approval');
  const a=await one('SELECT a.id,a.status FROM approvals a JOIN tool_calls t ON t.id=a.call_id WHERE t.run_id=$1',[r.id]);assert.equal(a.status,'pending');
  const before=writes;await request('POST','/approvals/'+a.id,{decision:'approved'});await poll(r.id,'completed');assert.equal(writes,before+1);
  const {setState}=await import('../apps/server/src/runtime.js');
  const r2=await task('CALL_MCP_ORDER');await poll(r2.id,'waiting_approval');await setState(r2.id,'failed','Falha simulada');
  const a2=await one('SELECT a.id,a.status FROM approvals a JOIN tool_calls t ON t.id=a.call_id WHERE t.run_id=$1',[r2.id]);assert.equal(a2.status,'cancelled','aprovação de execução encerrada não fica pendente');
  await assert.rejects(request('POST','/approvals/'+a2.id,{decision:'approved'}),/não está mais pendente/);
 });
 await t.test('mudança de parâmetros invalida a aprovação',async()=>{const w=writes;const r=await task('CALL_MCP');await poll(r.id,'waiting_approval');const a=await one('SELECT a.id,a.call_id FROM approvals a JOIN tool_calls t ON t.id=a.call_id WHERE t.run_id=$1',[r.id]);await query('UPDATE tool_calls SET args=$2 WHERE id=$1',[a.call_id,JSON.stringify({value:'changed'})]);await request('POST','/approvals/'+a.id,{decision:'approved'});await poll(r.id,'failed');assert.equal(writes,w,'nenhuma escrita com parâmetros alterados');});
 await t.test('delegação volta ao pai sem bloquear a fila',async()=>{const r=await task('DELEGATE');await poll(r.id,'completed',50000);const child=await one('SELECT * FROM runs WHERE parent_id=$1',[r.id]);assert.equal(child.state,'completed');assert.equal(child.agent_id,targetAgent);});
 await t.test('cancelar streaming não grava mensagem final',async()=>{const r=await task('SLOW_TEST');await poll(r.id,'running');await request('POST','/runs/'+r.id+'/cancel');await sleep(3000);assert.equal((await one('SELECT state FROM runs WHERE id=$1',[r.id])).state,'cancelled');});
 await t.test('streaming incompleto é marcado como falha',async()=>{const r=await task('BROKEN_STREAM');await poll(r.id,'failed');});
 await t.test('rotina perdida não acumula execuções',async()=>{const r=await request('POST','/routines',{agentId:agent.id,name:'Rotina teste',prompt:'Olá',kind:'daily',schedule:'08:00',timezone:'America/Sao_Paulo',enabled:true});await query("UPDATE routines SET next_at=now()-interval '3 hours' WHERE id=$1",[r.id]);await sleep(12000);const h=await request('GET',`/routines/${r.id}/history`);assert.equal(h.length,1);assert.equal(h[0].status,'missed');assert.equal(h[0].run_id,null);});
 await t.test('excluir mensagens e avisos de erro',async()=>{const failed=await one("SELECT id FROM runs WHERE state='failed' LIMIT 1");assert.ok(failed,'precisa de uma execução com falha');await request('DELETE','/runs/'+failed.id);assert.equal(await one('SELECT id FROM runs WHERE id=$1',[failed.id]),undefined);const done=await one("SELECT id,conversation_id FROM runs WHERE state='completed' LIMIT 1");await assert.rejects(request('DELETE','/runs/'+done.id),/400/);const msg=await one('SELECT id FROM messages WHERE conversation_id=$1 LIMIT 1',[done.conversation_id]);await request('DELETE','/messages/'+msg.id);assert.equal(await one('SELECT id FROM messages WHERE id=$1',[msg.id]),undefined);});
 await t.test('Coordenador é o agente principal e gerencia a equipe',async()=>{const {toolsFor}=await import('../apps/server/src/tools.js');const master=await one('SELECT * FROM agents WHERE is_master');assert.equal(master.name,'Coordenador');await assert.rejects(request('DELETE','/agents/'+master.id),/400/);await assert.rejects(request('POST','/agents/'+master.id+'/archive',{archived:true}),/400/);const other=await one('SELECT id FROM agents WHERE NOT is_master LIMIT 1');const cfg={agent:{tools:[]}};assert.equal((await toolsFor({agent_id:other.id},cfg)).some((x:any)=>x.name==='create_agent'),false);const tools=await toolsFor({agent_id:master.id},cfg),create=tools.find((x:any)=>x.name==='create_agent'),remove=tools.find((x:any)=>x.name==='delete_agent');assert.ok(create&&remove);assert.equal(remove.write,true,'excluir exige aprovação');await assert.rejects(create.execute({name:'Sem cargo'},{},{}));const made=JSON.parse(await create.execute({name:'Analista',role:'Analista de Dados',description:'Analisa planilhas e métricas.'},{},{}));const row=await one('SELECT role,description,shape FROM agents WHERE id=$1',[made.id]);assert.equal(row.role,'Analista de Dados');assert.equal(row.description,'Analisa planilhas e métricas.');await assert.rejects(create.execute({name:'analista',role:'X',description:'Y'},{},{}),/Já existe/);await assert.rejects(remove.execute({agentId:made.id,name:'Outro'},{},{}),/pertence a Analista/);await assert.rejects(remove.execute({agentId:master.id,name:'Coordenador'},{},{}),/principal/);await remove.execute({agentId:made.id,name:'Analista'},{},{});assert.equal(await one('SELECT id FROM agents WHERE id=$1',[made.id]),undefined);});
 await t.test('gerar imagem salva arquivo e aparece na mensagem',async()=>{
  const {toolsFor}=await import('../apps/server/src/tools.js');const {config}=await import('../apps/server/src/router.js');
  const tool=(await toolsFor({agent_id:agent.id},{agent:{tools:['generate_image']}})).find((x:any)=>x.name==='generate_image');assert.ok(tool);
  imageCalls=[];const out=JSON.parse(await tool.execute({prompt:'uma célula verde',size:'1024x1024'},{agent_id:agent.id},await config()));
  assert.equal(imageCalls.length,2,'tenta de novo sem size');assert.equal(imageCalls[0].query.response_format,'binary');assert.equal(imageCalls[1].body.size,undefined);
  const file=await one('SELECT mime,size FROM files WHERE id=$1',[out.fileId]);assert.equal(file.mime,'image/png');assert.equal(Number(file.size),png.length);
  const cv=await request('POST',`/agents/${agent.id}/conversations`,{});await query("INSERT INTO messages(conversation_id,role,content,files) VALUES($1,'assistant','pronto',$2)",[cv.id,JSON.stringify([out.fileId])]);
  const msg=(await request('GET','/conversations/'+cv.id)).messages.find((m:any)=>m.content==='pronto');assert.equal(msg.attachments[0].mime,'image/png');
  const inline=await app.inject({method:'GET',url:`/api/files/${out.fileId}?inline=1`,headers:{cookie}});assert.match(String(inline.headers['content-disposition']),/^inline/);
 });
 await t.test('seções e ordem dos agentes',async()=>{
  await request('POST','/sections',{name:'Criativos'});await assert.rejects(request('POST','/sections',{name:'criativos'}),/400/);
  const before=await request('GET','/agents');const ids=before.filter((a:any)=>!a.archived).map((a:any)=>a.id).reverse();
  await request('PUT','/layout',{sections:['Criativos','Equipe'],agents:ids.map((id:string,i:number)=>({id,section:i===0?'Criativos':'Equipe'}))});
  const after=(await request('GET','/agents')).filter((a:any)=>!a.archived);assert.deepEqual(after.map((a:any)=>a.id),ids);assert.equal(after[0].section,'Criativos');
  assert.deepEqual((await request('GET','/sections')).slice(0,2).map((s:any)=>s.name),['Criativos','Equipe']);
  await assert.rejects(request('DELETE','/sections/Criativos'),/400/);
  await request('PUT','/sections/Criativos',{name:'Arte'});assert.equal((await request('GET','/agents')).find((a:any)=>a.id===ids[0]).section,'Arte');
  await request('PUT','/layout',{sections:['Equipe','Arte'],agents:ids.map((id:string)=>({id,section:'Equipe'}))});await request('DELETE','/sections/Arte');
  assert.equal((await request('GET','/sections')).some((s:any)=>s.name==='Arte'),false);
 });
 await t.test('execução interrompida por reinício do worker é retomada',async()=>{const r=await task('SLOW_TEST retomada');await poll(r.id,'running');const old=worker!;await new Promise(done=>{old.once('exit',done);old.kill();});assert.equal((await one('SELECT state FROM runs WHERE id=$1',[r.id])).state,'running');launch();await poll(r.id,'completed',120000);});
 await t.test('arquivar conversa abre outra vazia e guarda a antiga no histórico',async()=>{
  const r=await task('Conversa para arquivar');await poll(r.id,'completed');const old=(await one('SELECT conversation_id FROM runs WHERE id=$1',[r.id])).conversation_id;
  const fresh=await request('POST',`/conversations/${old}/archive`);assert.notEqual(fresh.id,old);assert.equal(fresh.archived_at,null);
  assert.equal((await request('GET','/conversations/'+fresh.id)).messages.length,0,'nova conversa começa vazia');
  const list=await request('GET',`/agents/${agent.id}/conversations`);const archivedRow=list.find((c:any)=>c.id===old);assert.ok(archivedRow.archived_at);assert.ok(archivedRow.message_count>=2);
  assert.ok(list.findIndex((c:any)=>c.id===fresh.id)<list.findIndex((c:any)=>c.id===old),'ativas antes das arquivadas');
  assert.ok((await request('GET','/conversations/'+old)).messages.length>=2,'histórico preservado');
  await assert.rejects(request('POST',`/conversations/${old}/messages`,{content:'oi'}),/arquivada/);await assert.rejects(request('POST',`/conversations/${old}/archive`),/já está arquivada/);
  await request('POST',`/conversations/${old}/restore`);assert.equal((await one('SELECT archived_at FROM conversations WHERE id=$1',[old])).archived_at,null);
 });
 await t.test('sair dos outros dispositivos mantém a sessão atual',async()=>{
  const other=await app.inject({method:'POST',url:'/api/login',headers:{origin:'http://localhost:5173'},payload:{username:'tester',password:'test-password-long'}});
  const otherCookie=String(other.headers['set-cookie']).split(';')[0];assert.equal((await app.inject({method:'GET',url:'/api/me',headers:{cookie:otherCookie}})).statusCode,200);
  const r=await request('POST','/account/logout-others');assert.ok(r.ended>=1);
  assert.equal((await app.inject({method:'GET',url:'/api/me',headers:{cookie:otherCookie}})).statusCode,401,'outra sessão encerrada');
  await request('GET','/me');
 });
 await t.test('rotina interrompida no despacho é retomada sem duplicar',async()=>{
  const {dispatchRoutine}=await import('../apps/server/src/scheduler.js');
  const rt=await request('POST','/routines',{agentId:agent.id,name:'Despacho interrompido',prompt:'Olá rotina',kind:'daily',schedule:'08:00',timezone:'America/Sao_Paulo',enabled:false});
  const at=new Date(Date.now()-30000);
  // Simulates a crash after claiming the slot: a 'dispatching' record without a run.
  const h=await one("INSERT INTO routine_history(routine_id,status,scheduled_at) VALUES($1,'dispatching',$2) RETURNING id",[rt.id,at]);
  await query('UPDATE routines SET enabled=true,next_at=$2 WHERE id=$1',[rt.id,at]);
  const ids=(await Promise.all([dispatchRoutine(rt.id),dispatchRoutine(rt.id)])).filter(Boolean) as string[];
  for(const runId of ids)await enqueue(runId);
  const runs=await query('SELECT id FROM runs WHERE routine_history_id=$1',[h.id]);assert.equal(runs.length,1,'uma única execução');
  assert.equal((await one('SELECT status,run_id FROM routine_history WHERE id=$1',[h.id])).run_id,runs[0].id);
  assert.ok(new Date((await one('SELECT next_at FROM routines WHERE id=$1',[rt.id])).next_at)>new Date(),'próximo horário avançou');
  await poll(runs[0].id,'completed');
 });
 await t.test('rotina com agente indisponível falha uma vez e pausa',async()=>{
  const {dispatchRoutine}=await import('../apps/server/src/scheduler.js');
  const ghost=await request('POST','/agents',{name:'Agente arquivado',role:'Teste',color:'#18b99c',shape:'coco'});await request('POST',`/agents/${ghost.id}/archive`,{archived:true});
  const rt=await request('POST','/routines',{agentId:ghost.id,name:'Rotina órfã',prompt:'Olá',kind:'daily',schedule:'08:00',timezone:'America/Sao_Paulo',enabled:false});
  await query("UPDATE routines SET enabled=true,next_at=now()-interval '5 seconds' WHERE id=$1",[rt.id]);
  assert.equal(await dispatchRoutine(rt.id),undefined);assert.equal(await dispatchRoutine(rt.id),undefined);
  const hist=await query('SELECT status FROM routine_history WHERE routine_id=$1',[rt.id]);assert.deepEqual(hist.map(x=>x.status),['failed']);
  assert.equal((await one('SELECT enabled FROM routines WHERE id=$1',[rt.id])).enabled,false);
 });
 await t.test('mensagens consecutivas veem a resposta anterior',async()=>{
  const cv=await request('POST',`/agents/${agent.id}/conversations`,{});
  await request('POST',`/conversations/${cv.id}/messages`,{content:'Primeira pergunta'});const r2=await request('POST',`/conversations/${cv.id}/messages`,{content:'Segunda pergunta'});
  await poll(r2.id,'completed');const ctx=(await one('SELECT context FROM runs WHERE id=$1',[r2.id])).context;
  const answer=ctx.findIndex((m:any)=>m.role==='assistant'&&String(m.content).includes('Resultado concluído')),question=ctx.findIndex((m:any)=>m.role==='user'&&String(m.content).includes('Segunda pergunta'));
  assert.ok(answer>0&&answer<question,'resposta anterior entra antes da nova pergunta');
 });
 await t.test('janela de contexto limita o histórico enviado e mede o uso',async()=>{
  const {hasToken,...base}=await request('GET','/settings');assert.equal(base.contextTokens,16000,'padrão de 16 mil tokens');
  await request('PUT','/settings',{...base,contextTokens:2000});
  try{
   const cv=await request('POST',`/agents/${agent.id}/conversations`,{});
   assert.equal((await request('GET',`/conversations/${cv.id}/context`)).used,null);
   // Six old messages of ~500 tokens each: only the newest ones fit in a 2,000-token window.
   for(let i=1;i<=6;i++)await query("INSERT INTO messages(conversation_id,role,content,created_at) VALUES($1,'user',$2,now()-make_interval(mins=>10-i))".replace('10-i',String(10-i)),[cv.id,`ANTIGA-${i} `+'palavra '.repeat(250)]);
   const r=await request('POST',`/conversations/${cv.id}/messages`,{content:'Pergunta atual'});await poll(r.id,'completed');
   const sent=JSON.stringify((await one('SELECT context FROM runs WHERE id=$1',[r.id])).context);
   assert.ok(sent.includes('Pergunta atual'));assert.ok(sent.includes('ANTIGA-6'),'a mais recente entra');assert.ok(!sent.includes('ANTIGA-1'),'a mais antiga fica de fora');
   const meter=await request('GET',`/conversations/${cv.id}/context`);assert.equal(meter.max,2000);assert.ok(meter.used>500&&meter.used<=2200,'uso '+meter.used);
  }finally{await request('PUT','/settings',{...base,contextTokens:16000});}
 });
 await t.test('limite de uma etapa executa a ferramenta pendente e conclui',async()=>{
  const {hasToken,...base}=await request('GET','/settings');await request('PUT','/settings',{...base,maxSteps:1});
  try{const r=await task('SEARCH_WEB etapa única');await poll(r.id,'completed');const calls=await query('SELECT status FROM tool_calls WHERE run_id=$1',[r.id]);assert.equal(calls.length,1);assert.equal(calls[0].status,'done');}
  finally{await request('PUT','/settings',{...base,maxSteps:20});}
 });
 await t.test('delegações simultâneas cruzadas não travam',async()=>{
  const cvB=await request('POST',`/agents/${targetAgent}/conversations`,{});
  const [a,b]=await Promise.all([task(`DELEGATE_TO:${targetAgent}`),request('POST',`/conversations/${cvB.id}/messages`,{content:`DELEGATE_TO:${agent.id}`})]);
  await Promise.all([poll(a.id,'completed',60000),poll(b.id,'completed',60000)]);
  for(const r of [a,b])assert.equal((await one('SELECT state FROM runs WHERE parent_id=$1',[r.id])).state,'completed');
 });
 await t.test('cancelamento não é revertido pela conclusão',async()=>{
  const {setState}=await import('../apps/server/src/runtime.js');
  const r=await task('SLOW_TEST cancelamento');await poll(r.id,'running');await request('POST','/runs/'+r.id+'/cancel');
  await setState(r.id,'completed');await setState(r.id,'failed','tarde demais');await sleep(3500);
  const row=await one('SELECT state,finished_at FROM runs WHERE id=$1',[r.id]);assert.equal(row.state,'cancelled');assert.ok(row.finished_at);
  assert.equal((await query('SELECT id FROM messages WHERE run_id=$1',[r.id])).length,0);
  const ev=await query("SELECT payload FROM events WHERE type='run' AND payload->>'id'=$1 ORDER BY id",[r.id]);assert.equal(ev.at(-1).payload.state,'cancelled');
 });
 await t.test('erro explícito do MCP falha a chamada sem pedir nova aprovação',async()=>{
  mcpFailName=(await request('GET','/tools')).find((x:any)=>x.label.includes('fail_external')).name;agent.tools.push(mcpFailName);await request('PUT','/agents/'+agent.id,agent);
  const r=await task('CALL_MCP_FAIL');await poll(r.id,'waiting_approval');const ap=await one('SELECT a.id FROM approvals a JOIN tool_calls t ON t.id=a.call_id WHERE t.run_id=$1',[r.id]);
  await request('POST','/approvals/'+ap.id,{decision:'approved'});await poll(r.id,'completed');
  const call=await one('SELECT t.status,t.result,a.status AS approval FROM tool_calls t JOIN approvals a ON a.call_id=t.id WHERE t.run_id=$1',[r.id]);
  assert.equal(call.status,'error');assert.match(call.result,/Serviço recusou a operação/);assert.equal(call.approval,'approved');
 });
 await t.test('/plan restringe ferramentas no backend',async()=>{
  const {toolsFor}=await import('../apps/server/src/tools.js');
  const all=['web_search','web_fetch','generate_image','list_files','read_file','write_file','list_agents','delegate','propose_routine'];
  assert.deepEqual((await toolsFor({agent_id:agent.id,mode:'plan'},{agent:{tools:all}})).map((x:any)=>x.name).sort(),['list_agents','list_files','pc_list','pc_read','read_file','web_fetch','web_search'],'só leitura (pastas do computador incluídas)');
  const cv=await request('POST',`/agents/${agent.id}/conversations`,{});
  const ok=await request('POST',`/conversations/${cv.id}/messages`,{content:'Planeje a migração',mode:'plan'});await poll(ok.id,'completed');
  const run=await one('SELECT mode,context FROM runs WHERE id=$1',[ok.id]);assert.equal(run.mode,'plan');assert.equal((run.context[0].content.match(/Modo planejamento/g)||[]).length,1);
  const blocked=await request('POST',`/conversations/${cv.id}/messages`,{content:'/plan MAKE_FILE agora',mode:'execute'});await poll(blocked.id,'failed');
  assert.equal((await one('SELECT mode FROM runs WHERE id=$1',[blocked.id])).mode,'plan','comando /plan também ativa o modo');
  assert.equal((await query("SELECT id FROM tool_calls WHERE run_id=$1",[blocked.id])).length,0,'escrita recusada pelo backend');
 });
 await t.test('anexos de mensagens anteriores continuam disponíveis',async()=>{
  const {saveFile}=await import('../apps/server/src/files.js');const f=await saveFile('nota.txt',Buffer.from('Código combinado: AZUL-42'));
  const cv=await request('POST',`/agents/${agent.id}/conversations`,{});
  await request('POST',`/conversations/${cv.id}/messages`,{content:'Guarde esta nota',files:[f.id]});const r2=await request('POST',`/conversations/${cv.id}/messages`,{content:'Qual era o código?'});
  await poll(r2.id,'completed');const run=await one('SELECT context,documents FROM runs WHERE id=$1',[r2.id]);
  assert.match(JSON.stringify(run.context),/AZUL-42/);assert.equal(run.documents.find((d:any)=>d.id===f.id)?.status,'included');
 });
 await t.test('resumo automático preserva o anterior e registra a origem',async()=>{
  const cv=await request('POST',`/agents/${agent.id}/conversations`,{});await query("UPDATE conversations SET summary='Decisão: usar PostgreSQL.' WHERE id=$1",[cv.id]);
  for(let i=0;i<28;i++)await query("INSERT INTO messages(conversation_id,role,content,created_at) VALUES($1,$2,$3,now()-make_interval(secs=>$4))",[cv.id,i%2?'assistant':'user',`Mensagem antiga ${i}`,600-i]);
  summaryRequests.length=0;const r=await request('POST',`/conversations/${cv.id}/messages`,{content:'Nova mensagem'});await poll(r.id,'completed');
  for(let i=0;i<50&&!summaryRequests.length;i++)await sleep(200);await sleep(500);
  assert.ok(summaryRequests.length>=1,'resumo foi atualizado');assert.match(JSON.stringify(summaryRequests[0].messages),/Decisão: usar PostgreSQL/);
  const rev=await one("SELECT source,source_run_id FROM memory_revisions WHERE conversation_id=$1 AND kind='summary' ORDER BY created_at DESC LIMIT 1",[cv.id]);
  assert.equal(rev.source,'Resumo automático da conversa');assert.equal(rev.source_run_id,r.id);
 });
 await t.test('central de atividade, detalhes e diagnóstico',async()=>{
  const page=await request('GET','/activity?limit=2');assert.equal(page.items.length,2);assert.ok(page.next);
  const page2=await request('GET','/activity?limit=2&before='+encodeURIComponent(page.next));assert.ok(!page2.items.some((i:any)=>page.items.some((j:any)=>j.id===i.id)),'páginas sem repetição');
  const done=await request('GET',`/activity?state=completed&agentId=${agent.id}`);assert.ok(done.items.length>0&&done.items.every((i:any)=>i.state==='completed'&&i.agent_id===agent.id));
  const parent=await one('SELECT parent_id FROM runs WHERE parent_id IS NOT NULL LIMIT 1');const d=await request('GET','/runs/'+parent.parent_id);
  assert.ok(d.tree.length>=2,'árvore de delegações');assert.ok(d.calls.some((c:any)=>c.tool==='delegate'));assert.equal(d.run.config,undefined);
  const s=await request('GET','/activity/summary');assert.equal(typeof s.failed24h,'number');
  const diag=await request('GET','/diagnostics');assert.equal(diag.database.ok,true);assert.equal(diag.worker.ok,true,JSON.stringify(diag.worker));assert.equal(diag.router.ok,true);assert.equal(diag.router.hasToken,true);
  assert.ok(!/test-secret|mcp-secret/.test(JSON.stringify(diag)),'diagnóstico sem segredos');
 });
 await t.test('memória e resumo editáveis com histórico de origem',async()=>{
  await request('PUT',`/agents/${agent.id}/memory`,{memory:'Prefere tabelas.'});const m=await request('GET',`/agents/${agent.id}/memory`);
  assert.equal(m.memory,'Prefere tabelas.');assert.equal(m.revisions[0].source,'Editada pelo usuário');agent.memory='Prefere tabelas.';
  const cv=await request('POST',`/agents/${agent.id}/conversations`,{});await request('PUT',`/conversations/${cv.id}/summary`,{summary:'Resumo manual'});
  const s=await request('GET',`/conversations/${cv.id}/summary`);assert.equal(s.summary,'Resumo manual');assert.equal(s.revisions[0].source,'Editado pelo usuário');
 });
 const routineRun=async(routineId:string)=>{for(let i=0;i<60;i++){const h=await one('SELECT run_id FROM routine_history WHERE routine_id=$1 AND run_id IS NOT NULL ORDER BY created_at DESC LIMIT 1',[routineId]);if(h)return h.run_id as string;await sleep(500);}throw new Error('O worker não disparou a rotina.');};
 await t.test('rotina atrasada dentro da tolerância ainda roda uma vez',async()=>{
  const r=await request('POST','/routines',{agentId:agent.id,name:'Atrasada',prompt:'Olá atrasado',kind:'daily',schedule:'08:00',timezone:'America/Sao_Paulo',enabled:true});
  await query("UPDATE routines SET next_at=now()-interval '10 minutes' WHERE id=$1",[r.id]);
  await poll(await routineRun(r.id),'completed');const h=await request('GET',`/routines/${r.id}/history`);assert.equal(h.length,1);assert.equal(h[0].status,'started');
 });
 await t.test('rotina proposta pelo agente é ativada na conversa e responde nela',async()=>{
  const {toolsFor}=await import('../apps/server/src/tools.js');const {config}=await import('../apps/server/src/router.js');
  const cv=await request('POST',`/agents/${agent.id}/conversations`,{});
  const propose=(await toolsFor({agent_id:agent.id},{agent:{tools:['propose_routine']}})).find((x:any)=>x.name==='propose_routine')!;
  const out=JSON.parse(await propose.execute({name:'Bom dia',prompt:'Pergunte se preciso de algo',kind:'once',schedule:new Date(Date.now()+3600e3).toISOString()},{agent_id:agent.id,conversation_id:cv.id},await config()));
  const proposed=await one('SELECT enabled,conversation_id FROM routines WHERE id=$1',[out.id]);assert.equal(proposed.enabled,false,'proposta nasce desativada');assert.equal(proposed.conversation_id,cv.id);
  assert.equal((await request('GET','/conversations/'+cv.id)).routines[0].id,out.id,'cartão aparece na conversa');
  await request('POST',`/routines/${out.id}/enabled`,{enabled:true});
  await query("UPDATE routines SET next_at=now()-interval '1 second' WHERE id=$1",[out.id]);
  await poll(await routineRun(out.id),'completed');
  const msgs=(await request('GET','/conversations/'+cv.id)).messages;
  assert.match(msgs.find((m:any)=>m.role==='user').content,/^\[Rotina agendada: Bom dia\] Pergunte/);assert.ok(msgs.some((m:any)=>m.role==='assistant'),'resposta na mesma conversa');
  assert.equal((await one('SELECT enabled FROM routines WHERE id=$1',[out.id])).enabled,false,'rotina única se desativa depois de rodar');
  const past=JSON.parse(await propose.execute({name:'Vencida',prompt:'x',kind:'once',schedule:new Date(Date.now()-3600e3).toISOString()},{agent_id:agent.id,conversation_id:cv.id},await config()));
  await assert.rejects(request('POST',`/routines/${past.id}/enabled`,{enabled:true}),/já passou/);
 });
 await t.test('notificação push quando o agente responde fora da conversa',async()=>{
  const {createECDH,randomBytes}=await import('node:crypto');const keys=()=>{const e=createECDH('prime256v1');e.generateKeys();return {p256dh:e.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url'),ecdh:e};};
  delete process.env.ALLOW_HTTP_PUSH;await assert.rejects(request('POST','/push/subscribe',{endpoint:base+'/push/phone',keys:keys()}),/inválido/);process.env.ALLOW_HTTP_PUSH='1';
  assert.ok((await request('GET','/push')).publicKey.length>80,'chave VAPID pública');
  const phone=keys();await request('POST','/push/subscribe',{endpoint:base+'/push/phone',keys:{p256dh:phone.p256dh,auth:phone.auth},label:'Android · Chrome'});await request('POST','/push/subscribe',{endpoint:base+'/push/gone',keys:keys()});
  pushes.length=0;const cv=await request('POST',`/agents/${agent.id}/conversations`,{});
  const r=await request('POST',`/conversations/${cv.id}/messages`,{content:'Mensagem para notificar'});await poll(r.id,'completed');
  for(let i=0;i<50&&!pushes.some(x=>x.id==='phone');i++)await sleep(200);
  const p=pushes.find(x=>x.id==='phone');assert.ok(p,'notificação enviada');assert.equal(p.headers['content-encoding'],'aes128gcm');assert.match(String(p.headers.authorization),/^vapid t=.+, k=/);
  assert.ok(p.body.length>0&&!p.body.toString('latin1').includes('Resultado'),'conteúdo cifrado');
  // Decrypt as the device would (same ECE library web-push uses) and check what the notification shows.
  const ece=(await import('http_ece' as any)).default;const shown=JSON.parse(ece.decrypt(p.body,{version:'aes128gcm',privateKey:phone.ecdh,authSecret:Buffer.from(phone.auth,'base64url')}).toString());
  assert.equal(shown.title,agent.name);assert.match(shown.body,/Resultado concluído/);assert.equal(shown.url,`/?agent=${agent.id}&conversation=${cv.id}`);assert.equal(shown.tag,`conv-${cv.id}`);
  for(let i=0;i<20&&(await query("SELECT id FROM push_subscriptions WHERE endpoint LIKE '%/push/gone'")).length;i++)await sleep(200);
  assert.equal((await query("SELECT id FROM push_subscriptions WHERE endpoint LIKE '%/push/gone'")).length,0,'assinatura expirada removida');
  pushes.length=0;const r2=await request('POST',`/conversations/${cv.id}/messages`,{content:'Segunda mensagem'});await poll(r2.id,'completed');await request('GET','/conversations/'+cv.id);
  await sleep(2000);assert.equal(pushes.length,0,'conversa aberta não notifica');
  assert.equal((await request('POST','/push/test')).sent,1);
  await request('POST','/push/unsubscribe',{endpoint:base+'/push/phone'});assert.equal((await request('GET','/push')).devices.length,0);
  await assert.rejects(request('POST','/push/test'),/Nenhum aparelho/);
 });
 await t.test('central de notificações, aba em segundo plano e escolha por agente',async()=>{
  const {createECDH,randomBytes}=await import('node:crypto');const e=createECDH('prime256v1');e.generateKeys();
  await request('POST','/push/subscribe',{endpoint:base+'/push/laptop',keys:{p256dh:e.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}});
  const cv=await request('POST',`/agents/${agent.id}/conversations`,{});pushes.length=0;
  const r=await request('POST',`/conversations/${cv.id}/messages`,{content:'Para a central'});await poll(r.id,'completed');
  await request('GET',`/conversations/${cv.id}?seen=0`);
  for(let i=0;i<25&&!pushes.some(x=>x.id==='laptop');i++)await sleep(200);
  assert.ok(pushes.some(x=>x.id==='laptop'),'aba em segundo plano não marca como lida: push enviado');
  const listed=(await request('GET','/notifications')).items.find((n:any)=>n.kind==='message'&&n.conversation_id===cv.id);
  assert.ok(listed,'mensagem na central');assert.equal(listed.agent_name,agent.name);assert.match(listed.text,/Resultado concluído/);
  await request('POST','/notifications/read-all');assert.ok(!(await request('GET','/notifications')).items.some((n:any)=>n.conversation_id===cv.id),'marcar como lidas');
  await request('POST',`/agents/${agent.id}/notify`,{notify:false});pushes.length=0;
  const r2=await request('POST',`/conversations/${cv.id}/messages`,{content:'Agente silenciado'});await poll(r2.id,'completed');await sleep(2000);
  assert.equal(pushes.length,0,'agente silenciado não envia push');assert.ok(!(await request('GET','/notifications')).items.some((n:any)=>n.conversation_id===cv.id),'nem aparece na central');
  await request('POST',`/agents/${agent.id}/notify`,{notify:true});assert.equal((await request('GET','/agents')).find((x:any)=>x.id===agent.id).notify,true);agent.notify=true;
  await request('POST','/push/unsubscribe',{endpoint:base+'/push/laptop'});
 });
 await t.test('conectores com um clique: OAuth automático, Google e Google Tarefas',async()=>{
  const {toolsFor}=await import('../apps/server/src/tools.js');
  const follow=async(url:string)=>{const r=await fetch(url,{redirect:'manual'});const back=new URL(r.headers.get('location')!);return app.inject({method:'GET',url:back.pathname+back.search});};
  const cat=await request('GET','/connectors');assert.ok(cat.connectors.some((c:any)=>c.key==='notion'));assert.equal(cat.googleConfigured,false);assert.equal(cat.redirectUri,'http://localhost:5173/api/connections/oauth/callback');
  // Notion-like: dynamic registration, PKCE and the fixed callback; the callback works without a session cookie.
  const start=await request('POST','/connectors/notion/connect');const u=new URL(start.authorizationUrl);
  assert.equal(u.searchParams.get('redirect_uri'),'http://localhost:5173/api/connections/oauth/callback');assert.equal(u.searchParams.get('code_challenge_method'),'S256');assert.ok(registered.at(-1).redirect_uris.includes('http://localhost:5173/api/connections/oauth/callback'));
  // Android delivers the return twice (browser, then the installed app): the single-use code is exchanged once and both succeed.
  const ret=new URL((await fetch(start.authorizationUrl,{redirect:'manual'})).headers.get('location')!),back={method:'GET' as const,url:ret.pathname+ret.search};
  const [cb,dup]=await Promise.all([app.inject(back),app.inject(back)]);assert.equal(cb.statusCode,302);assert.equal(cb.headers.location,'/?connected=notion');assert.equal(dup.headers.location,'/?connected=notion');
  assert.equal((await app.inject(back)).headers.location,'/?connected=notion','repetição tardia também não quebra');
  const notion=(await request('GET','/connectors')).connectors.find((c:any)=>c.key==='notion');assert.equal(notion.status,'connected');assert.equal(notion.tools,3);
  const row=await one("SELECT id,read_tools,all_agents FROM connections WHERE catalog_key='notion'");assert.deepEqual([...row.read_tools].sort(),['list_items','search_pages']);assert.equal(row.all_agents,true);
  const forAgent:any[]=(await toolsFor({agent_id:targetAgent},{agent:{tools:[]}})).filter((x:any)=>x.target?.startsWith('Notion'));assert.equal(forAgent.length,3,'liberado para todos os agentes');
  assert.equal(forAgent.find((x:any)=>x.name.endsWith('create_page')).write,true,'escrita pede aprovação');
  assert.match(await forAgent.find((x:any)=>x.name.endsWith('search_pages')).execute({query:'atas'},{},{}),/1 página encontrada para atas/);
  const forged=await app.inject({method:'GET',url:`/api/connections/oauth/callback?code=x&state=${row.id}.${'0'.repeat(48)}`});assert.match(String(forged.headers.location),/connector_error/);
  // Canva-like: only loopback returns are accepted, so the owner pastes the address of the page the provider opened.
  const cv=await request('POST','/connectors/canva/connect');assert.equal(cv.manualReturn,true);assert.equal(new URL(cv.authorizationUrl).searchParams.get('redirect_uri'),'http://127.0.0.1:53682/cell/oauth/callback');
  const landed=(await fetch(cv.authorizationUrl,{redirect:'manual'})).headers.get('location')!;assert.ok(landed.startsWith('http://127.0.0.1:53682/cell/oauth/callback?code='),landed);
  await assert.rejects(request('POST','/connectors/canva/complete',{url:landed.replace(/state=[^&]+/,'state='+row.id+'.abc')}),/400/,'endereço de outro aplicativo é recusado');
  assert.deepEqual(await request('POST','/connectors/canva/complete',{url:'  '+landed+' '}),{connected:true,tools:3});
  assert.equal((await request('POST','/connectors/canva/complete',{url:landed})).connected,true,'colar de novo não gasta o código outra vez');
  assert.equal((await request('GET','/connectors')).connectors.find((c:any)=>c.key==='canva').status,'connected');
  // Google services need the owner's OAuth client once; the secret is stored encrypted.
  await assert.rejects(request('POST','/connectors/gmail/connect'),/Configure o Google/);await assert.rejects(request('PUT','/connectors/google',{clientId:'abc',clientSecret:'x'.repeat(12)}),/400/);
  await request('PUT','/connectors/google',{clientId:'123-abc.apps.googleusercontent.com',clientSecret:'gsecret-1234567'});assert.ok(!(await one("SELECT client_secret FROM oauth_clients WHERE provider='google'")).client_secret.includes('gsecret'));
  const g=await request('POST','/connectors/gmail/connect');const gu=new URL(g.authorizationUrl);assert.equal(gu.searchParams.get('client_id'),'123-abc.apps.googleusercontent.com');assert.match(String(gu.searchParams.get('scope')),/gmail\.readonly/);
  assert.equal((await follow(g.authorizationUrl)).headers.location,'/?connected=gmail');assert.equal((await request('GET','/connectors')).connectors.find((c:any)=>c.key==='gmail').status,'connected');
  // Google Tasks: native OAuth (offline access) and API calls with automatic token refresh.
  const tk=await request('POST','/connectors/google-tasks/connect');const tu=new URL(tk.authorizationUrl);assert.equal(tu.searchParams.get('access_type'),'offline');assert.match(String(tu.searchParams.get('scope')),/auth\/tasks/);
  assert.equal((await follow(tk.authorizationUrl)).headers.location,'/?connected=google-tasks');
  const gt:any[]=(await toolsFor({agent_id:targetAgent},{agent:{tools:[]}})).filter((x:any)=>x.name.startsWith('gtasks_'));assert.equal(gt.length,5);assert.equal(gt.find((x:any)=>x.name==='gtasks_create_task').write,true);
  assert.equal(JSON.parse(await gt.find((x:any)=>x.name==='gtasks_create_task').execute({title:'Comprar pão',due:'2026-10-30'},{},{})).title,'Comprar pão');
  await sleep(1200);const listed=JSON.parse(await gt.find((x:any)=>x.name==='gtasks_list_tasks').execute({},{},{}));assert.equal(listed[0].title,'Comprar pão');assert.ok(googleRefreshes>=1,'token renovado');
  await gt.find((x:any)=>x.name==='gtasks_complete_task').execute({taskId:listed[0].id},{},{});assert.equal(JSON.parse(await gt.find((x:any)=>x.name==='gtasks_list_tasks').execute({},{},{})).length,0);
  assert.deepEqual((await toolsFor({agent_id:targetAgent,mode:'plan'},{agent:{tools:[]}})).map((x:any)=>x.name).filter((n:string)=>n.startsWith('gtasks_')).sort(),['gtasks_list_tasklists','gtasks_list_tasks']);
  for(const key of ['notion','canva','gmail','google-tasks'])await request('DELETE','/connectors/'+key);
  assert.ok((await request('GET','/connectors')).connectors.every((c:any)=>c.status==='disconnected'));await request('DELETE','/connectors/google');
 });
 await t.test('mensagem de voz: transcrição e resposta em áudio conforme o agente',async()=>{
  const sendAudio=async(cvId:string,type='audio/webm',name='audio.webm',call=false)=>{const form=new FormData();form.append('mode','execute');if(call)form.append('call','1');form.append('audio',new Blob([Buffer.alloc(4000,1)],{type}),name);const r=new Request('http://cell/upload',{method:'POST',body:form});
   return app.inject({method:'POST',url:`/api/conversations/${cvId}/audio`,headers:{cookie,'x-csrf-token':csrf,origin:'http://localhost:5173','content-type':r.headers.get('content-type')!},payload:Buffer.from(await r.arrayBuffer())});};
  const lastReply=async(cvId:string)=>(await request('GET','/conversations/'+cvId)).messages.filter((m:any)=>m.role==='assistant').at(-1);
  const cv=await request('POST',`/agents/${agent.id}/conversations`,{});transcriptionRequests.length=0;speechRequests.length=0;
  // Agent without voice replies: transcript becomes the message, audio stays attached, reply is text.
  const r1=await sendAudio(cv.id);assert.equal(r1.statusCode,200,r1.body);const out=r1.json();assert.equal(out.transcript,'Quais são as tarefas de amanhã?');
  assert.ok(!transcriptionRequests[0].includes('name="language"'),'sem campo de idioma');
  await poll(out.id,'completed');const user=(await request('GET','/conversations/'+cv.id)).messages.find((m:any)=>m.role==='user');
  assert.equal(user.voice,true);assert.equal(user.content,'Quais são as tarefas de amanhã?');assert.equal(user.attachments[0].mime,'audio/webm');
  assert.equal((await one('SELECT documents FROM runs WHERE id=$1',[out.id])).documents.length,0,'áudio não vira documento');
  assert.equal((await lastReply(cv.id)).voice,false);assert.equal(speechRequests.length,0);
  // Voice replies on, no voice model: the reply is flagged so the device reads it aloud.
  agent.voice_reply=true;await request('PUT','/agents/'+agent.id,agent);
  const r2=(await sendAudio(cv.id)).json();await poll(r2.id,'completed');let reply=await lastReply(cv.id);assert.equal(reply.voice,true);assert.equal(reply.attachments.length,0);
  // With a voice model: an MP3 of the answer is attached and served inline for the player.
  const {hasToken,...base}=await request('GET','/settings');await request('PUT','/settings',{...base,ttsModel:'test/tts',ttsVoice:'alloy'});
  try{
   const r3=(await sendAudio(cv.id,'audio/mp4','audio.m4a')).json();await poll(r3.id,'completed');reply=await lastReply(cv.id);
   assert.equal(reply.voice,true);assert.equal(reply.attachments[0].mime,'audio/mpeg');assert.equal(speechRequests.at(-1).model,'test/tts/alloy');assert.match(speechRequests.at(-1).input,/Resultado concluído/);
   assert.match(String((await app.inject({method:'GET',url:`/api/files/${reply.attachments[0].id}?inline=1`,headers:{cookie}})).headers['content-disposition']),/^inline/);
   const r4=await request('POST',`/conversations/${cv.id}/messages`,{content:'Mensagem escrita'});await poll(r4.id,'completed');assert.equal((await lastReply(cv.id)).voice,false,'texto continua texto');
   const vt=await app.inject({method:'POST',url:'/api/models/voice-test',headers:{cookie,'x-csrf-token':csrf,origin:'http://localhost:5173'},payload:{ttsModel:'test/tts'}});assert.equal(vt.statusCode,200);assert.match(String(vt.headers['content-type']),/audio\/mpeg/);
   assert.equal((await sendAudio(cv.id,'text/plain','nota.txt')).statusCode,400,'formato recusado');
   // Voice per agent: a voice for the workspace model, or the agent's own model (without the workspace voice).
   agent.tts_voice='nova';await request('PUT','/agents/'+agent.id,agent);
   const r5=(await sendAudio(cv.id)).json();await poll(r5.id,'completed');assert.equal(speechRequests.at(-1).model,'test/tts/nova');
   agent.tts_model='other/tts';agent.tts_voice='';await request('PUT','/agents/'+agent.id,agent);
   const r6=(await sendAudio(cv.id)).json();await poll(r6.id,'completed');assert.equal(speechRequests.at(-1).model,'other/tts');
   // A call turn is answered with speech even when the agent replies to voice messages in text.
   agent.voice_reply=false;await request('PUT','/agents/'+agent.id,agent);
   const r7=await sendAudio(cv.id,'audio/webm','audio.webm',true);assert.equal(r7.statusCode,200,r7.body);await poll(r7.json().id,'completed');
   reply=await lastReply(cv.id);assert.equal(reply.voice,true,'chamada sempre responde em voz');assert.equal(reply.attachments[0].mime,'audio/mpeg');
   assert.equal((await one('SELECT call FROM messages WHERE id=(SELECT input_message_id FROM runs WHERE id=$1)',[r7.json().id])).call,true);
   const r8=(await sendAudio(cv.id)).json();await poll(r8.id,'completed');assert.equal((await lastReply(cv.id)).voice,false,'fora da chamada vale a opção do agente');
  }finally{await request('PUT','/settings',{...base,ttsModel:'',ttsVoice:''});agent.voice_reply=false;agent.tts_model='';agent.tts_voice='';await request('PUT','/agents/'+agent.id,agent);}
 });
 await t.test('pastas do computador: pedido de acesso aprovado, leitura livre, mudanças aprovadas, revogação',async()=>{
  const {toolsFor}=await import('../apps/server/src/tools.js');
  const tools=async(agentId:string,mode='execute')=>(await toolsFor({agent_id:agentId,mode},{agent:{tools:[]}})).filter((x:any)=>x.name.startsWith('pc_'));
  const pc=async(agentId:string,name:string,args:any)=>(await tools(agentId)).find((x:any)=>x.name===name)!.execute(args,{agent_id:agentId},{});
  const mine=await tools(agent.id);assert.deepEqual(mine.map((x:any)=>x.name).sort(),['pc_list','pc_mkdir','pc_move','pc_read','pc_rename','pc_request_access']);
  assert.deepEqual(mine.filter((x:any)=>x.write).map((x:any)=>x.name).sort(),['pc_mkdir','pc_move','pc_rename','pc_request_access'],'pedido e mudanças pedem aprovação');
  assert.deepEqual((await tools(agent.id,'plan')).map((x:any)=>x.name).sort(),['pc_list','pc_read'],'modo plano só lê');
  await assert.rejects(pc(agent.id,'pc_list',{path:'K:\\Downloads'}),/Sem acesso a K:\\Downloads/);
  // The agent asks; the run waits for the owner; approving grants the folder.
  const r=await task('PC_ACCESS');await poll(r.id,'waiting_approval');
  const ap=await one("SELECT a.id FROM approvals a JOIN tool_calls t ON t.id=a.call_id WHERE t.run_id=$1 AND t.tool='pc_request_access'",[r.id]);
  await request('POST','/approvals/'+ap.id,{decision:'approved'});await poll(r.id,'completed');
  const access=await request('GET','/host-access');assert.deepEqual(access.grants.map((g:any)=>g.path),['K:\\Downloads']);
  const listed=JSON.parse(await pc(agent.id,'pc_list',{path:'K:\\Downloads'}));assert.deepEqual(listed.entries.map((e:any)=>e.path).sort(),['foto.jpg','notas.txt','sub'],'arquivos ocultos ficam de fora');
  assert.ok(JSON.parse(await pc(agent.id,'pc_list',{path:'K:/downloads',recursive:true})).entries.some((e:any)=>e.path==='sub\\x.txt'),'subpastas e maiúsculas');
  assert.match(JSON.parse(await pc(agent.id,'pc_read',{path:'K:\\Downloads\\notas.txt'})).text,/pão e café/);
  assert.match(JSON.parse(await pc(agent.id,'pc_read',{path:'K:\\Downloads\\foto.jpg'})).note,/sem texto/);
  await assert.rejects(pc(agent.id,'pc_read',{path:'K:\\Downloads\\.env'}),/ocultos/);
  await assert.rejects(pc(agent.id,'pc_list',{path:'K:\\Downloads\\..\\Outros'}),/inválido/);
  await assert.rejects(pc(agent.id,'pc_read',{path:'K:\\Outros\\privado.txt'}),/Sem acesso/);
  await assert.rejects(pc(targetAgent,'pc_list',{path:'K:\\Downloads'}),/Sem acesso/,'outro agente não herda o acesso');
  // Organizing: create a folder, move into it (no overwrite), rename.
  await pc(agent.id,'pc_mkdir',{path:'K:\\Downloads\\Documentos'});
  const moved=JSON.parse(await pc(agent.id,'pc_move',{moves:[{from:'K:\\Downloads\\notas.txt',to:'K:\\Downloads\\Documentos'},{from:'K:\\Downloads\\foto.jpg',to:'K:\\Outros\\foto.jpg'}]}));
  assert.equal(moved.moved,1);assert.equal(moved.failed,1,'destino fora da pasta liberada falha');assert.ok(existsSync(join(hostRoot,'k','Downloads','Documentos','notas.txt')));
  writeFileSync(join(hostRoot,'k','Downloads','notas.txt'),'outra');
  assert.match(JSON.parse(await pc(agent.id,'pc_move',{moves:[{from:'K:\\Downloads\\notas.txt',to:'K:\\Downloads\\Documentos'}]})).results[0].error,/já existe/);
  await pc(agent.id,'pc_rename',{path:'K:\\Downloads\\Documentos\\notas.txt',newName:'compras.txt'});assert.ok(existsSync(join(hostRoot,'k','Downloads','Documentos','compras.txt')));
  await assert.rejects(pc(agent.id,'pc_rename',{path:'K:\\Downloads\\foto.jpg',newName:'..\\fuga.jpg'}),/inválido/i);
  // Revoking is immediate.
  await request('DELETE','/host-access/'+access.grants[0].id);await assert.rejects(pc(agent.id,'pc_list',{path:'K:\\Downloads'}),/Sem acesso/);
 });
 await t.test('documentos: planilha, CSV, PDF, Word e PowerPoint vão para a biblioteca e para a resposta',async()=>{
  // The model asks for a spreadsheet: the file is saved and attached to the answer.
  const r=await task('MAKE_SHEET');await poll(r.id,'completed');
  const cvId=(await one('SELECT conversation_id FROM runs WHERE id=$1',[r.id])).conversation_id;
  const reply=(await request('GET','/conversations/'+cvId)).messages.filter((m:any)=>m.role==='assistant').at(-1);
  assert.equal(reply.attachments[0].name,'Vendas 3º trimestre.xlsx','nome sem caracteres inválidos');assert.equal(reply.attachments[0].mime,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.match((await one('SELECT extracted FROM files WHERE id=$1',[reply.attachments[0].id])).extracted,/## Resumo\nMês;Vendas;Meta;Atingido\nJulho;120;100;=B2\/C2/);
  const {toolsFor}=await import('../apps/server/src/tools.js');
  const tools=await toolsFor({agent_id:agent.id,mode:'execute'},{agent:{tools:[]}});
  const make=async(name:string,args:any)=>JSON.parse(await tools.find((x:any)=>x.name===name)!.execute(args,{agent_id:agent.id},{}));
  assert.ok(!tools.find((x:any)=>x.name==='create_pdf')!.write,'criar arquivo na biblioteca não pede aprovação');
  assert.equal((await toolsFor({agent_id:agent.id,mode:'plan'},{agent:{tools:[]}})).some((x:any)=>x.name.startsWith('create_')),false,'modo plano não gera arquivos');
  const csv=await make('create_spreadsheet',{name:'contatos',format:'csv',sheets:[{name:'A',columns:['Nome','Cidade'],rows:[['Ana','São Paulo'],['Bruno; Jr','Rio "RJ"']]}]});
  assert.equal(csv.name,'contatos.csv');const csvText=(await fileData(csv.id)).data.toString('utf8');
  assert.ok(csvText.startsWith('\ufeffNome;Cidade\r\n'),'BOM e ponto e vírgula');assert.match(csvText,/"Bruno; Jr";"Rio ""RJ"""/);
  const md='# Relatório\n\nTexto com **negrito** e acentuação: ação, café.\n\n| Mês | Vendas |\n|---|---|\n| Julho | 120 |\n\n- item um\n- item dois\n\n---\n\n## Página 2\n\nFim.';
  const pdf=await make('create_pdf',{name:'relatorio',title:'Relatório Q3',markdown:md});assert.equal(pdf.mime,'application/pdf');
  const pdfRow=await one('SELECT extracted,warning FROM files WHERE id=$1',[pdf.id]);assert.equal(pdfRow.warning,null,'texto do PDF lido (sem o problema do tsx)');assert.match(pdfRow.extracted,/acentuação: ação, café/);assert.match(pdfRow.extracted,/Página 2/);
  const docx=await make('create_docx',{name:'relatorio.docx',title:'Relatório Q3',markdown:md});assert.equal(docx.name,'relatorio.docx');
  assert.match((await one('SELECT extracted FROM files WHERE id=$1',[docx.id])).extracted,/Texto com negrito e acentuação[\s\S]*Julho[\s\S]*item dois/);
  const img=await saveFile('capa.png',png,agent.id);
  const deck=await make('create_presentation',{name:'Plano',title:'Plano 2027',subtitle:'Equipe',color:'#18b99c',slides:[{title:'Objetivos',bullets:['Crescer','  - no Brasil'],notes:'Falar devagar',imageId:img.id},{title:'Números',table:{columns:['Mês','Vendas'],rows:[['Jul','120']]}}]});
  assert.equal(deck.name,'Plano.pptx');assert.equal(deck.slides,3);const zip=(await fileData(deck.id)).data;assert.equal(zip.subarray(0,2).toString(),'PK','arquivo Office (zip)');
  assert.ok(zip.includes(Buffer.from('ppt/slides/slide3.xml'))&&zip.includes(Buffer.from('ppt/notesSlides/')),'3 slides com anotações');
  await assert.rejects(make('create_presentation',{name:'x',title:'x',slides:[]}),/./,'precisa de pelo menos um slide');
 });
 await t.test('fixar até 3 agentes, renomear e mover de seção pelo menu',async()=>{
  const all=await request('GET','/agents');const others=all.filter((a:any)=>!a.archived&&!a.pinned);
  const room=3-all.filter((a:any)=>a.pinned&&!a.archived).length;for(const a of others.slice(0,room))await request('POST',`/agents/${a.id}/pin`,{pinned:true});
  const extra=others[room];await assert.rejects(request('POST',`/agents/${extra.id}/pin`,{pinned:true}),/até 3 agentes/);
  await assert.rejects(request('PUT','/agents/'+extra.id,{...extra,pinned:true}),/até 3 agentes/);
  for(const a of others.slice(0,room))await request('POST',`/agents/${a.id}/pin`,{pinned:false});
  const renamed=await request('PATCH','/agents/'+extra.id,{name:'  Novo Nome  '});assert.equal(renamed.name,'Novo Nome');
  const moved=await request('PATCH','/agents/'+extra.id,{section:'Criativos'});assert.equal(moved.section,'Criativos');assert.ok((await request('GET','/sections')).some((s:any)=>s.name==='Criativos'));
  await assert.rejects(request('PATCH','/agents/'+extra.id,{}),/400/);
  await request('PATCH','/agents/'+extra.id,{name:extra.name,section:extra.section});
 });
 await t.test('memória, habilidades e conversa persistem',async()=>{const skill=await request('POST','/skills',{name:'Checklist',body:'# Revisar\nConferir as fontes.'});agent.skills=[skill.id];agent.memory='Prefere respostas objetivas.';await request('PUT','/agents/'+agent.id,agent);const r=await task('Persistência');await poll(r.id,'completed');const stored=await one('SELECT context FROM runs WHERE id=$1',[r.id]);assert.ok(stored.context[0].content.includes('Prefere respostas objetivas.'));assert.ok(stored.context[0].content.includes('Conferir as fontes.'));const year=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',year:'numeric'}).format(new Date());assert.match(stored.context[0].content,new RegExp(`Data e hora atuais: .*${year}`),'contexto traz a data atual');});
});

test('vozes conhecidas por modelo de síntese',async()=>{
 const {ttsVoices}=await import('../packages/shared/src/index.js');
 const mini=ttsVoices('openrouter/openai/gpt-4o-mini-tts').map(v=>v.id);assert.equal(mini.length,11);assert.ok(mini.includes('nova')&&mini.includes('ballad'));
 const tts1=ttsVoices('openrouter/openai/tts-1-hd').map(v=>v.id);assert.equal(tts1.length,9);assert.ok(!tts1.includes('ballad'),'tts-1 não tem ballad');
 assert.deepEqual(ttsVoices('nvidia/fastpitch'),[]);assert.ok(ttsVoices('edge/tts').some(v=>v.id==='pt-BR-FranciscaNeural'));
});

test('nomes de ferramentas MCP longos não colidem (Grok recusa duplicados)',async()=>{
 const {mcpToolName}=await import('../apps/server/src/tools.js');
 const id='8f39d201-c135-4291-b0f4-b50da4c10fcb';
 const a=mcpToolName(id,'notion-calendar-list-calendars'),b=mcpToolName(id,'notion-calendar-list-calendar-events');
 assert.notEqual(a,b);assert.ok(a.length<=64&&b.length<=64);assert.match(a,/^[a-zA-Z0-9_-]+$/);
 assert.equal(mcpToolName(id,'notion-fetch'),'mcp_8f39d201c1354291b0f4b50da4c10fcb_notion-fetch','nomes curtos não mudam');
 assert.equal(mcpToolName(id,'notion-calendar-list-calendars'),a,'estável');
});
