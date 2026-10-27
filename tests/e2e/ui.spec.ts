import { test, expect, type Page } from '@playwright/test';
const mobile = (page: Page) => (page.viewportSize()?.width || 0) < 768;
const tablet = (page: Page) => { const w = page.viewportSize()?.width || 0; return w >= 768 && w < 1200; };

// The session comes from global-setup (storageState); login itself is covered there.
async function open(page: Page) { await page.goto('/'); await expect(page.locator('.chat-header')).toBeVisible(); }
async function openAgents(page: Page) { if (mobile(page)) { await page.getByLabel('Abrir agentes').click(); await expect(page.locator('.sidebar.open')).toBeVisible(); } }
async function noHorizontalScroll(page: Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1); }

test.beforeEach(async ({ page }) => { await open(page); });

test('estados das células na lista e no cabeçalho', async ({ page }) => {
  await openAgents(page);
  const avatar = (name: string) => page.locator('.agent-row', { hasText: name }).locator('.cell-avatar');
  await expect(avatar('Redator')).toHaveAttribute('aria-label', /Aguardando aprovação/);
  await expect(avatar('Revisor')).toHaveAttribute('aria-label', /Falhou/);
  await expect(avatar('Pesquisador')).toHaveAttribute('aria-label', /Trabalhando/);
  await expect(avatar('Coordenador')).toHaveAttribute('aria-label', /Aguardando agente/);
  await page.locator('.agent-row', { hasText: 'Redator' }).click();
  if (mobile(page)) await expect(page.locator('.sidebar.open')).toHaveCount(0);
  await expect(page.locator('.agent-title .cell-avatar')).toHaveAttribute('aria-label', /Aguardando aprovação/);
  await noHorizontalScroll(page);
  await page.screenshot({ path: `test-results/estados-${page.viewportSize()!.width}.png` });
});

test('gaveta de agentes abre e fecha no celular', async ({ page }) => {
  test.skip(!mobile(page), 'Gaveta só existe abaixo de 768 px');
  await page.getByLabel('Abrir agentes').click();
  await expect(page.locator('.sidebar.open')).toBeVisible();
  await page.locator('.drawer-scrim').click({ position: { x: page.viewportSize()!.width - 10, y: 300 } });
  await expect(page.locator('.sidebar.open')).toHaveCount(0);
});

test('central de atividade: filtros, detalhes, árvore e aprovação', async ({ page }) => {
  await page.getByLabel('Central de atividade').click();
  const dialog = page.getByRole('dialog', { name: 'Central de atividade' });
  await expect(dialog.locator('.activity-item')).toHaveCount(5);
  await expect(dialog.locator('.summary-chip.waiting_approval strong')).toHaveText('1');
  await noHorizontalScroll(page);
  await page.screenshot({ path: `test-results/atividade-${page.viewportSize()!.width}.png` });
  await dialog.getByRole('tab', { name: 'Falhas' }).click();
  await expect(dialog.locator('.activity-item')).toHaveCount(1);
  await expect(dialog.locator('.activity-error')).toContainText('não retornou resposta');
  await dialog.getByRole('tab', { name: 'Todas' }).click();
  await dialog.getByLabel('Filtrar por agente').selectOption({ label: 'Pesquisador' });
  await expect(dialog.locator('.activity-item')).toHaveCount(1);
  await dialog.locator('.activity-item').first().click();
  await expect(dialog.locator('.run-tree .tree-node')).toHaveCount(2);
  await expect(dialog.locator('.mode-badge', { hasText: 'Delegada' })).toBeVisible();
  await dialog.getByRole('button', { name: /Voltar à atividade/ }).click();
  await dialog.getByLabel('Filtrar por agente').selectOption({ label: 'Redator' });
  await dialog.locator('.activity-item').first().click();
  await dialog.locator('.run-call summary').click();
  await expect(dialog.getByRole('button', { name: 'Aprovar' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Negar' })).toBeVisible();
  await noHorizontalScroll(page);
  await page.screenshot({ path: `test-results/detalhe-${page.viewportSize()!.width}.png` });
});

test('documentos usados e editor de memória', async ({ page }) => {
  await openAgents(page);
  await page.locator('.agent-row', { hasText: 'Coordenador' }).click();
  await page.getByText(/Documentos usados \(2\)/).click();
  await expect(page.locator('.docs-used')).toContainText('omitido');
  await page.getByLabel('Detalhes do agente').click();
  await page.getByRole('button', { name: /Ver e editar memória/ }).click();
  const dialog = page.getByRole('dialog', { name: /Memória de Coordenador/ });
  await dialog.locator('textarea').fill('Prefere tabelas.');
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(dialog.locator('.revision-list li').first()).toContainText('Editada pelo usuário');
  await dialog.getByRole('button', { name: 'Resumo da conversa' }).click();
  await expect(dialog.locator('textarea')).toHaveValue('Decisão: lançar em março.');
});

test('diagnóstico mostra a saúde sem segredos', async ({ page }) => {
  await openAgents(page);
  if (tablet(page)) await page.locator('.profile').click(); else await page.getByRole('button', { name: /e2e/ }).click();
  await page.getByRole('menuitem', { name: 'Diagnóstico' }).click();
  await expect(page.locator('.diag-card')).toHaveCount(7);
  await expect(page.locator('.diag-card', { hasText: 'Banco de dados' }).locator('.diag-led')).toHaveText('OK');
  await expect(page.locator('.diag-card', { hasText: '9router' }).locator('.diag-led')).toHaveText('Falha');
  await noHorizontalScroll(page);
});

test('reconexão com o servidor', async ({ page }) => {
  await page.route('**/api/events', route => route.abort());
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await page.reload();
  await expect(page.locator('.connection-bar')).toBeVisible({ timeout: 15_000 });
  await page.unroute('**/api/events');
  await expect(page.locator('.connection-bar')).toHaveCount(0, { timeout: 20_000 });
});
