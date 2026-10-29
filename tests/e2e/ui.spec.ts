import { test, expect, type Page } from '@playwright/test';
const mobile = (page: Page) => (page.viewportSize()?.width || 0) < 768;
const tablet = (page: Page) => { const w = page.viewportSize()?.width || 0; return w >= 768 && w < 1200; };

// The session comes from global-setup (storageState); login itself is covered there.
async function open(page: Page) { await page.goto('/'); await expect(page.locator('.chat-header')).toBeVisible(); }
async function openAgents(page: Page) { if (mobile(page)) { await page.getByLabel('Abrir agentes').click(); await expect(page.locator('.sidebar.open')).toBeVisible(); } }
// Phones keep only notifications, archive and call in the header; the other buttons open from the ⋮ menu.
async function headerAction(page: Page, label: string, item: string) { if (mobile(page)) { await page.locator('.header-more').click(); await page.getByRole('menuitem', { name: item }).click(); } else await page.getByLabel(label).click(); }
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

test('menu lateral recolhe e expande no desktop', async ({ page }) => {
  // O botão só existe a partir de 1200 px; abaixo disso a lateral já é rail ou gaveta.
  test.skip((page.viewportSize()?.width || 0) < 1200, 'Recolher o menu só existe de 1200 px para cima');
  const shell = page.locator('.app-shell');
  const toggle = page.getByLabel('Recolher menu de agentes');
  const width = () => page.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().width);
  const expanded = await width();
  await toggle.click();
  await expect(shell).toHaveClass(/sidebar-collapsed/);
  await expect(page.getByLabel('Expandir menu de agentes')).toHaveAttribute('aria-expanded', 'false');
  // Recolhido: só os avatares ficam; o nome e o subtítulo do agente somem.
  await expect(page.locator('.agent-row .agent-copy').first()).toBeHidden();
  expect(await width()).toBeLessThan(expanded);
  expect(await page.evaluate(() => localStorage.getItem('cell.sidebar'))).toBe('collapsed');
  // A escolha sobrevive ao recarregar.
  await page.reload();
  await expect(page.locator('.chat-header')).toBeVisible();
  await expect(shell).toHaveClass(/sidebar-collapsed/);
  await expect(page.locator('.agent-row .agent-copy').first()).toBeHidden();
  // E volta ao normal.
  await page.getByLabel('Expandir menu de agentes').click();
  await expect(shell).not.toHaveClass(/sidebar-collapsed/);
  await expect(page.locator('.agent-row .agent-copy').first()).toBeVisible();
  expect(await width()).toBe(expanded);
  await noHorizontalScroll(page);
});

test('logo do topo leva ao agente principal sem recarregar a página', async ({ page }) => {
  // Reproduz o bug: o wordmark era um link href="/", então o clique recarregava o
  // app e o localStorage restaurava o agente/conversa anterior em vez do master.
  await openAgents(page);
  await page.locator('.agent-row', { hasText: 'Redator' }).click();
  await expect(page.locator('.agent-title')).toContainText('Redator');
  await page.evaluate(() => { (window as any).__cellNoReload = true; });
  await openAgents(page);
  await page.locator('.wordmark').click();
  await expect(page.locator('.agent-title')).toContainText('Coordenador');
  expect(await page.evaluate(() => (window as any).__cellNoReload === true)).toBe(true);
  if (mobile(page)) await expect(page.locator('.sidebar.open')).toHaveCount(0);
  await noHorizontalScroll(page);
});

test('central de atividade: filtros, detalhes, árvore e aprovação', async ({ page }) => {
  await headerAction(page, 'Central de atividade', 'Central de atividade');
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
  await headerAction(page, 'Detalhes do agente', 'Detalhes do agente');
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
  // O mesmo sino também existe no topo da lista de agentes (celular); aqui interessa o do cabeçalho.
  const bell = page.locator('.chat-header .icon-btn.bell');
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
  // The pending approval is the last thing in the chat and the notification lands on it.
  await expect(page.locator('.message-list > .approval-card').last()).toBeInViewport();
  expect(await page.locator('.message-list > *').evaluateAll(els => els.filter(e => e.getBoundingClientRect().height > 0).at(-1)?.className)).toContain('approval-card');
  await expect(page).toHaveTitle(/^\(\d+\) Cell/);
});

