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
  const mcp = page.locator('.diag-card', { hasText: 'Conexões MCP' });
  await expect(mcp).toContainText('1 conexão ativa');
  await expect(mcp).toContainText('Todoist');
  await expect(mcp).toContainText('Não concluídas: Miro (aguardando autorização)');
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

test('rotina proposta aparece na conversa e é ativada', async ({ page }) => {
  await openAgents(page);
  await page.locator('.agent-row', { hasText: 'Coordenador' }).click();
  if (mobile(page)) await expect(page.locator('.sidebar.open')).toHaveCount(0);
  await expect(page.locator('.routine-tag')).toContainText('Rotina agendada · Bom dia');
  const card = page.locator('.routine-card', { hasText: 'ROTINA PROPOSTA' });
  await expect(card).toContainText('Bom dia');
  await noHorizontalScroll(page);
  await page.waitForTimeout(300); // drawer slide-out animation
  await page.screenshot({ path: `test-results/rotina-${page.viewportSize()!.width}.png` });
  await card.getByRole('button', { name: 'Ativar rotina' }).click();
  await expect(page.locator('.routine-card.active')).toContainText('Rotina ativa: Bom dia');
  await page.locator('.routine-card.active').getByRole('button', { name: 'Pausar' }).click();
  await expect(page.locator('.routine-card', { hasText: 'ROTINA PROPOSTA' })).toBeVisible();
});

test('notificações: painel de ativação por aparelho', async ({ page }) => {
  await openAgents(page);
  if (tablet(page)) await page.locator('.profile').click(); else await page.getByRole('button', { name: /e2e/ }).click();
  await page.getByRole('menuitem', { name: 'Notificações' }).click();
  const panel = page.locator('.notifications');
  await expect(panel.getByRole('heading', { name: 'Notificações' })).toBeVisible();
  await expect(panel.getByRole('button', { name: /Ativar notificações neste aparelho/ })).toBeVisible();
  await expect(panel.getByText('Nenhum aparelho inscrito.')).toBeVisible();
  await noHorizontalScroll(page);
  await page.screenshot({ path: `test-results/notificacoes-${page.viewportSize()!.width}.png` });
});

test('sino de notificações abre a aprovação pendente', async ({ page }) => {
  const bell = page.locator('.icon-btn.bell');
  await expect(bell.locator('.bell-count')).toBeVisible();
  await bell.click();
  // The Coordenador conversation is open on screen, so its message is not listed as unread.
  await expect(page.locator('.notification-item', { hasText: 'Coordenador' })).toHaveCount(0);
  const item = page.locator('.notification-item', { hasText: 'Redator' });
  await expect(item).toContainText('Aprovação');
  await noHorizontalScroll(page);
  await page.screenshot({ path: `test-results/sino-${page.viewportSize()!.width}.png` });
  await item.click();
  await expect(page.locator('.agent-title')).toContainText('Redator');
  await expect(page).toHaveTitle(/^\(\d+\) Cell/);
});

