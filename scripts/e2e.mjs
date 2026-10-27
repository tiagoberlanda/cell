// Browser tests on an isolated stack: throwaway PostgreSQL, API and the built web app, seeded with agents in every state.
// Usage: npm run test:e2e   (uses the installed Google Chrome; screenshots go to test-results/)
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
const root = new URL('../', import.meta.url), cwd = root.pathname.replace(/^\/([A-Za-z]:)/, '$1');
const id = process.pid, dbPort = 55500 + (id % 90), apiPort = 3600 + (id % 90), webPort = 4600 + (id % 90), db = `cell-e2e-${id}`;
const password = 'e2e-' + randomBytes(8).toString('hex');
const databaseUrl = `postgres://cell:cell-e2e@127.0.0.1:${dbPort}/cell_e2e`;
const env = { ...process.env, DATABASE_URL: databaseUrl, SECRET_KEY: randomBytes(32).toString('hex'), COOKIE_SECURE: 'false', APP_ORIGIN: `http://127.0.0.1:${webPort}`, PORT: String(apiPort), WORKSPACE_PATH: './.cache/e2e-data', NINEROUTER_BASE_URL: 'http://127.0.0.1:9/v1', NINEROUTER_DEFAULT_MODEL: 'e2e-model', CELL_ADMIN_PASSWORD: password, CELL_API_URL: `http://127.0.0.1:${apiPort}` };
const children = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const docker = (...a) => spawnSync('docker', a, { encoding: 'utf8' });
async function waitFor(url, label) { for (let i = 0; i < 120; i++) { try { if ((await fetch(url)).status < 500) return; } catch {} await sleep(500); } throw new Error(`${label} não respondeu em ${url}`); }
let status = 1;
try {
  if (docker('run', '-d', '--rm', '--name', db, '-e', 'POSTGRES_USER=cell', '-e', 'POSTGRES_PASSWORD=cell-e2e', '-e', 'POSTGRES_DB=cell_e2e', '-p', `127.0.0.1:${dbPort}:5432`, 'postgres:17-alpine').status !== 0) throw new Error('Não foi possível iniciar o PostgreSQL temporário.');
  for (let i = 0; i < 60 && docker('exec', db, 'pg_isready', '-U', 'cell', '-d', 'cell_e2e', '-q').status !== 0; i++) await sleep(1000);
  await sleep(1500);
  const admin = spawnSync(process.execPath, ['--import', 'tsx', 'apps/server/src/admin.ts'], { cwd, env, input: 'e2e\n', encoding: 'utf8' });
  if (admin.status !== 0) throw new Error('Falha ao criar o usuário de teste: ' + admin.stderr);
  if (spawnSync('npm', ['run', 'build'], { cwd, env, stdio: 'inherit', shell: true }).status !== 0) throw new Error('Build da interface falhou.');
  children.push(spawn(process.execPath, ['--import', 'tsx', 'apps/server/src/api.ts'], { cwd, env, stdio: 'ignore' }));
  await waitFor(`http://127.0.0.1:${apiPort}/api/health`, 'API');
  await seed();
  children.push(spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], { cwd: cwd + 'apps/web', env, stdio: 'ignore', shell: true }));
  await waitFor(`http://127.0.0.1:${webPort}/`, 'Interface');
  status = spawnSync('npx', ['playwright', 'test', '-c', 'tests/e2e/playwright.config.ts', ...process.argv.slice(2)], { cwd, stdio: 'inherit', shell: true, env: { ...env, E2E_BASE_URL: `http://127.0.0.1:${webPort}`, E2E_USER: 'e2e', E2E_PASSWORD: password } }).status ?? 1;
} catch (e) { console.error(e.message); }
finally {
  for (const c of children) { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(c.pid), '/T', '/F']); else c.kill(); }
  docker('stop', db);
}
process.exit(status);