test('sino de notificações fica visível na lista de agentes no celular', async ({ page }) => {
  // A gaveta de agentes cobre o cabeçalho inteiro no celular: sem o sino aqui, um pedido de
  // aprovação que chega com a lista aberta (nenhuma conversa na tela) passaria em branco.
  test.skip(!mobile(page), 'A lista em gaveta só existe abaixo de 768 px');
  await page.getByLabel('Abrir agentes').click();
  await expect(page.locator('.sidebar.open')).toBeVisible();
  const bell = page.locator('.sidebar .icon-btn.bell');
  await expect(bell).toBeVisible();
  await expect(bell.locator('.bell-count')).toBeVisible();
  await bell.click();
  const item = page.locator('.notification-item', { hasText: 'Redator' });
  await expect(item).toContainText('Aprovação');
  await noHorizontalScroll(page);
  await page.screenshot({ path: `test-results/sino-agentes-${page.viewportSize()!.width}.png` });
  // Abrir o aviso leva à conversa do agente e fecha a gaveta.
  await item.click();
  await expect(page.locator('.agent-title')).toContainText('Redator');
  // The pending approval is the last thing in the chat and the notification lands on it.
  await expect(page.locator('.message-list > .approval-card').last()).toBeInViewport();
  expect(await page.locator('.message-list > *').evaluateAll(els => els.filter(e => e.getBoundingClientRect().height > 0).at(-1)?.className)).toContain('approval-card');
  await expect(page.locator('.sidebar.open')).toHaveCount(0);
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
  await headerAction(page, 'Detalhes do agente', 'Detalhes do agente');
  await page.getByRole('button', { name: 'Notificações ativadas', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Notificações desativadas', exact: true })).toBeVisible();
  await page.getByLabel('Fechar detalhes').click();
  await openAgents(page);
  // The collapsed tablet sidebar shows only avatars, so the muted icon next to the name is checked where names are visible.
  if (!tablet(page)) await expect(page.locator('.agent-row', { hasText: 'Revisor' }).locator('.muted-bell')).toBeVisible();
  await page.locator('.agent-row', { hasText: 'Revisor' }).click();
  await headerAction(page, 'Detalhes do agente', 'Detalhes do agente');
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
  await headerAction(page, 'Detalhes do agente', 'Detalhes do agente');
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
  await headerAction(page, 'Detalhes do agente', 'Detalhes do agente');
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

test('chamada de voz: ouve, pensa e responde falando', async ({ page }) => {
  // Silent microphone (no automatic turn) and device speech that never ends, so every phase can be checked.
  // Applied to the page already open (beforeEach); nothing reads these until the call starts.
  await page.evaluate(() => {
    AnalyserNode.prototype.getFloatTimeDomainData = function (a: Float32Array) { a.fill(0); };
    window.speechSynthesis.speak = () => {};
  });
  let posted = false;
  await page.route('**/api/conversations/*/audio', route => { posted = true; return route.fulfill({ json: { id: 'call-run', state: 'queued', transcript: 'Qual é a previsão de amanhã?' } }); });
  await page.route(/\/api\/conversations\/[0-9a-f-]{36}(\?.*)?$/, async route => {
    if (route.request().method() !== 'GET' || !posted) return route.continue();
    const res = await route.fetch().catch(() => null); if (!res) return; const body = await res.json().catch(() => null); if (!body) return;
    await new Promise(r => setTimeout(r, 1200)); // the agent "thinks" for a moment
    body.messages.push({ id: 'call-reply', role: 'assistant', content: 'Amanhã vai fazer sol à tarde.', voice: true, attachments: [], files: [], created_at: new Date().toISOString() });
    return route.fulfill({ response: res, json: body });
  });
  await openAgents(page);
  await page.locator('.agent-row', { hasText: 'Revisor' }).click();
  await page.getByLabel('Chamada de voz').click();
  const call = page.getByRole('dialog', { name: 'Chamada com Revisor' });
  const status = call.locator('.call-status');
  await expect(status).toHaveText('Ouvindo');
  await noHorizontalScroll(page);
  await page.waitForTimeout(1500); // the recorder collects a short turn
  await call.getByLabel('Enviar agora').click();
  await expect(status).toHaveText('Pensando…');
  await expect(call.locator('.call-dots')).toBeVisible();
  await expect(call).toContainText('Qual é a previsão de amanhã?');
  await expect(status).toHaveText('Falando');
  await expect(call.locator('.call-wave')).toBeVisible();
  await expect(call).toContainText('Amanhã vai fazer sol à tarde.');
  await page.screenshot({ path: `test-results/chamada-${page.viewportSize()!.width}.png` });
  await call.getByLabel('Interromper').click();
  await expect(status).toHaveText('Ouvindo');
  await call.getByLabel('Desligar microfone').click();
  await expect(status).toHaveText('Microfone desligado');
  await expect(call.getByLabel('Enviar agora')).toBeDisabled();
  await call.getByLabel('Encerrar chamada').click();
  await expect(call).toHaveCount(0);
});

test('voz do agente: modelo e voz por agente', async ({ page }) => {
  await page.route('**/api/models/audio', route => route.fulfill({ json: { stt: [], tts: [{ id: 'openrouter/openai/gpt-4o-mini-tts', name: 'gpt-4o-mini-tts' }, { id: 'nvidia/fastpitch', name: 'fastpitch' }] } }));
  await openAgents(page);
  await page.locator('.agent-row', { hasText: 'Pesquisador' }).click();
  await headerAction(page, 'Detalhes do agente', 'Detalhes do agente');
  await page.getByRole('button', { name: 'Editar agente' }).click();
  const model = page.getByLabel('Voz deste agente'), voice = page.getByLabel('Voz', { exact: true });
  // Widths share the database: start from the workspace default whatever an earlier run left.
  await model.selectOption('');
  await expect(voice).toBeDisabled(); // no workspace voice model in the test stack
  await model.selectOption('openrouter/openai/gpt-4o-mini-tts');
  await expect(voice.locator('option')).toHaveCount(13); // model default, 11 voices, custom
  await voice.selectOption('nova');
  await page.getByRole('button', { name: 'Salvar agente' }).click();
  await page.getByRole('button', { name: 'Editar agente' }).click();
  await expect(model).toHaveValue('openrouter/openai/gpt-4o-mini-tts');
  await expect(voice).toHaveValue('nova');
  await voice.selectOption('__custom');
  await expect(page.getByLabel('Voz: nome da voz')).toBeVisible();
  await model.selectOption('');
  await page.getByRole('button', { name: 'Salvar agente' }).click();
  await page.getByRole('button', { name: 'Editar agente' }).click();
  await expect(model).toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Editar agente' })).toHaveCount(0);
  await page.getByLabel('Fechar detalhes').click();
});

test('menu do agente: segurar no celular, três pontos no computador', async ({ page }) => {
  const w = page.viewportSize()!.width;
  await openAgents(page);
  const row = (name: string) => page.locator('.agent-row-wrap', { has: page.locator('.agent-row', { hasText: name }) });
  const menu = page.getByRole('menu');
  // Three dots with room for them; on the collapsed (icons-only) sidebar, right-click opens the same menu.
  const openMenu = async (name: string) => { if (tablet(page)) await row(name).locator('.agent-row').click({ button: 'right' }); else await row(name).getByLabel(`Opções de ${name}`).click(); await expect(menu).toBeVisible(); };
  // Touch: hold and release in place opens the agent's menu (moving instead would drag it).
  const box = (await row('Redator').locator('.agent-row').boundingBox())!;
  await row('Redator').locator('.agent-row').dispatchEvent('pointerdown', { pointerType: 'touch', button: 0, clientX: box.x + 20, clientY: box.y + 20, bubbles: true });
  await page.waitForTimeout(500);
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch' })));
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem')).toHaveText(['Fixar no topo', 'Renomear', 'Mover para outra seção']);
  // Rename (then restore: other tests use the name).
  await menu.getByRole('menuitem', { name: 'Renomear' }).click();
  await page.locator('.swal2-input').fill('Redator Chefe');
  await page.getByRole('button', { name: 'Renomear' }).click();
  await expect(page.locator('.swal2-container')).toHaveCount(0);
  await expect(row('Redator Chefe')).toBeVisible();
  await openMenu('Redator Chefe');
  await menu.getByRole('menuitem', { name: 'Renomear' }).click();
  await page.locator('.swal2-input').fill('Redator');
  await page.getByRole('button', { name: 'Renomear' }).click();
  await expect(page.locator('.swal2-container')).toHaveCount(0);
  await expect(page.locator('.agent-row', { hasText: 'Redator Chefe' })).toHaveCount(0);
  // Move to a new section, then back.
  const section = `Testes ${w}`;
  await openMenu('Redator');
  await menu.getByRole('menuitem', { name: 'Mover para outra seção' }).click();
  await page.locator('.swal2-select').selectOption({ label: '+ Nova seção…' });
  await page.getByRole('button', { name: 'Mover', exact: true }).click();
  await page.locator('.swal2-input').fill(section);
  await page.getByRole('button', { name: 'Criar e mover' }).click();
  await expect(page.locator('.swal2-container')).toHaveCount(0);
  await expect(page.locator('section', { has: page.locator('.section-label', { hasText: section }) }).locator('.agent-row', { hasText: 'Redator' })).toBeVisible();
  await openMenu('Redator');
  await menu.getByRole('menuitem', { name: 'Mover para outra seção' }).click();
  await page.locator('.swal2-select').selectOption('Equipe');
  await page.getByRole('button', { name: 'Mover', exact: true }).click();
  await expect(page.locator('.swal2-container')).toHaveCount(0);
  await expect(page.locator('section', { has: page.locator('.section-label', { hasText: 'Equipe' }) }).locator('.agent-row', { hasText: 'Redator' })).toBeVisible();
  // At most three pinned: with Coordenador plus two more, the fourth cannot be pinned.
  // Widths share the database: unpin whatever an interrupted earlier run left (Coordenador stays pinned).
  for (const name of ['Pesquisador', 'Redator', 'Revisor']) if (await row(name).getByLabel('Fixado no topo').count()) { await openMenu(name); await menu.getByRole('menuitem', { name: 'Desafixar do topo' }).click(); await expect(row(name).getByLabel('Fixado no topo')).toHaveCount(0); }
  for (const name of ['Redator', 'Revisor']) {
    await openMenu(name);
    await menu.getByRole('menuitem', { name: 'Fixar no topo' }).click();
    await expect(row(name).getByLabel('Fixado no topo')).toHaveCount(1);
  }
  await openMenu('Pesquisador');
  await expect(menu.getByRole('menuitem', { name: 'Fixar no topo (máximo de 3)' })).toBeDisabled();
  await page.keyboard.press('Escape');
  for (const name of ['Redator', 'Revisor']) {
    await openMenu(name);
    await menu.getByRole('menuitem', { name: 'Desafixar do topo' }).click();
    await expect(row(name).getByLabel('Fixado no topo')).toHaveCount(0);
  }
  await noHorizontalScroll(page);
});

test('configurações: pastas do computador', async ({ page }) => {
  let enabled = true;
  await page.route('**/api/host-access/commands', route => { if (route.request().method() === 'POST') { enabled = route.request().postDataJSON().enabled; return route.fulfill({ json: { enabled } }); } return route.fulfill({ json: { configured: true, enabled, error: '', status: { version: '1.0.0', computer: 'WINDOWS11', user: 'User', os: 'Windows_NT 10.0', uptimeHours: 3.5 }, recent: [{ id: 'c1', command: 'Get-ChildItem K:\Downloads', status: 'done', exitCode: 0, approval: 'approved', created_at: new Date().toISOString(), agent_name: 'Coordenador' }] } }); });
  await page.route('**/api/host-access', route => route.fulfill({ json: { drives: ['C', 'K'], grants: [{ id: '00000000-0000-0000-0000-000000000001', path: 'K:\Downloads', created_at: new Date().toISOString(), agent_id: 'x', agent_name: 'Coordenador' }] } }));
  await openAgents(page);
  if (tablet(page)) await page.locator('.profile').click(); else await page.getByRole('button', { name: /e2e/ }).click();
  await page.getByRole('menuitem', { name: 'Configurações' }).click();
  await page.getByRole('button', { name: 'Computador' }).click();
  await expect(page.locator('.computer-access')).toContainText('C: (sua pasta de usuário) · K:');
  await expect(page.locator('.computer-access > .grant-card')).toContainText('K:\Downloads');
  const host = page.locator('.host-commands');
  await expect(host).toContainText('WINDOWS11 · User');
  await expect(host.locator('.command-card')).toContainText('Get-ChildItem K:\Downloads');
  await expect(host.locator('.command-card')).toContainText('concluído');
  const sw = host.getByRole('switch', { name: 'Permitir comandos no computador' });
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('.computer-access > .grant-card')).toContainText('Coordenador');
  await noHorizontalScroll(page);
});

test('computadores: indicador verde ou cinza e lista de instâncias', async ({ page }) => {
  let online = true;
  const now = new Date().toISOString();
  await page.route('**/api/computers', route => route.fulfill({ json: { enabled: true, hostInstalled: true, computers: [
    { key: 'este-pc', id: 'local', name: 'Computador conectado', kind: 'local', shell: 'powershell', online, lastSeen: now, ...(online ? { info: { computer: 'WINDOWS11', user: 'User', os: 'Windows 11 Pro', uptimeHours: 5.2, memory: { totalGb: 32, freeGb: 9.5 }, cpus: 28 } } : { error: 'Computador conectado não respondeu.' }) },
    { key: 'servidor-linux', id: '00000000-0000-0000-0000-0000000000aa', name: 'Servidor Linux', kind: 'ssh', shell: 'bash', host: '192.168.0.50', port: 22, username: 'cell', online: false, error: 'SSH: connect ECONNREFUSED', lastSeen: now, info: null }
  ] } }));
  await page.reload(); await expect(page.locator('.chat-header')).toBeVisible();
  const indicator = page.locator('.pc-indicator');
  await expect(indicator).toHaveClass(/online/);
  await expect(indicator).toHaveAttribute('aria-label', 'Computadores: 1 de 2 conectado');
  await noHorizontalScroll(page);
  if (mobile(page)) await headerAction(page, '', 'Computadores'); else await indicator.click();
  const dialog = page.getByRole('dialog', { name: 'Computadores' });
  const cards = dialog.locator('.computer-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText('Conectado');
  await expect(cards.nth(0)).toContainText('User@WINDOWS11 · Windows 11 Pro');
  await expect(cards.nth(1)).toContainText('Desconectado');
  await expect(cards.nth(1)).toContainText('Linux · SSH · cell@192.168.0.50');
  await expect(cards.nth(1)).toContainText('ECONNREFUSED');
  await page.screenshot({ path: `test-results/computadores-${page.viewportSize()!.width}.png` });
  // Nothing connected: the indicator turns gray.
  online = false;
  await dialog.getByRole('button', { name: 'Verificar agora' }).click();
  await expect(indicator).toHaveClass(/offline/);
  await expect(indicator).toHaveAttribute('aria-label', 'Computadores: nenhum conectado (2)');
  await dialog.getByRole('button', { name: 'Gerenciar computadores' }).click();
  await expect(page.locator('.ssh-computers')).toContainText('Computadores conectados');
  await expect(page.getByRole('button', { name: 'Adicionar computador por SSH' })).toBeVisible();
});

test('desfazer alteração e tarefas em segundo plano com saída ao vivo', async ({ page }) => {
  let undone = false, cancelled = false;
  const call = { id: '00000000-0000-0000-0000-00000000ca11', run_id: 'r', tool: 'pc_move', args: { moves: [{ from: 'K:\a.txt', to: 'K:\Docs' }] }, status: 'done', result: '{}', undoable: true };
  await page.route(/\/api\/conversations\/[0-9a-f-]{36}(\?.*)?$/, async route => {
    if (route.request().method() !== 'GET') return route.continue();
    const res = await route.fetch().catch(() => null); if (!res) return; const body = await res.json().catch(() => null); if (!body) return;
    body.calls = [...(body.calls || []), { ...call, undone_at: undone ? new Date().toISOString() : null }];
    return route.fulfill({ response: res, json: body });
  });
  await page.route('**/api/file-ops/*/undo', route => { undone = true; return route.fulfill({ json: { ok: true } }); });
  await page.route('**/api/computer-jobs', route => route.fulfill({ json: [{ id: 'j1', computer_name: 'Computador conectado', agent_name: 'Revisor', command: 'Compress-Archive K:\Fotos', reason: 'Compactar fotos', status: cancelled ? 'cancelled' : 'running', output: 'progresso 1\nprogresso 2', started_at: new Date().toISOString() }] }));
  await page.route('**/api/computer-jobs/j1/cancel', route => { cancelled = true; return route.fulfill({ json: { ok: true } }); });
  await page.route('**/api/computers', route => route.fulfill({ json: { enabled: true, hostInstalled: true, computers: [{ key: 'este-pc', id: 'local', name: 'Computador conectado', kind: 'local', shell: 'powershell', online: true, info: { computer: 'PC', user: 'U', os: 'Windows', uptimeHours: 1, memory: { totalGb: 8, freeGb: 4 }, cpus: 4 } }] } }));
  await openAgents(page);
  await page.locator('.agent-row', { hasText: 'Revisor' }).click();
  const card = page.locator('details.activity-card', { has: page.locator('.tool-item', { hasText: 'Mover no computador' }) });
  await card.locator(':scope > summary').click();
  await card.getByRole('button', { name: 'Desfazer' }).click();
  await page.getByRole('button', { name: 'Desfazer', exact: true }).last().click();
  await expect(card.locator('.tool-status.undone')).toHaveText('Desfeito');
  if (mobile(page)) await headerAction(page, '', 'Computadores'); else await page.locator('.pc-indicator').click();
  const job = page.locator('.job-card');
  await expect(job).toContainText('Compactar fotos');
  await expect(job.locator('.job-output')).toContainText('progresso 2');
  await expect(job.locator('.job-state')).toHaveText('Rodando');
  await job.getByLabel('Cancelar tarefa').click();
  await page.getByRole('button', { name: 'Cancelar tarefa' }).last().click();
  await expect(job.locator('.job-state')).toHaveText('Cancelada');
  await noHorizontalScroll(page);
});

test('alertas, ligar à distância, receitas e prévia da edição na aprovação', async ({ page }) => {
  let woke = false;
  await page.route('**/api/computers', route => route.fulfill({ json: { enabled: true, hostInstalled: true,
    alerts: [{ id: 'a1', computer_key: 'este-pc', computer_name: 'Computador conectado', kind: 'disk:K:', detail: 'K: com 95% usado (5 GB livres de 100 GB)', since: new Date().toISOString() }],
    computers: [
      { key: 'este-pc', id: 'local', name: 'Computador conectado', kind: 'local', shell: 'powershell', online: true, info: { computer: 'PC', user: 'U', os: 'Windows', uptimeHours: 1, memory: { totalGb: 8, freeGb: 4 }, cpus: 4, cpuPct: 12, disks: [{ drive: 'C:', totalGb: 100, freeGb: 60 }, { drive: 'K:', totalGb: 100, freeGb: 5 }] } },
      { key: 'servidor', id: '00000000-0000-0000-0000-0000000000bb', name: 'Servidor', kind: 'ssh', shell: 'bash', host: '192.168.0.50', port: 22, username: 'cell', online: false, error: 'SSH: connect ETIMEDOUT', mac: 'AA:BB:CC:DD:EE:01', lastSeen: null }
    ] } }));
  await page.route('**/api/computers/*/wake', route => { woke = true; return route.fulfill({ json: { sent: true, via: 'Cell Host' } }); });
  await page.route('**/api/recipes', route => route.fulfill({ json: [{ id: 'r1', name: 'Espaço em disco', computer_key: 'este-pc', command: 'Get-PSDrive', trusted: true, background: false }] }));
  await page.route('**/api/recipes/r1/run', route => route.fulfill({ json: { recipe: 'Espaço em disco', computer: 'Computador conectado', ok: true, exitCode: 0, stdout: 'C: 380 GB livres' } }));
  await page.route('**/api/computer-jobs', route => route.fulfill({ json: [] }));
  await page.route(/\/api\/conversations\/[0-9a-f-]{36}(\?.*)?$/, async route => {
    if (route.request().method() !== 'GET') return route.continue();
    const res = await route.fetch().catch(() => null); if (!res) return; const body = await res.json().catch(() => null); if (!body) return;
    body.calls = [...(body.calls || []), { id: 'e1', run_id: 'x', tool: 'pc_edit', args: { path: 'K:\config.ini', edits: [{ find: 'porta=80', replace: 'porta=8080' }] }, status: 'pending', approval_id: '00000000-0000-0000-0000-0000000000e1', approval_status: 'pending', preview: '@@ linha 1\n [servidor]\n-porta=80\n+porta=8080\n modo=dev' }];
    return route.fulfill({ response: res, json: body });
  });
  await page.reload(); await expect(page.locator('.chat-header')).toBeVisible();
  await openAgents(page);
  await page.locator('.agent-row', { hasText: 'Revisor' }).click();
  const card = page.locator('.approval-card', { hasText: 'Editar este arquivo no computador?' });
  await expect(card.locator('.diff-preview .del')).toHaveText('− porta=80\n');
  await expect(card.locator('.diff-preview .add')).toHaveText('+ porta=8080\n');
  await expect(page.locator('.pc-indicator')).toHaveClass(/alert/);
  if (mobile(page)) await headerAction(page, '', 'Computadores'); else await page.locator('.pc-indicator').click();
  const dialog = page.getByRole('dialog', { name: 'Computadores' });
  await expect(dialog.locator('.alert-card')).toContainText('Disco quase cheio em Computador conectado');
  await expect(dialog.locator('.computer-card').first()).toContainText('Discos usados: C: 40% · K: 95%');
  await dialog.locator('.computer-card', { hasText: 'Servidor' }).getByRole('button', { name: 'Ligar' }).click();
  await expect.poll(() => woke).toBe(true);
  await dialog.getByRole('button', { name: /Espaço em disco/ }).click();
  await page.getByRole('button', { name: 'Rodar', exact: true }).click();
  await expect(page.locator('.swal2-popup')).toContainText('C: 380 GB livres');
  await noHorizontalScroll(page);
});

test('menu estreito: menu do agente ao lado dele, não lidas visíveis e atalhos', async ({ page }) => {
  const w = page.viewportSize()!.width;
  test.skip(w < 768, 'no celular a lista é uma gaveta com o menu normal');
  // Redator always has an unread message here (other tests may have read everything).
  await page.route(/\/api\/agents(\?.*)?$/, async route => { if (route.request().method() !== 'GET') return route.continue(); const res = await route.fetch(); const body = await res.json(); return route.fulfill({ response: res, json: body.map((a: any) => a.name === 'Redator' ? { ...a, unread: true } : a) }); });
  await page.reload(); await expect(page.locator('.chat-header')).toBeVisible();
  if (w >= 1200) {
    await page.getByLabel('Recolher menu de agentes').click();
    await expect(page.getByLabel('Pesquisar histórico')).toBeVisible();
    await expect(page.getByLabel('Criar agente')).toBeVisible();
  }
  // Unread dots stay visible on the avatars.
  const dots = page.locator('.agent-row > .unread');
  await expect(page.locator('.agent-row', { hasText: 'Redator' }).locator('.unread')).toBeVisible();
  await expect(dots.first()).toBeVisible();
  // The agent menu opens next to the agent, not in the corner of the screen.
  const row = page.locator('.agent-row', { hasText: 'Redator' });
  const rowBox = (await row.boundingBox())!;
  await row.click({ button: 'right' });
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  const box = (await menu.boundingBox())!;
  expect(Math.abs(box.y - rowBox.y)).toBeLessThan(rowBox.height + 40);
  expect(box.x).toBeGreaterThan(rowBox.x - 260);
  await expect(menu.getByRole('menuitem')).toHaveText(['Fixar no topo', 'Renomear', 'Mover para outra seção']);
  await page.keyboard.press('Escape');
  if (w >= 1200) await page.getByLabel('Expandir menu de agentes').click();
  await noHorizontalScroll(page);
});

test('backup: baixar com a senha da conta e verificar o arquivo', async ({ page }) => {
  const w = page.viewportSize()!.width;
  test.skip(w !== 390 && w !== 1440, 'um tamanho de celular e um de computador bastam');
  await openAgents(page);
  if (tablet(page)) await page.locator('.profile').click(); else await page.getByRole('button', { name: /e2e/ }).click();
  await page.getByRole('menuitem', { name: 'Configurações' }).click();
  await page.getByRole('button', { name: 'Backup', exact: true }).click();
  await page.getByRole('button', { name: 'Fazer backup e baixar' }).click();
  await page.locator('.swal2-input').fill('senha-errada');
  await page.getByRole('button', { name: 'Fazer backup', exact: true }).click();
  await expect(page.getByText('Senha da conta incorreta.')).toBeVisible();
  await page.getByRole('button', { name: 'Fazer backup e baixar' }).click();
  await page.locator('.swal2-input').fill(process.env.E2E_PASSWORD!);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Fazer backup', exact: true }).click();
  const file = await (await download).path();
  expect((await import('node:fs')).readFileSync(file).subarray(0, 12).toString()).toBe('CELLBACKUP1\n');
  await page.getByLabel('Arquivo do backup').setInputFiles({ name: 'cell.cellbackup', mimeType: 'application/octet-stream', buffer: (await import('node:fs')).readFileSync(file) });
  await page.getByLabel('Senha do backup').fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Enviar e verificar' }).click();
  const summary = page.locator('.backup-summary');
  await expect(summary).toContainText('Backup válido');
  await expect(summary.locator('li', { hasText: 'Agentes' })).toContainText(/\d/);
  await expect(summary.getByRole('button', { name: 'Restaurar este backup' })).toBeVisible();
  await noHorizontalScroll(page);
});

test('tabela na mensagem: sem quebrar palavras no meio e rolagem lateral no celular', async ({ page }) => {
  const table = "Amanhã, **quinta 29/10/2026**, estes são os vídeos marcados no banco **canais** do Notion. O calendário do Google e o do Notion estão vazios nesse dia.\n\n### Sai amanhã (horário de Brasília)\n\n| Horário | Vídeo | Canal | Onde | Situação |\n|---|---|---|---|---|\n| **14:00** | \"Olha para os Céus e Conta as Estrelas\" — Gênesis 29 | O caminho da vida em Cristo | YouTube horizontal + Instagram + TikTok | Em andamento. Sem aprovação, edição nem thumbnail |\n| **14:00** | Gênesis 29 (Corte 1) | O caminho da vida em Cristo | Shorts + Instagram | A fazer. Short marcado, ainda sem edição |\n| **16:00** | O Homem de Taured (Short Completo) | Fatos o que é | Shorts + Instagram | **Pronto e aprovado.** Ainda não publicado |\n| **16:00** | Corte 2: O Enigma Revelado — A Verdade Sobre o Homem de Taured | Fatos o que é | Shorts + Instagram | Em andamento. Já tem link de Short (`KPS2wkWABME`), mas não está marcado como publicado |\n\nO horizontal de **O Homem de Taured** já saiu hoje (28/10 às 16:00, [youtu.be/nJIGMWYYcjg](https://youtu.be/nJIGMWYYcjg)). O Short desse vídeo está agendado para amanhã às 16:00.\n\n### O que ainda não está pronto para sair\n\n- **Gênesis 29 (horizontal):** em andamento, sem aprovação, edição ou capa. O Short dele no card principal está para **30/10 às 14:00**, mas o **Corte 1** está para amanhã às 14:00 e ainda está em \"A fazer\".\n- **Corte 2 de Taured:** data de amanhã, status ainda \"Em andamento\", sem aprovação.\n\nO único item com status **Pronto** e aprovado para amanhã é o **Short completo de O Homem de Taured**, às 16:00.";
  // A file list: a long name without spaces must not widen the page, and the sizes stay whole.
  const files = '| Nome | Tamanho | Modificado |\n|---|---|---|\n| `Sabotage_Rap_e_Compromisso_x_Write_This_Down_V2_Grave_Ajustado_Final_Master.mp3` | 12.5 MB | 28/10 14:02 |\n| capa.png | 840 KB | 28/10 13:10 |';
  await page.route(/\/api\/conversations\/[0-9a-f-]{36}(\?.*)?$/, async route => {
    if (route.request().method() !== 'GET') return route.continue();
    const res = await route.fetch().catch(() => null); if (!res) return; const body = await res.json().catch(() => null); if (!body) return;
    body.messages = [...body.messages, { id: 'arq', role: 'assistant', content: files, created_at: new Date(Date.now() - 1000).toISOString(), attachments: [], files: [] }, { id: 'tbl', role: 'assistant', content: table, created_at: new Date().toISOString(), attachments: [], files: [] }];
    return route.fulfill({ response: res, json: body });
  });
  await openAgents(page);
  await page.locator('.agent-row', { hasText: 'Revisor' }).click();
  const t = page.locator('.bubble table').last();
  await expect(t).toBeVisible();
  // Headers stay on one line and no word is split across lines.
  await expect.poll(() => t.evaluate(el => Math.max(...[...el.querySelectorAll('th')].map(th => { const r = document.createRange(); r.selectNodeContents(th); return new Set([...r.getClientRects()].map(x => Math.round(x.top))).size; })))).toBe(1);
  // No ordinary word is split across lines (a token longer than its column, like a file name, may break).
  const broken = await t.evaluate(el => { const out: string[] = []; const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); for (let n = walk.nextNode(); n; n = walk.nextNode()) for (const m of (n.textContent || '').matchAll(/\S+/g)) { if (m[0].length > 14) continue; const r = document.createRange(); r.setStart(n, m.index!); r.setEnd(n, m.index! + m[0].length); if (new Set([...r.getClientRects()].map(x => Math.round(x.top))).size > 1) out.push(m[0]); } return out; });
  expect(broken).toEqual([]);
  const sizes = page.locator('.bubble table').first().locator('td:nth-child(2)');
  await expect.poll(() => sizes.evaluateAll(els => els.map(e => { const r = document.createRange(); r.selectNodeContents(e); return new Set([...r.getClientRects()].map(x => Math.round(x.top))).size; }))).toEqual([1, 1]);
  await expect(sizes.first()).toHaveText('12.5 MB');
  await t.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/tabela-${page.viewportSize()!.width}.png` });
  await noHorizontalScroll(page);
});

test('texto entre ferramentas fica na conversa e toda ferramenta fica em "Ferramentas utilizadas"', async ({ page }) => {
  await page.route(/\/api\/conversations\/[0-9a-f-]{36}(\?.*)?$/, async route => {
    if (route.request().method() !== 'GET') return route.continue();
    const res = await route.fetch().catch(() => null); if (!res) return; const body = await res.json().catch(() => null); if (!body) return;
    const at = (s: number) => new Date(Date.now() - 60000 + s * 1000).toISOString();
    const call = (id: string, run: string, s: number) => ({ id, call_id: id, run_id: run, tool: 'web_search', args: { query: id }, status: 'done', result: '{}', created_at: at(s) });
    body.runs = [...body.runs, { id: 'run-x', state: 'cancelled', created_at: at(0), steps: 1 }, { id: 'run-a', state: 'completed', created_at: at(2), steps: 2, output: 'Pronto.' }];
    body.calls = [...body.calls, call('orfa', 'run-x', 1), call('c1', 'run-a', 3), call('c2', 'run-a', 5)];
    body.messages = [...body.messages,
      { id: 'mid', role: 'assistant', run_id: 'run-a', content: 'Vou pesquisar primeiro.', created_at: at(3), attachments: [], files: [] },
      { id: 'fim', role: 'assistant', run_id: 'run-a', content: 'Pronto.', created_at: at(6), attachments: [], files: [] }];
    return route.fulfill({ response: res, json: body });
  });
  await openAgents(page);
  await page.locator('.agent-row', { hasText: 'Revisor' }).click();
  await expect(page.getByText('Vou pesquisar primeiro.')).toBeVisible();
  await expect(page.getByText('Atividade adicional de ferramentas')).toHaveCount(0);
  await noHorizontalScroll(page);
});

test('cabeçalho no celular: notificações, arquivar e chamada à vista, o resto no menu ⋮', async ({ page }) => {
  test.skip(!mobile(page), 'só no celular');
  const visible = await page.locator('.chat-header .header-actions .icon-btn').evaluateAll(els => els.filter(e => e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== 'hidden').map(e => e.getAttribute('aria-label')));
  expect(visible).toEqual(expect.arrayContaining(['Arquivar conversa', 'Mais opções']));
  expect(visible.some(l => /^Notificações/.test(l || ''))).toBe(true);
  expect(visible.some(l => /Histórico|Central de atividade|Detalhes|Computadores/.test(l || ''))).toBe(false);
  await page.locator('.header-more').click();
  await page.getByRole('menuitem', { name: 'Histórico de conversas' }).click();
  await expect(page.getByRole('menuitem', { name: 'Nova conversa' })).toBeVisible();
  await page.screenshot({ path: `test-results/cabecalho-${page.viewportSize()!.width}.png` });
  await noHorizontalScroll(page);
});

test('modo de aprovação no menu + e botão "Aprovar sempre"', async ({ page }) => {
  await page.getByLabel('Anexar ou ensinar tarefa').click();
  await expect(page.getByRole('menuitemradio')).toHaveCount(3);
  await page.screenshot({ path: `test-results/modo-${page.viewportSize()!.width}.png` });
  await page.getByRole('menuitemradio', { name: /Aprovar tudo menos exclusão/ }).click();
  await expect(page.locator('.composer-note .mode-chip')).toHaveText('Aprova tudo menos exclusão');
  await page.getByLabel('Anexar ou ensinar tarefa').click();
  await page.getByRole('menuitemradio', { name: /YOLO/ }).click();
  await page.getByRole('button', { name: 'Ativar YOLO' }).click();
  await expect(page.locator('.composer-note .mode-chip')).toContainText('YOLO');
  await page.getByLabel('Anexar ou ensinar tarefa').click();
  await page.getByRole('menuitemradio', { name: /Pedir aprovação/ }).click();
  await expect(page.locator('.composer-note .mode-chip')).toHaveCount(0);
  await noHorizontalScroll(page);
  // A pending approval offers "Aprovar sempre" next to approving once.
  await page.route(/\/api\/conversations\/[0-9a-f-]{36}(\?.*)?$/, async route => {
    if (route.request().method() !== 'GET') return route.continue();
    const res = await route.fetch().catch(() => null); if (!res) return; const body = await res.json().catch(() => null); if (!body) return;
    body.calls = [...body.calls, { id: 'ap', call_id: 'ap', run_id: 'run-ap', tool: 'pc_run', args: { command: 'Get-Date', reason: 'Ver a data' }, status: 'pending', target: 'Comando no computador', approval_id: '00000000-0000-0000-0000-0000000000ab', approval_status: 'pending', created_at: new Date().toISOString() }];
    return route.fulfill({ response: res, json: body });
  });
  await openAgents(page);
  await page.locator('.agent-row', { hasText: 'Revisor' }).click();
  // By role on purpose: a dialog opened from a menu used to leave the whole app aria-hidden.
  const always = page.getByRole('button', { name: 'Aprovar sempre' });
  await expect(always).toBeVisible();
  await page.screenshot({ path: `test-results/aprovar-sempre-${page.viewportSize()!.width}.png` });
  await noHorizontalScroll(page);
});