test('notificações por agente e convite para ativar no aparelho', async ({ page }) => {
  const offer = page.locator('.push-offer');
  await expect(offer).toBeVisible();
  await offer.getByRole('button', { name: 'Agora não' }).click();
  await expect(offer).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.chat-header')).toBeVisible();
  await expect(page.locator('.push-offer')).toHaveCount(0);
  await openAgents(page);
  await page.locator('.agent-row', { hasText: 'Revisor' }).click();
  await page.getByLabel('Detalhes do agente').click();
  await page.getByRole('button', { name: 'Notificações ativadas', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Notificações desativadas', exact: true })).toBeVisible();
  await page.getByLabel('Fechar detalhes').click();
  await openAgents(page);
  // The collapsed tablet sidebar shows only avatars, so the muted icon next to the name is checked where names are visible.
  if (!tablet(page)) await expect(page.locator('.agent-row', { hasText: 'Revisor' }).locator('.muted-bell')).toBeVisible();
  await page.locator('.agent-row', { hasText: 'Revisor' }).click();
  await page.getByLabel('Detalhes do agente').click();
  await page.getByRole('button', { name: 'Notificações desativadas', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Notificações ativadas', exact: true })).toBeVisible();
});

test('aplicativos: catálogo com um clique e guia do Google', async ({ page }) => {
  await openAgents(page);
  if (tablet(page)) await page.locator('.profile').click(); else await page.getByRole('button', { name: /e2e/ }).click();
  await page.getByRole('menuitem', { name: 'Conectar aplicativos' }).click();
  const dialog = page.getByRole('dialog', { name: 'Conectar aplicativos' });
  const card = (name: string) => dialog.locator('.app-card', { hasText: name });
  await expect(card('Notion').getByRole('button', { name: 'Conectar' })).toBeVisible();
  await expect(card('Todoist')).toContainText('Conectado · 2 ferramentas');
  await expect(card('Google Tarefas').getByRole('button', { name: 'Configurar' })).toBeVisible();
  await card('Gmail').getByRole('button', { name: 'Configurar' }).click();
  await expect(dialog.locator('.google-setup')).toContainText('/api/connections/oauth/callback');
  await noHorizontalScroll(page);
  await page.screenshot({ path: `test-results/apps-${page.viewportSize()!.width}.png`, fullPage: true });
});

test('volta do OAuth com erro abre o painel e explica', async ({ page }) => {
  await page.goto('/?connector_error=' + encodeURIComponent('Acesso negado pelo usuário'));
  await expect(page.getByRole('dialog', { name: 'Conectar aplicativos' })).toBeVisible();
  await expect(page.locator('.toast')).toContainText('Acesso negado pelo usuário');
  expect(new URL(page.url()).search).toBe('');
});

test('voz: gravar, mensagens de áudio e resposta falada', async ({ page }) => {
  await openAgents(page);
  await page.locator('.agent-row', { hasText: 'Revisor' }).click();
  await expect(page.locator('.voice-tag')).toContainText('Você · áudio');
  await expect(page.locator('audio.audio-attachment')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Ouvir resposta' })).toBeVisible();
  const mic = page.getByRole('button', { name: 'Gravar áudio' });
  await expect(mic).toBeVisible();
  await page.locator('#composer').fill('texto');
  await expect(mic).toHaveCount(0);
  await page.locator('#composer').fill('');
  await mic.click();
  await expect(page.locator('.recording-bar')).toContainText(/Gravando 0:0[1-9]/, { timeout: 5000 });
  await noHorizontalScroll(page);
  await page.screenshot({ path: `test-results/voz-${page.viewportSize()!.width}.png` });
  await page.locator('.recording-bar').getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.locator('.recording-bar')).toHaveCount(0);
  await mic.click();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Enviar áudio' }).click();
  // No 9router in this stack: transcription fails and the error is shown instead of a silent loss.
  await expect(page.locator('.toast')).toContainText(/Transcrição|transcrição|9router|modelo/i, { timeout: 15000 });
});

test('agente: opção de responder com áudio e logotipos dos aplicativos', async ({ page }) => {
  await openAgents(page);
  await page.locator('.agent-row', { hasText: 'Revisor' }).click();
  await page.getByLabel('Detalhes do agente').click();
  await page.getByRole('button', { name: 'Editar agente' }).click();
  // Independent of the starting value: flip it, check it was saved, then restore it.
  const box = page.getByLabel(/Responder com áudio quando eu enviar áudio/);
  const before = await box.isChecked();
  await box.setChecked(!before);
  await page.getByRole('button', { name: 'Salvar agente' }).click();
  await page.getByRole('button', { name: 'Editar agente' }).click();
  if (before) await expect(box).not.toBeChecked(); else await expect(box).toBeChecked();
  await box.setChecked(before);
  await page.getByRole('button', { name: 'Salvar agente' }).click();
  await page.getByLabel('Fechar detalhes').click();
  await openAgents(page);
  if (tablet(page)) await page.locator('.profile').click(); else await page.getByRole('button', { name: /e2e/ }).click();
  await page.getByRole('menuitem', { name: 'Conectar aplicativos' }).click();
  const dialog = page.getByRole('dialog', { name: 'Conectar aplicativos' });
  await expect(dialog.locator('.app-card', { hasText: 'Notion' }).locator('.app-logo.brand svg')).toBeVisible();
  await expect(dialog.locator('.app-card', { hasText: 'Gmail' }).locator('.app-logo.brand svg')).toBeVisible();
  await expect(dialog.locator('.app-card', { hasText: 'Canva' }).locator('.app-logo:not(.brand)')).toHaveText('C');
  await page.screenshot({ path: `test-results/logos-${page.viewportSize()!.width}.png` });
});

test('rotinas: ativar e desativar no interruptor e excluir', async ({ page }) => {
  const name = 'Relatório ' + page.viewportSize()!.width;
  await openAgents(page);
  await page.locator('.agent-row', { hasText: 'Pesquisador' }).click();
  await page.getByLabel('Detalhes do agente').click();
  await page.locator('.details-panel').getByRole('button', { name: 'Rotinas' }).click();
  const card = page.locator('.routine-card', { hasText: name });
  const toggle = card.getByRole('switch');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(card).toContainText('Pausada');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(card).toContainText('Ativa');
  await noHorizontalScroll(page);
  await page.screenshot({ path: 'test-results/rotinas-' + page.viewportSize()!.width + '.png' });
  await card.getByLabel('Excluir a rotina ' + name).click();
  await page.locator('.swal2-confirm').click();
  await expect(card).toHaveCount(0);
});

test('campo de mensagem volta ao tamanho original depois de enviar', async ({ page }) => {
  // The send itself is stubbed so the shared test data stays as seeded.
  await page.route('**/api/conversations/*/messages', route => route.request().method() === 'POST' ? route.fulfill({ json: { id: 'stub', state: 'queued' } }) : route.continue());
  await openAgents(page);
  await page.locator('.agent-row', { hasText: 'Revisor' }).click();
  const box = page.locator('#composer');
  const original = (await box.boundingBox())!.height;
  await box.fill('Analise o mercado.\nCompare as taxas.\nGere um PDF.\nInclua projeções.\nResuma no fim.');
  expect((await box.boundingBox())!.height).toBeGreaterThan(original + 20);
  await page.getByLabel('Enviar mensagem').click();
  await expect(box).toHaveValue('');
  await expect.poll(async () => (await box.boundingBox())!.height).toBeLessThanOrEqual(original + 1);
});

test('canva: diálogos funcionam dentro da janela de aplicativos', async ({ page }) => {
  // Stub the provider round trip: the point is that the dialogs inside the modal take clicks, focus and typing.
  await page.route('**/api/connectors/canva/connect', route => route.fulfill({ json: { authorizationUrl: 'about:blank', manualReturn: true } }));
  let pasted = '';
  await page.route('**/api/connectors/canva/complete', route => { pasted = route.request().postDataJSON().url; return route.fulfill({ json: { connected: true, tools: 3 } }); });
  await openAgents(page);
  if (tablet(page)) await page.locator('.profile').click(); else await page.getByRole('button', { name: /e2e/ }).click();
  await page.getByRole('menuitem', { name: 'Conectar aplicativos' }).click();
  const dialog = page.getByRole('dialog', { name: 'Conectar aplicativos' });
  await dialog.locator('.app-card', { hasText: 'Canva' }).getByRole('button', { name: 'Conectar' }).click();
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Abrir o Canva' }).click();
  await (await popup).close();
  const field = page.locator('.swal2-input');
  await expect(field).toBeVisible();
  await field.fill('http://127.0.0.1:53682/cell/oauth/callback?code=abc&state=xyz');
  await expect(field).toBeFocused();
  await page.getByRole('button', { name: 'Concluir conexão' }).click();
  await expect(page.getByText('Canva conectado: 3 ferramentas.')).toBeVisible();
  expect(pasted).toContain('code=abc');
  await expect(dialog).toBeVisible();
  // Escape closes only the dialog on top, not the window behind it.
  await dialog.locator('.app-card', { hasText: 'Canva' }).getByRole('button', { name: 'Conectar' }).click();
  await expect(page.getByRole('button', { name: 'Abrir o Canva' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Abrir o Canva' })).toHaveCount(0);
  await expect(dialog).toBeVisible();
});
