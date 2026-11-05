// Runs the full test suite against a throwaway PostgreSQL container that is removed afterwards.
// Usage: npm run test:db
import { spawnSync } from 'node:child_process';
const name = `cell-test-${process.pid}`, port = 55400 + (process.pid % 90);
const useWsl = process.platform === 'win32' && spawnSync('docker', ['info']).status !== 0;
const docker = (...args) => useWsl ? spawnSync('wsl', ['docker', ...args], { encoding: 'utf8' }) : spawnSync('docker', args, { encoding: 'utf8' });
const started = docker('run', '-d', '--rm', '--name', name, '-e', 'POSTGRES_USER=cell', '-e', 'POSTGRES_PASSWORD=cell-test-only', '-e', 'POSTGRES_DB=cell_test', '-p', `127.0.0.1:${port}:5432`, 'postgres:17-alpine');
if (started.status !== 0) { console.error(started.stderr); process.exit(1); }
let status = 1;
try {
  for (let i = 0; i < 60 && docker('exec', name, 'pg_isready', '-U', 'cell', '-d', 'cell_test', '-q').status !== 0; i++) await new Promise(r => setTimeout(r, 1000));
  await new Promise(r => setTimeout(r, 1500));
  status = spawnSync(process.execPath, ['--import', 'tsx', '--test', 'tests/*.test.ts'], { stdio: 'inherit', env: { ...process.env, TEST_DATABASE_URL: `postgres://cell:cell-test-only@127.0.0.1:${port}/cell_test` } }).status ?? 1;
} finally { docker('stop', name); }
process.exit(status);
