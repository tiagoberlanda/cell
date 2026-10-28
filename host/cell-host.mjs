// Cell Host: runs on Windows (outside Docker) as the logged-in user, without administrator rights, and lets the Cell
// worker run PowerShell commands on this computer. It listens on 127.0.0.1 only (Docker Desktop forwards
// host.docker.internal there; the LAN and the internet cannot reach it) and requires the shared token. Every command
// is approved by the owner in Cell before it is sent here. No dependencies: plain Node.
// Config: %LOCALAPPDATA%\Cell\host.json {port, token}, written by scripts/host.ps1 (or CELL_HOST_CONFIG).
import { createServer } from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { readFileSync, appendFileSync, mkdirSync, existsSync, statSync, statfsSync, createWriteStream, openSync, readSync, closeSync, fstatSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { timingSafeEqual } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VERSION = '1.2.0';
const dir = path.join(process.env.LOCALAPPDATA || os.homedir(), 'Cell');
const configPath = process.env.CELL_HOST_CONFIG || path.join(dir, 'host.json');
const logPath = path.join(dir, 'host.log');
const MAX_OUTPUT = 20000;

const log = line => { try { mkdirSync(dir, { recursive: true }); appendFileSync(logPath, `${new Date().toISOString()} ${line}\n`); } catch {} };
const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

// PowerShell with UTF-8 output; the script travels as -EncodedCommand, so quotes and line breaks need no escaping.
export function runPowerShell(command, { cwd, timeoutMs = 60000 } = {}) {
  return new Promise(resolve => {
    const script = '[Console]::OutputEncoding=[Text.Encoding]::UTF8;$OutputEncoding=[Text.Encoding]::UTF8;$ProgressPreference="SilentlyContinue";\n' + command;
    const started = Date.now();
    const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { cwd: cwd || os.homedir(), windowsHide: true });
    let stdout = '', stderr = '', truncated = false, timedOut = false;
    const take = (cur, chunk) => { const next = cur + chunk.toString('utf8'); if (next.length > MAX_OUTPUT) { truncated = true; return next.slice(0, MAX_OUTPUT); } return next; };
    child.stdout.on('data', c => { stdout = take(stdout, c); });
    child.stderr.on('data', c => { stderr = take(stderr, c); });
    // On timeout, end the whole process tree (commands may start children).
    const timer = setTimeout(() => { timedOut = true; execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => {}); }, timeoutMs);
    child.on('error', e => { clearTimeout(timer); resolve({ exitCode: -1, stdout, stderr: String(e.message), timedOut, truncated, ms: Date.now() - started }); });
    child.on('close', code => { clearTimeout(timer); resolve({ exitCode: code, stdout: stdout.trim(), stderr: stderr.trim(), timedOut, truncated, ms: Date.now() - started }); });
  });
}

// Background jobs: no time limit; output goes to %LOCALAPPDATA%\Cell\jobs\<id>.log (capped at 5 MB). Jobs live in
// memory: after a host restart their status is gone and Cell reports them as lost.
const jobsDir = path.join(dir, 'jobs');
const jobs = new Map();
const MAX_JOB_LOG = 5 * 1024 * 1024;
function startJob(command, cwd) {
  mkdirSync(jobsDir, { recursive: true });
  const id = randomUUID(), file = path.join(jobsDir, `${id}.log`), out = createWriteStream(file);
  const script = '[Console]::OutputEncoding=[Text.Encoding]::UTF8;$OutputEncoding=[Text.Encoding]::UTF8;$ProgressPreference="SilentlyContinue";\n' + command;
  const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { cwd: cwd || os.homedir(), windowsHide: true });
  const job = { id, file, pid: child.pid, running: true, exitCode: null, cancelled: false, startedAt: new Date().toISOString(), finishedAt: null, size: 0 };
  const write = c => { if (job.size >= MAX_JOB_LOG) return; job.size += c.length; out.write(job.size > MAX_JOB_LOG ? c.subarray(0, c.length - (job.size - MAX_JOB_LOG)) : c); };
  child.stdout.on('data', write); child.stderr.on('data', write);
  const end = code => { if (!job.running) return; job.running = false; job.exitCode = code; job.finishedAt = new Date().toISOString(); out.end(); log(`job ${id} exit=${code}${job.cancelled ? ' cancelled' : ''}`); };
  child.on('error', e => { write(Buffer.from(String(e.message))); end(-1); });
  child.on('close', code => end(code ?? -1));
  jobs.set(id, job);
  log(`job ${id} start cwd=${cwd || '~'} ${command.replace(/\s+/g, ' ').slice(0, 500)}`);
  return job;
}
function tail(file, bytes = 8000) {
  try { const fd = openSync(file, 'r'); try { const size = fstatSync(fd).size, len = Math.min(bytes, size), buf = Buffer.alloc(len); readSync(fd, buf, 0, len, size - len); return buf.toString('utf8'); } finally { closeSync(fd); } } catch { return ''; }
}
const jobView = j => ({ id: j.id, running: j.running, exitCode: j.exitCode, cancelled: j.cancelled, startedAt: j.startedAt, finishedAt: j.finishedAt, output: tail(j.file), truncated: j.size >= MAX_JOB_LOG });

