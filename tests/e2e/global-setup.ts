import { request } from '@playwright/test';
import { fileURLToPath } from 'node:url';
const authFile = fileURLToPath(new URL('../../test-results/.auth.json', import.meta.url));
// One login for the whole run: the login rate limit (10 per 15 min per IP) would otherwise block later tests.
export default async function globalSetup() {
  const ctx = await request.newContext({ baseURL: process.env.E2E_BASE_URL });
  const r = await ctx.post('/api/login', { data: { username: process.env.E2E_USER, password: process.env.E2E_PASSWORD } });
  if (!r.ok()) throw new Error(`Login de teste falhou: ${r.status()} ${await r.text()}`);
  await ctx.storageState({ path: authFile });
  await ctx.dispose();
}
