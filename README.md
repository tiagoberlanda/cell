# Cell

Plataforma auto-hospedada de agentes de IA para um único usuário. Os agentes usam modelos via [9router](http://192.168.0.200:20128) (API compatível com OpenAI) e podem ter memória, skills, ferramentas MCP e rotinas agendadas.

Componentes (Docker Compose):

| Serviço  | Função                                              |
|----------|-----------------------------------------------------|
| `db`     | PostgreSQL 17                                       |
| `api`    | API Fastify (porta interna 3001)                    |
| `worker` | Executa as tarefas dos agentes e as rotinas         |
| `web`    | Caddy: serve a interface e faz HTTPS nas portas 80/443 |

## Instalação

Requisitos: Docker Desktop e PowerShell.

```powershell
.\scripts\setup.ps1 -HostName '192.168.0.200,localhost'
```

O script cria o `.env` com segredos aleatórios (se ainda não existir), sobe os containers e pede a senha inicial da conta `cell`.

`-HostName` aceita vários endereços separados por vírgula: todos os endereços pelos quais o Cell será aberto no navegador (IP da rede, IP do Tailscale, `localhost`). O primeiro é o padrão quando o navegador abre o site pelo IP. Para mudar depois, edite no `.env`:

```ini
CELL_HOST=192.168.0.200, 100.106.241.14, localhost
CELL_DEFAULT_SNI=192.168.0.200
APP_ORIGIN=https://192.168.0.200,https://100.106.241.14,https://localhost
```

e rode `.\scripts\deploy.ps1`. Um endereço que não esteja em `APP_ORIGIN` mostra a página, mas o login responde "Origem não permitida".

## Configurar a senha da conta

Se a conta ainda não existir (por exemplo, quando o `.env` foi criado à mão e os containers foram iniciados com `docker compose up -d --build` em vez do `setup.ps1`), crie-a na pasta do projeto:

```powershell
Write-Host 'Senha: ' -NoNewline; $s = Read-Host -AsSecureString; $env:CELL_ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)); "cell" | docker compose exec -T -e CELL_ADMIN_PASSWORD api npm run admin; Remove-Item Env:CELL_ADMIN_PASSWORD
```

- A senha precisa ter pelo menos 12 caracteres. Ao final aparece **"Conta configurada."**
- `"cell"` é o nome de usuário; troque se quiser outro.
- A senha é passada por variável de ambiente e nunca como argumento, para não ficar no histórico.
- O prompt é escrito com `Write-Host` separado de propósito: com `Read-Host 'Senha'`, o PowerShell interpreta senhas que começam com `!` como comando de prompt e as rejeita.

Para **trocar a senha** de uma conta existente, use o mesmo comando trocando `npm run admin` por `npm run admin -- --reset`. Todas as sessões abertas são encerradas. A senha também pode ser trocada pela interface, em Configurações.

## Primeiro acesso

1. Abra `https://192.168.0.200` (ou outro endereço do `CELL_HOST`) e entre com o usuário e a senha.
2. Em **Configurações**, informe o token do 9router e escolha o modelo padrão.
3. Teste as ferramentas e a visão do modelo pela própria tela de configurações.

## Certificado HTTPS

O Caddy emite um certificado local (`tls internal`). Para os navegadores não mostrarem o aviso de segurança, exporte a CA raiz e instale-a nos dispositivos que vão acessar o Cell:

```powershell
.\scripts\export-cert.ps1
```

Isso gera `cell-root.crt`. No Windows, abra o arquivo → Instalar certificado → Máquina local → "Autoridades de Certificação Raiz Confiáveis". No Android/iOS, instale-o como certificado de CA nas configurações de segurança.

## Acesso pela internet (Cloudflare)

Use um **Cloudflare Tunnel** (`cloudflared`). Assim nenhuma porta do roteador precisa ser aberta: o túnel sai da sua máquina até a Cloudflare.

1. **Não abra as portas 80/443 no roteador.** Todo acesso externo deve passar pelo túnel.
2. No `.env`, acrescente o domínio público aos hosts e às origens permitidas (exemplo com `cell.seudominio.com`):
   ```ini
   CELL_HOST=cell.seudominio.com, 192.168.0.200, localhost
   APP_ORIGIN=https://cell.seudominio.com,https://192.168.0.200,https://localhost
   ```
   e rode `.\scripts\deploy.ps1`. Sem isso, a página abre pelo domínio mas o login responde "Origem não permitida".
3. No túnel (Zero Trust → Networks → Tunnels → Public Hostname), aponte `cell.seudominio.com` para `https://192.168.0.200:443` (ou `https://localhost:443` se o `cloudflared` roda nesta máquina), com:
   - **Origin Server Name**: `cell.seudominio.com`
   - **No TLS Verify**: ativado. O Caddy usa um certificado local (`tls internal`); o trecho Cloudflare → navegador continua com o certificado público da Cloudflare.
4. Em **Speed → Optimization**, desative **Rocket Loader**, em **Scrape Shield** desative **Email Address Obfuscation** e, em **Analytics & Logs → Web Analytics**, desative a injeção automática para este domínio. Todos injetam scripts que a política de segurança (CSP) do Cell bloqueia.
5. Recomendado: proteja o domínio com **Cloudflare Access** (Zero Trust → Access → Applications, política "e-mails permitidos" com código por e-mail). É uma segunda camada de login antes de a página do Cell sequer carregar.

6. Recomendado: faça só o túnel informar o IP real do visitante. Gere um segredo (`node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`), coloque-o no `.env` como `CELL_PROXY_SECRET=...` e, na Cloudflare, crie **Rules → Transform Rules → Modify Request Header** para o hostname do Cell definindo o cabeçalho `X-Cell-Proxy-Secret` com esse valor. Depois rode `.\scripts\deploy.ps1`.

O limite de tentativas de login (10 a cada 15 minutos) é contado por IP real do visitante. Com `CELL_PROXY_SECRET`, o `CF-Connecting-IP` só é aceito em requisições que trazem o segredo, então nem a internet nem a rede local conseguem falsificá-lo. Sem ele, o cabeçalho é aceito de redes privadas (ou só dos endereços em `TRUSTED_PROXIES`, lista de CIDRs); no Docker Desktop toda a rede local chega pelo mesmo gateway, por isso o segredo é a opção segura. O estado atual aparece em Configurações → Diagnóstico.

## Instalar no Android (PWA)

Pelo domínio público da Cloudflare o certificado já é válido, então basta abrir `https://cell.seudominio.com` no Chrome do Android, entrar e usar **menu ⋮ → Instalar app** (ou "Adicionar à tela inicial").

Pela rede local (`https://192.168.0.200`), o Android só permite instalar depois de confiar no certificado local: exporte-o com `.\scripts\export-cert.ps1` e instale `cell-root.crt` em Configurações → Segurança → Criptografia e credenciais → Instalar certificado → Certificado de CA.

Se perder o celular: Configurações → Conta → **Sair de todos os outros dispositivos**, e troque a senha.

### Notificações no celular

Em cada aparelho: menu do usuário → **Notificações** → **Ativar notificações neste aparelho**, aceite a permissão e toque em **Enviar teste**. O aparelho passa a avisar quando um agente ou uma rotina enviar mensagem e quando uma ação precisar da sua aprovação; tocar no aviso abre a conversa. Se a conversa estiver aberta em algum aparelho, o aviso não é enviado (o Cell espera 10 segundos e só notifica o que ainda não foi lido).

- Funciona no Chrome do Android, no navegador ou no app instalado, pelo domínio público (o HTTPS precisa ser confiável). No iPhone, só com o Cell instalado na tela inicial.
- O conteúdo vai cifrado de ponta a ponta até o aparelho (padrão Web Push); o serviço de push do navegador (Google, no Chrome) só repassa.
- Sair da conta desativa as notificações daquele aparelho. A lista de aparelhos inscritos fica na mesma tela, com a opção de remover.
- No computador funciona igual (Chrome ou Edge): ative em Notificações no próprio PC. Os avisos aparecem na central de notificações do Windows.
- **Por agente:** no painel do agente, o botão **Notificações ativadas/desativadas** (ou "Receber notificações deste agente" no editor) liga ou silencia aquele agente em tudo: push, avisos no app e sino. Agentes silenciados mostram um sino cortado na lista.
- **Dentro do app:** o sino do cabeçalho lista mensagens não lidas e aprovações pendentes (com "Marcar como lidas"); mensagens de outras conversas aparecem num aviso com **Abrir**; a aba do navegador e o ícone do app instalado mostram a contagem.
- Uma conversa só conta como lida com a tela visível: deixar o Cell aberto numa aba em segundo plano não impede o aviso.

## Backup e restauração

```powershell
.\scripts\backup.ps1                       # cria backups/AAAAMMDD-HHmmss
.\scripts\restore.ps1 -Backup .\backups\20261026-120000
```

O backup para a API, o worker e a web por alguns segundos, exporta o banco e os arquivos (com as contagens de registros no `manifest.json`) e depois os reinicia. Guarde o `.env` separadamente: a restauração exige a mesma `SECRET_KEY`, pois os tokens e as credenciais são criptografados com ela.

**Verifique cada backup** antes de confiar nele:

```powershell
npm run backup:verify -- backups\20261026-120000
```

O comando restaura o backup num PostgreSQL temporário e isolado (com os mesmos parâmetros do `restore.ps1`), confere as migrações, compara as contagens com o manifesto e checa se todo arquivo citado no banco está na pasta `files/`. Nada de produção é tocado; o container temporário é removido no fim. Sai com código 0 e `"ok": true` quando o backup está íntegro.

## Mensagens de voz

Com o campo de mensagem vazio, toque no microfone para gravar (até 5 minutos) e toque em enviar. O áudio é transcrito pelo 9router e a transcrição vira a mensagem; o áudio fica anexado.

- **Responder com áudio:** marque "Responder com áudio quando eu enviar áudio" no cadastro do agente. Desmarcado, ele sempre responde em texto.
- **Modelos:** em Configurações → 9router, escolha o modelo de transcrição e, se tiver, o de síntese e a voz ("Testar voz" toca um exemplo). Sem modelo de síntese, o próprio aparelho lê a resposta em português.
- Gravar exige HTTPS confiável (domínio público ou certificado instalado) e permissão do microfone.
- **Voz por agente:** no cadastro do agente, "Voz deste agente" escolhe outro modelo de voz ou outra voz; vazio usa o padrão. A "Voz do aparelho" (Configurações → 9router) escolhe a voz do próprio celular ou computador e vale só para ele.

### Chamada de voz

Toque no telefone no topo da conversa. Fale normalmente: ao fazer uma pausa de pouco mais de um segundo, o Cell envia o trecho, a célula mostra o agente pensando e ele responde falando; depois volta a ouvir. Na chamada o agente sempre responde em voz. Use os botões para desligar o microfone, enviar na hora, interromper a resposta ou encerrar. Use fones de ouvido em lugares com barulho.

## Aplicativos (MCP com um clique)

Menu do usuário → **Conectar aplicativos**.

- **Um clique:** Notion, Todoist, Linear, Jira/Confluence, ClickUp, monday.com, Airtable, Miro, Zapier, Stripe, PayPal, Wix, Webflow, Supabase, Sentry, Cloudflare e Hugging Face. Toque em **Conectar**, autorize no próprio serviço e volte ao Cell; as ferramentas ficam disponíveis para todos os agentes. Ferramentas de leitura (anotadas como somente leitura pelo servidor, ou com nomes como `search`, `list`, `get`) rodam direto; as demais sempre pedem sua aprovação. Em **⋯ → Ferramentas e permissões** dá para ajustar quais são confiáveis para leitura.
- **Google (Gmail, Drive, Agenda e Tarefas):** o Google exige um cliente OAuth próprio, criado uma vez. Em **Google → Como configurar**, o Cell mostra o comando para ativar as APIs, o URI de redirecionamento exato para cadastrar (`https://<seu domínio>/api/connections/oauth/callback`) e os campos para Client ID e Client Secret (guardado cifrado). Depois, cada serviço conecta com um clique. Gmail, Drive e Agenda usam os servidores MCP oficiais do Google (em prévia); o Google Tarefas é integrado diretamente (listar, criar, concluir e excluir tarefas, com renovação automática do acesso).
- O retorno da autorização usa sempre o primeiro endereço de `APP_ORIGIN` (o domínio público). Ele funciona mesmo que você tenha iniciado a conexão pela rede local.
- **Canva:** o Canva só devolve a autorização para um endereço local. Depois de autorizar, abre uma página que não carrega (`http://127.0.0.1:53682/...`); copie o endereço dela e cole no Cell para concluir.
- Outros servidores MCP continuam em **Conexões MCP personalizadas (avançado)**.

## Acompanhamento e diagnóstico

- **Central de atividade** (ícone de atividade no cabeçalho ou menu do usuário): todas as execuções de todos os agentes, com filtros por estado e agente, resumo do que está trabalhando, na fila, aguardando aprovação ou com falha. Cada execução mostra modelo, duração, tokens, ferramentas, documentos usados, arquivos e a árvore de delegações, com os botões de aprovar, negar e cancelar.
- **Diagnóstico** (Configurações → Diagnóstico): saúde do worker (sinal a cada 10 s), banco, fila, execuções paradas (sem sinal há mais de 2 minutos), 9router, conexões MCP e a confiança no IP do proxy. Nenhum segredo é exibido.
- **Memória e resumo** (painel do agente → "Ver e editar memória e resumo"): edite a memória do agente e o resumo da conversa; cada versão fica no histórico com a origem (usuário, editor do agente ou resumo automático).
- **Modo `/plan`**: a execução fica marcada como plano e o servidor só libera ferramentas de pesquisa e leitura, mesmo que o modelo tente outras.

## Versionamento

O Cell segue o [Versionamento Semântico](https://semver.org/lang/pt-BR/) (`MAJOR.MINOR.PATCH`). A versão vive no `package.json` da raiz e aparece no menu do usuário (canto inferior esquerdo), em `GET /api/health` e nas tags das imagens Docker. As mudanças ficam no [CHANGELOG.md](CHANGELOG.md).

Fluxo de uma nova versão:

1. Durante o desenvolvimento, descreva cada mudança em `## [Não lançado]` no `CHANGELOG.md`.
2. Com tudo commitado, gere a versão:
   ```powershell
   npm run release -- patch   # correções       0.2.0 → 0.2.1
   npm run release -- minor   # funcionalidades 0.2.0 → 0.3.0
   npm run release -- major   # incompatível    0.2.0 → 1.0.0
   ```
   O script atualiza os `package.json` e o lockfile, dá data à seção do CHANGELOG, faz o commit `release: vX.Y.Z` e cria a tag `vX.Y.Z`.
3. Publique no Docker:
   ```powershell
   .\scripts\deploy.ps1
   ```
   Gera as imagens `cell-server:X.Y.Z` e `cell-web:X.Y.Z` e reinicia os containers. Para voltar a uma versão anterior: `git checkout vX.Y.Z` e rode o `deploy.ps1` de novo. As migrações do banco só avançam, então faça um backup antes de atualizar.

## Desenvolvimento

```powershell
npm install
npm run check   # TypeScript da raiz e da web
npm run build   # build da interface
npm run dev     # Vite em http://127.0.0.1:5173 (proxy /api → 127.0.0.1:3101)
```

Diálogos da interface: use sempre os helpers de `apps/web/src/dialogs.ts` (SweetAlert2 / `Swal.fire`). Nunca use `alert`, `confirm` ou `prompt` nativos.

Testes de navegador: `npm run test:e2e` sobe uma pilha isolada (PostgreSQL temporário, API e build da interface com agentes em todos os estados) e roda o Playwright no Google Chrome instalado em 360, 390, 768, 1024 e 1440 px. Capturas ficam em `test-results/`.

Testes de integração (`npm run test:db` sobe um PostgreSQL temporário no Docker, roda tudo e remove o container; para usar um banco próprio, ele precisa terminar em `_test`):

```powershell
$env:TEST_DATABASE_URL = 'postgres://cell:cell-test-only@127.0.0.1:55439/cell_test'; npm test
```