// CPU use over the last 15 s (os.loadavg is always 0 on Windows) and free space of every drive letter.
let cpuPct = null, lastCpu = os.cpus();
setInterval(() => { const now = os.cpus(); let idle = 0, total = 0; now.forEach((c, i) => { const p = lastCpu[i]?.times || c.times; for (const k of Object.keys(c.times)) total += c.times[k] - p[k]; idle += c.times.idle - p.idle; }); lastCpu = now; if (total > 0) cpuPct = Math.round(100 * (1 - idle / total)); }, 15000).unref();
function disks() {
  const out = [];
  for (const l of 'CDEFGHIJKLMNOPQRSTUVWXYZ') { try { const s = statfsSync(`${l}:/`); if (s.blocks > 0) out.push({ drive: `${l}:`, totalGb: Math.round(s.blocks * s.bsize / 1e8) / 10, freeGb: Math.round(s.bavail * s.bsize / 1e8) / 10 }); } catch {} }
  return out;
}
function status() {
  return { version: VERSION, cpuPct, disks: disks(), computer: os.hostname(), user: os.userInfo().username, os: `${os.type()} ${os.release()}`, uptimeHours: Math.round(os.uptime() / 360) / 10,
    memory: { totalGb: Math.round(os.totalmem() / 1e8) / 10, freeGb: Math.round(os.freemem() / 1e8) / 10 }, cpus: os.cpus().length, home: os.homedir() };
}

async function body(req) {
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 200000) throw new Error('too large'); chunks.push(c); }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

export function startHost({ port, token, host = '127.0.0.1' }) {
  if (!token || token.length < 32) throw new Error('Token ausente ou curto demais.');
  const server = createServer(async (req, res) => {
    try {
      // Browsers send Origin: refuse them, so a web page cannot drive the host even if it guessed the port.
      if (req.headers.origin) return json(res, 403, { error: 'forbidden' });
      if (!same(String(req.headers.authorization || ''), 'Bearer ' + token)) { log(`denied ${req.method} ${req.url}`); return json(res, 401, { error: 'unauthorized' }); }
      if (req.method === 'GET' && req.url === '/status') return json(res, 200, status());
      if (req.method === 'POST' && req.url === '/run') {
        const b = await body(req);
        const command = String(b.command || '');
        if (!command.trim() || command.length > 20000) return json(res, 400, { error: 'Comando vazio ou grande demais.' });
        const cwd = b.cwd ? String(b.cwd) : undefined;
        if (cwd && !(existsSync(cwd) && statSync(cwd).isDirectory())) return json(res, 400, { error: `Pasta não encontrada: ${cwd}` });
        const timeoutMs = Math.min(Math.max(Number(b.timeoutSeconds) || 60, 1), 600) * 1000;
        log(`run cwd=${cwd || '~'} ${command.replace(/\s+/g, ' ').slice(0, 500)}`);
        const result = await runPowerShell(command, { cwd, timeoutMs });
        log(`exit=${result.exitCode} ms=${result.ms}${result.timedOut ? ' timeout' : ''}`);
        return json(res, 200, result);
      }
      if (req.method === 'POST' && req.url === '/jobs') {
        const b = await body(req);
        const command = String(b.command || '');
        if (!command.trim() || command.length > 20000) return json(res, 400, { error: 'Comando vazio ou grande demais.' });
        const cwd = b.cwd ? String(b.cwd) : undefined;
        if (cwd && !(existsSync(cwd) && statSync(cwd).isDirectory())) return json(res, 400, { error: `Pasta não encontrada: ${cwd}` });
        return json(res, 200, jobView(startJob(command, cwd)));
      }
      const m = /^\/jobs\/([0-9a-f-]{36})(\/cancel)?$/.exec(req.url || '');
      if (m) {
        const job = jobs.get(m[1]);
        if (!job) return json(res, 404, { error: 'Tarefa não encontrada (o Cell Host pode ter sido reiniciado).' });
        if (m[2] && req.method === 'POST') { if (job.running) { job.cancelled = true; execFile('taskkill', ['/PID', String(job.pid), '/T', '/F'], () => {}); } return json(res, 200, { ok: true }); }
        if (req.method === 'GET') return json(res, 200, jobView(job));
      }
      return json(res, 404, { error: 'not found' });
    } catch (e) { return json(res, 400, { error: String(e?.message || e) }); }
  });
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, () => { log(`Cell Host ${VERSION} ouvindo em ${host}:${port}`); resolve(server); }); });
}

if (process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  startHost({ port: Number(config.port) || 47821, token: config.token }).catch(e => { log(`falha ao iniciar: ${e.message}`); console.error(e.message); process.exit(1); });
}
