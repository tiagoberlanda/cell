// Cuts a release: bumps every package.json, dates the CHANGELOG entry, commits and tags vX.Y.Z.
// Usage: npm run release -- patch|minor|major|X.Y.Z
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const root = new URL('../', import.meta.url);
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const fail = (msg) => { console.error(msg); process.exit(1); };

const bump = process.argv[2];
if (!bump) fail('Informe patch, minor, major ou uma versão X.Y.Z.');
if (git('status', '--porcelain', '--', '.')) fail('Há alterações sem commit. Faça o commit antes de gerar a versão.');

const rootPkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const [major, minor, patch] = rootPkg.version.split('.').map(Number);
const next = { major: `${major + 1}.0.0`, minor: `${major}.${minor + 1}.0`, patch: `${major}.${minor}.${patch + 1}` }[bump] ?? bump;
if (!/^\d+\.\d+\.\d+$/.test(next)) fail(`Versão inválida: ${next}`);
if (git('tag', '--list', `v${next}`)) fail(`A tag v${next} já existe.`);

const changelogUrl = new URL('CHANGELOG.md', root);
const changelog = readFileSync(changelogUrl, 'utf8');
const unreleased = changelog.match(/## \[Não lançado\]\r?\n([\s\S]*?)(?=\r?\n## \[|$)/);
if (!unreleased || !unreleased[1].trim()) fail('Descreva as mudanças em "## [Não lançado]" no CHANGELOG.md antes de gerar a versão.');
const today = new Date().toISOString().slice(0, 10);
writeFileSync(changelogUrl, changelog.replace('## [Não lançado]', `## [Não lançado]\n\n## [${next}] - ${today}`));

const manifests = ['package.json', 'apps/server/package.json', 'apps/web/package.json', 'packages/shared/package.json'];
for (const file of manifests) {
  const url = new URL(file, root), text = readFileSync(url, 'utf8');
  writeFileSync(url, text.replace(/("version"\s*:\s*")[^"]+(")/, `$1${next}$2`));
}
const lockUrl = new URL('package-lock.json', root), lock = JSON.parse(readFileSync(lockUrl, 'utf8'));
lock.version = next;
for (const [key, entry] of Object.entries(lock.packages)) if (key === '' || manifests.some(m => m === `${key}/package.json`)) entry.version = next;
writeFileSync(lockUrl, JSON.stringify(lock, null, 2) + '\n');

git('add', '--', 'CHANGELOG.md', 'package-lock.json', ...manifests);
git('commit', '-m', `release: v${next}`);
git('tag', '-a', `v${next}`, '-m', `Cell v${next}`);
console.log(`Versão v${next} criada. Para publicar no Docker: ./scripts/deploy.ps1`);
