// Restores a backup into an isolated, throwaway PostgreSQL and checks that it is complete. Production is never touched.
// Usage: npm run backup:verify -- <backup folder>   (folder made by scripts/backup.ps1: database.dump, files/, manifest.json)
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
const dir = process.argv[2];
if (!dir || !existsSync(path.join(dir, 'database.dump'))) { console.error('Informe a pasta do backup (com database.dump). Ex.: npm run backup:verify -- backups\\20261027-090000'); process.exit(2); }
const manifest = existsSync(path.join(dir, 'manifest.json')) ? JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8').replace(/^﻿/, '')) : {};
const filesDir = path.join(dir, 'files'), stored = new Set(existsSync(filesDir) ? readdirSync(filesDir) : []);
const name = `cell-verify-${process.pid}`, port = 55600 + (process.pid % 90);
const docker = (...a) => spawnSync('docker', a, { encoding: 'utf8' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const problems = [], report = {};
try {
  if (docker('run', '-d', '--rm', '--name', name, '-e', 'POSTGRES_USER=cell', '-e', 'POSTGRES_PASSWORD=verify-only', '-e', 'POSTGRES_DB=cell', '-p', `127.0.0.1:${port}:5432`, 'postgres:17-alpine').status !== 0) throw new Error('Não foi possível iniciar o PostgreSQL temporário.');
  for (let i = 0; i < 60 && docker('exec', name, 'pg_isready', '-U', 'cell', '-d', 'cell', '-q').status !== 0; i++) await sleep(1000);
  await sleep(1500);
  if (docker('cp', path.join(dir, 'database.dump'), `${name}:/tmp/restore.dump`).status !== 0) throw new Error('Não foi possível copiar o dump para o banco temporário.');
  // Same flags as scripts/restore.ps1, so this exercises the real restore procedure.
  const restore = docker('exec', name, 'pg_restore', '-U', 'cell', '-d', 'cell', '--clean', '--if-exists', '--no-owner', '--exit-on-error', '/tmp/restore.dump');
  if (restore.status !== 0) throw new Error('pg_restore falhou: ' + restore.stderr.slice(0, 500));
  const c = new pg.Client({ connectionString: `postgres://cell:verify-only@127.0.0.1:${port}/cell` }); await c.connect();
  const q = async (sql) => (await c.query(sql)).rows;
  const migrations = (await q('SELECT name FROM migrations ORDER BY name')).map(r => r.name);
  report.migrations = migrations.length; report.lastMigration = migrations.at(-1);
  const repoMigrations = readdirSync(new URL('../apps/server/migrations/', import.meta.url)).filter(f => f.endsWith('.sql'));
  const missing = repoMigrations.filter(m => !migrations.includes(m));
  if (missing.length) report.pendingMigrations = missing; // Newer code applies these on start; not an error for older backups.
  report.counts = Object.fromEntries((await q("SELECT 'agents' AS t,count(*)::int AS n FROM agents UNION ALL SELECT 'conversations',count(*)::int FROM conversations UNION ALL SELECT 'messages',count(*)::int FROM messages UNION ALL SELECT 'runs',count(*)::int FROM runs UNION ALL SELECT 'files',count(*)::int FROM files")).map(r => [r.t, r.n]));
  if (!report.counts.agents) problems.push('Nenhum agente no backup.');
  for (const [table, n] of Object.entries(manifest.counts || {})) if (report.counts[table] !== n) problems.push(`${table}: manifesto registra ${n}, backup restaurado tem ${report.counts[table]}.`);
  const fileRows = await q('SELECT name,storage_name FROM files');
  const absent = fileRows.filter(f => !stored.has(f.storage_name));
  report.files = { inDatabase: fileRows.length, inFolder: stored.size, missing: absent.length };
  if (absent.length) problems.push(`${absent.length} arquivo(s) citados no banco não estão na pasta files/ (ex.: ${absent.slice(0, 3).map(f => f.name).join(', ')}).`);
  if (manifest.requiresOriginalSecretKey) report.note = 'Tokens e credenciais só abrem com a SECRET_KEY original (guarde o .env junto).';
  await c.end();
} catch (e) { problems.push(e.message); }
finally { docker('stop', name); }
console.log(JSON.stringify({ backup: path.resolve(dir), createdAt: manifest.createdAt, ...report, ok: !problems.length, problems }, null, 2));
process.exit(problems.length ? 1 : 0);