// One agent per visible state, plus a delegation, an approval, a failure, documents and a summary.
async function seed() {
  const c = new pg.Client({ connectionString: databaseUrl }); await c.connect();
  const q = async (sql, p = []) => (await c.query(sql, p)).rows;
  const agents = Object.fromEntries((await q('SELECT id,name FROM agents')).map(a => [a.name, a.id]));
  const conv = async (agent, title) => (await q('INSERT INTO conversations(agent_id,title) VALUES($1,$2) RETURNING id', [agents[agent], title]))[0].id;
  const run = async (agent, cv, state, extra = {}) => (await q(`INSERT INTO runs(agent_id,conversation_id,state,model,config,mode,parent_id,error,output,usage,documents,started_at,finished_at,heartbeat_at,created_at)
    VALUES($1,$2,$3,'e2e-model','e2e',$4,$5,$6,$7,$8,$9,now()-interval '3 minutes',$10,now(),now()-interval '3 minutes') RETURNING id`,
    [agents[agent], cv, state, extra.mode || 'execute', extra.parent || null, extra.error || null, extra.output || null, JSON.stringify(extra.usage || {}), JSON.stringify(extra.documents || []), ['completed', 'failed', 'cancelled'].includes(state) ? new Date() : null]))[0].id;
  const coord = await conv('Coordenador', 'Planejar lançamento');
  const done = await run('Coordenador', coord, 'completed', { output: 'Plano pronto com três etapas.', usage: { prompt_tokens: 1200, completion_tokens: 340 }, documents: [{ id: '00000000-0000-0000-0000-000000000001', name: 'briefing.pdf', status: 'included' }, { id: '00000000-0000-0000-0000-000000000002', name: 'foto.png', status: 'omitted', reason: 'Imagem omitida: capacidade ou limite de contexto' }] });
  await q("INSERT INTO messages(conversation_id,role,content,created_at) VALUES($1,'user','Monte o plano de lançamento',now()-interval '4 minutes')", [coord]);
  await q("INSERT INTO messages(conversation_id,role,content,run_id) VALUES($1,'assistant','Plano pronto com três etapas.',$2)", [coord, done]);
  const parent = await run('Coordenador', coord, 'waiting_agent');
  const research = await conv('Pesquisador', 'Delegação');
  await run('Pesquisador', research, 'running', { parent });
  const writer = await conv('Redator', 'Publicar post');
  const pending = await run('Redator', writer, 'waiting_approval');
  const call = (await q("INSERT INTO tool_calls(run_id,call_id,tool,args,fingerprint,external_write,target,binding,status) VALUES($1,'c1','mcp_post','{\"texto\":\"Olá\"}','fp',true,'Blog — https://example.com — post','','pending') RETURNING id", [pending]))[0].id;
  await q("INSERT INTO approvals(call_id,fingerprint,status) VALUES($1,'fp','pending')", [call]);
  const review = await conv('Revisor', 'Revisão');
  await run('Revisor', review, 'failed', { error: 'O modelo não retornou resposta.' });
  await q("UPDATE conversations SET summary='Decisão: lançar em março.' WHERE id=$1", [coord]);
  await q("INSERT INTO routines(agent_id,name,prompt,kind,schedule,timezone,enabled,next_at,conversation_id) VALUES($1,'Bom dia','Pergunte se preciso de algo','daily','08:00','America/Sao_Paulo',false,now()+interval '1 day',$2)", [agents['Coordenador'], coord]);
  // One routine per viewport: the routines test toggles and deletes its own.
  for (const w of [360, 390, 768, 1024, 1440]) await q("INSERT INTO routines(agent_id,name,prompt,kind,schedule,timezone,enabled,next_at) VALUES($1,$2,'Resuma as novidades','daily','09:00','America/Sao_Paulo',true,now()+interval '1 day')", [agents['Pesquisador'], 'Relatório ' + w]);
  await q("INSERT INTO messages(conversation_id,role,content,created_at) VALUES($1,'user','[Rotina agendada: Bom dia] Pergunte se preciso de algo',now()-interval '1 minute')", [coord]);
  // An abandoned connection attempt: diagnostics must not count it as active.
  await q("INSERT INTO connections(name,url,catalog_key,all_agents,status) VALUES('Miro','https://mcp.miro.com/','miro',true,'connecting')");
  await q("INSERT INTO connections(name,url,catalog_key,all_agents,status,tools,read_tools) VALUES('Todoist','https://ai.todoist.net/mcp','todoist',true,'connected','[{\"name\":\"find_tasks\"},{\"name\":\"add_task\"}]','[\"find_tasks\"]')");
  const voiceCv = await conv('Revisor', 'Conversa por voz');
  const audioFile = (await q("INSERT INTO files(name,mime,size,storage_name) VALUES('audio-teste.webm','audio/webm',4000,'audio-teste.webm') RETURNING id"))[0].id;
  await q("INSERT INTO messages(conversation_id,role,content,files,voice,created_at) VALUES($1,'user','Quais são minhas tarefas?',$2,true,now()-interval '30 seconds')", [voiceCv, JSON.stringify([audioFile])]);
  await q("INSERT INTO messages(conversation_id,role,content,voice) VALUES($1,'assistant','Você tem duas tarefas para amanhã.',true)", [voiceCv]);
  await q("INSERT INTO worker_health(id,heartbeat_at) VALUES('primary',now()) ON CONFLICT(id) DO UPDATE SET heartbeat_at=now()");
  await c.end();
}
