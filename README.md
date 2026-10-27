# Cell

**Cell** é uma plataforma de agentes de IA que roda no seu próprio computador. Você monta uma equipe de agentes (cada um com cargo, instruções, memória e ferramentas), conversa com eles pelo navegador ou pelo celular, e eles pesquisam na web, geram imagens, planilhas, PDFs e apresentações, organizam pastas do seu computador, usam aplicativos como Notion e Google Agenda, delegam tarefas entre si e trabalham em rotinas agendadas. Toda ação que muda algo fora do Cell pede a sua aprovação.

É feito para **um único usuário** (você) e fica **inteiramente sob seu controle**: os dados, as conversas e os arquivos ficam num banco PostgreSQL e numa pasta na sua máquina.

---

## Sumário

1. [O que o Cell faz](#o-que-o-cell-faz)
2. [Como funciona por dentro](#como-funciona-por-dentro)
3. [Antes de começar](#antes-de-começar)
4. [Instalação passo a passo](#instalação-passo-a-passo)
5. [Primeiro uso](#primeiro-uso)
6. [Ferramentas dos agentes](#ferramentas-dos-agentes)
7. [Usando o Cell no dia a dia](#usando-o-cell-no-dia-a-dia)
8. [Acesso por outros aparelhos e pela internet](#acesso-por-outros-aparelhos-e-pela-internet)
9. [Manutenção: backup, atualização e senha](#manutenção-backup-atualização-e-senha)
10. [Solução de problemas](#solução-de-problemas)
11. [Configuração avançada (.env)](#configuração-avançada-env)
12. [Desenvolvimento](#desenvolvimento)

---

## O que o Cell faz

- **Equipe de agentes:** crie quantos quiser, cada um com nome, cargo, descrição, instruções, memória, modelo de IA, ferramentas, cor e um ícone de célula. O **Coordenador** é o agente principal: organiza a equipe e pode criar e excluir agentes.
- **Conversas** com anexos (PDF, Word, Excel, imagens, textos), histórico, arquivamento e busca.
- **Ferramentas:** pesquisa na web, leitura de páginas, geração de imagens, **planilhas Excel/CSV, PDF, Word e PowerPoint**, pastas e **comandos no computador**, delegação entre agentes, rotinas e mais de 20 aplicativos (Notion, Google, Todoist…).
- **Aprovações:** o agente para e pergunta antes de qualquer ação que altere algo fora do Cell.
- **Rotinas:** tarefas agendadas (todo dia, toda semana, uma vez ou cron).
- **Voz:** envie áudios, receba respostas faladas e faça **chamadas de voz** com o agente.
- **Notificações** no celular e no computador.
- **App no celular** (PWA) para Android e iPhone.

## Como funciona por dentro

O Cell roda em quatro containers Docker:

| Serviço  | O que faz |
|----------|-----------|
| `db`     | Banco PostgreSQL: agentes, conversas, configurações (segredos ficam cifrados). |
| `api`    | Servidor da aplicação (Fastify). É o único serviço exposto pela interface web. |
| `worker` | Executa as tarefas dos agentes, as ferramentas e as rotinas. |
| `web`    | Caddy: entrega a interface e faz o HTTPS nas portas 80 e 443. |

Os modelos de IA **não** rodam dentro do Cell. Ele conversa com um provedor compatível com a API da OpenAI, chamado neste projeto de **9router** (veja a seguir).

## Antes de começar

Você vai precisar de:

| Item | Para quê | Como obter |
|------|----------|------------|
| **Windows 10 ou 11** | Os scripts são em PowerShell. | Linux e macOS funcionam com [PowerShell 7](https://learn.microsoft.com/powershell/scripting/install/installing-powershell) e Docker, exceto o script de pastas do computador, que é só para Windows. |
| **Docker Desktop** | Roda os containers. | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/). Deixe-o aberto. |
| **Git** | Baixar o projeto. | [git-scm.com](https://git-scm.com/download/win) |
| **Um provedor de modelos** | É quem responde (a "inteligência"). | Veja abaixo. |
| Node.js 24 (opcional) | Só para rodar testes e verificar backups. | [nodejs.org](https://nodejs.org/) |

### O provedor de modelos (9router)

O Cell fala com qualquer serviço **compatível com a API da OpenAI** (`/v1/chat/completions`). Ele foi feito para o **9router**, um roteador que reúne vários modelos e provedores num endereço só. O que cada recurso usa:

| Recurso | Rota usada | Funciona com |
|---------|-----------|--------------|
| Conversa e ferramentas | `/chat/completions` | Qualquer provedor compatível (9router, OpenAI, OpenRouter, Ollama, LM Studio…) |
| Gerar imagem | `/images/generations` | 9router, OpenAI e compatíveis |
| Transcrever áudio | `/audio/transcriptions` | 9router, OpenAI e compatíveis |
| Resposta em voz | `/audio/speech` | 9router, OpenAI e compatíveis. Sem modelo de voz, o próprio aparelho lê a resposta. |
| Pesquisa na web e leitura de páginas | `/search`, `/web/fetch` | Só 9router. Com outro provedor, conecte um aplicativo de pesquisa (MCP). |

Você vai precisar do **endereço** (ex.: `http://192.168.0.200:20128/v1` ou `https://api.openai.com/v1`) e do **token** (chave de API) do seu provedor.

## Instalação passo a passo

### 1. Baixe o projeto

Abra o **PowerShell** e rode:

```powershell
git clone https://github.com/tiagoberlanda/cell.git
cd cell
```

### 2. Descubra o endereço do computador na rede

Para abrir o Cell de outros aparelhos (celular, notebook), você precisa do IP deste computador:

```powershell
ipconfig
```

Procure "Endereço IPv4" (algo como `192.168.0.10`). Se for usar só neste computador, pode pular e usar `localhost`.

### 3. Rode a instalação

Troque `192.168.0.10` pelo seu IP:

```powershell
.\scripts\setup.ps1 -HostName '192.168.0.10,localhost'
```

O script:

1. cria o arquivo `.env` com senhas e chaves aleatórias;
2. monta e sobe os containers (a primeira vez leva alguns minutos);
3. pede a **senha da sua conta** (mínimo de 12 caracteres). O usuário é `cell`.

Ao final aparece **"Cell pronto em https://…"**.

> Se o PowerShell disser que a execução de scripts está desabilitada, rode antes `Set-ExecutionPolicy -Scope Process Bypass` (vale só para essa janela).

### 4. Abra no navegador

Acesse `https://localhost` (ou `https://SEU-IP`). O navegador vai mostrar um **aviso de segurança**. Isso é esperado: o Cell usa um certificado próprio, emitido na sua máquina. Você pode clicar em "Avançado → Continuar" ou, melhor, [instalar o certificado](#certificado-https-sem-aviso-do-navegador) para o aviso sumir de vez.

Entre com o usuário **`cell`** e a senha que você criou.

## Primeiro uso

1. **Configure o provedor:** menu do usuário (canto inferior esquerdo) → **Configurações** → **9router**:
   - **Endereço** do provedor (ex.: `http://192.168.0.200:20128/v1`) e **Token** (chave de API);
   - clique em **Testar conexão e atualizar modelos** para confirmar o acesso e carregar a lista;
   - escolha o **Modelo padrão** e salve. A tela mostra se o modelo sabe usar ferramentas e ver imagens;
   - opcional: modelos de imagem, de transcrição e de voz.
2. **Converse com o Coordenador:** ele já vem criado, junto com Pesquisador, Redator e Revisor. Experimente:
   - *"Pesquise as novidades sobre carros elétricos no Brasil e faça um PDF de uma página."*
   - *"Monte uma planilha com meus gastos: aluguel 1500, mercado 800, transporte 300, com o total."*
   - *"Crie uma apresentação de 5 slides sobre o plano de marketing do próximo trimestre."*
3. **Crie seus agentes:** botão **+** na lista, ou peça ao Coordenador: *"crie um agente Analista Financeiro que acompanha meus investimentos"*.

---

## Ferramentas dos agentes

As ferramentas são o que o agente consegue **fazer** além de responder. Ele decide sozinho quando usar cada uma. Ferramentas que **mudam algo fora do Cell** param e pedem sua aprovação na conversa (botões **Aprovar** e **Negar**).

### Pesquisa e conteúdo

| Ferramenta | O que faz | Pede aprovação? |
|-----------|-----------|:---:|
| `web_search` | Pesquisa na web e traz as fontes. | Não |
| `web_fetch` | Lê o conteúdo de uma página pública (sem seguir instruções escondidas nela). | Não |
| `generate_image` | Gera uma imagem a partir de uma descrição e salva na biblioteca. Atalho: `/imagem <descrição>`. | Não |

### Documentos e arquivos (sempre disponíveis para todos os agentes)

| Ferramenta | O que faz | Pede aprovação? |
|-----------|-----------|:---:|
| `create_spreadsheet` | **Excel (.xlsx)** com várias abas, cabeçalho destacado, filtros e **fórmulas** (`=B2*C2`), ou **CSV** (com `;` por padrão, abre direto no Excel em português, acentos preservados). | Não |
| `create_pdf` | **PDF** (A4, páginas numeradas) com títulos, parágrafos, listas, tabelas, negrito e itálico. `---` começa uma nova página. | Não |
| `create_docx` | **Word (.docx)** com os mesmos recursos do PDF, para você editar depois. | Não |
| `create_presentation` | **PowerPoint (.pptx, 16:9)**: capa, um slide por tópico, subtópicos, tabelas, imagens da biblioteca (por exemplo, geradas com `generate_image`) e anotações do apresentador, na cor que você escolher. | Não |
| `write_file` | Arquivo de texto simples (txt, md, csv, json). | Não |
| `list_files` / `read_file` | Lista e lê os arquivos da biblioteca (inclusive o texto de PDFs, Word e planilhas que você anexou). | Não |

Os arquivos gerados aparecem **anexados à resposta** do agente (toque para baixar) e ficam na **Biblioteca** (painel do agente → Biblioteca).

### Equipe e organização

| Ferramenta | O que faz | Pede aprovação? |
|-----------|-----------|:---:|
| `list_agents` | Lista os agentes da equipe. | Não |
| `delegate` | Passa uma tarefa para outro agente e espera o resultado (aparece na árvore da execução). | Não |
| `propose_routine` | Propõe uma rotina agendada. Ela só começa quando você clica em **Ativar rotina**. | Ativação manual |
| `create_agent` | Cria um agente (só o **Coordenador**). | Não |
| `delete_agent` | Exclui um agente (só o **Coordenador**). | **Sim** |

### Pastas do computador ([como ativar](#pastas-do-computador))

| Ferramenta | O que faz | Pede aprovação? |
|-----------|-----------|:---:|
| `pc_request_access` | Pede acesso a uma pasta (ex.: `K:\Downloads`). Ao aprovar, a pasta fica liberada para aquele agente. | **Sim** |
| `pc_list` / `pc_read` | Lista e lê arquivos das pastas liberadas. | Não |
| `pc_move` | Move arquivos e pastas, vários de uma vez (uma aprovação para a lista toda). Nunca sobrescreve. | **Sim** |
| `pc_rename` / `pc_mkdir` | Renomeia e cria pastas. | **Sim** |
| `pc_write` | Cria um arquivo de texto (substituir um existente aparece na aprovação). | **Sim** |
| `pc_delete` | Exclui arquivos e pastas, vários de uma vez. **Definitivo** (não vai para a Lixeira). | **Sim** |

### Comandos no computador ([como ativar](#comandos-no-computador))

| Ferramenta | O que faz | Pede aprovação? |
|-----------|-----------|:---:|
| `pc_run` | Roda um comando num computador conectado: PowerShell neste PC e nos Windows por SSH, bash nos Linux. Mostra o computador e o script antes. | **Sim, sempre** |
| `pc_status` | Mostra quais computadores estão conectados, com nome, usuário, sistema, tempo ligado e memória. | Não |

### Aplicativos ([como conectar](#aplicativos-notion-google-e-outros))

Cada aplicativo conectado traz suas próprias ferramentas (ex.: buscar páginas no Notion, criar evento na Agenda). Elas são carregadas **só quando o pedido precisa do aplicativo**: o agente vê uma lista curta dos aplicativos e abre um deles (ferramenta `use_app`) antes de usá-lo, o que deixa as respostas mais rápidas e baratas. As de **leitura** rodam direto; as que **criam, alteram ou apagam** pedem aprovação. O **Google Tarefas** vem integrado: listar listas e tarefas, criar, concluir e excluir.

### Ligar e desligar ferramentas por agente

Editar agente → aba **Ferramentas**. As ferramentas de documentos e as de pastas do computador valem para todos os agentes.

### Modo planejamento (`/plan`)

Comece a mensagem com `/plan` (ex.: `/plan lançar a loja online`). Nesse modo o servidor **só libera ferramentas de leitura e pesquisa**: o agente investiga e entrega um plano, sem criar arquivos nem executar ações.

---

## Usando o Cell no dia a dia

### Agentes

- **Criar:** botão **+** na lista de agentes.
- **Editar:** painel do agente (ícone à direita no topo) → **Editar agente**. Abas: perfil (nome, cargo, descrição, seção, modelo), célula e cor, memória e instruções, ferramentas.
- **Menu rápido:** no **celular**, segure e solte sobre o agente; no **computador**, use os **três pontos** (ou o clique direito). Opções: **fixar no topo** (até 3 agentes), **renomear** e **mover para outra seção**.
- **Reordenar:** segure e arraste agentes e seções.
- **Seções:** agrupe agentes (ex.: "Equipe", "Pessoal"). Crie em **Nova seção**.

### Conversas

- **Anexos:** botão **+** → Anexar arquivos (até 25 MB cada): txt, md, csv, json, pdf, docx, xlsx, png, jpg, webp. O agente lê o texto de PDFs, Word e planilhas.
- **Comandos** (digite `/` no campo de mensagem):

  | Comando | O que faz |
  |---------|-----------|
  | `/new` | Nova conversa com o agente. |
  | `/clean` | Arquiva a conversa atual e começa outra. |
  | `/plan <objetivo>` | Modo planejamento (só leitura e pesquisa). |
  | `/imagem <descrição>` | Gera uma imagem. |
  | `/search` | Busca nas mensagens. |
  | `/settings` | Abre as configurações. |
  | `/help` | Lista os comandos. |

- **Histórico:** ícone de relógio no topo mostra as conversas anteriores; o de caixa arquiva a atual.
- **Ensinar uma tarefa:** botão **+** → *Ensinar uma tarefa* transforma a conversa numa **habilidade** reutilizável, que você liga aos agentes.

### Memória e resumo

Cada agente tem uma **memória** (preferências e fatos que você quer que ele lembre) e cada conversa longa ganha um **resumo** automático. Painel do agente → *Ver e editar memória e resumo*. Todas as versões ficam no histórico.

### Rotinas

Painel do agente → **Rotinas** → *Nova rotina*: o agente recebe a tarefa no horário marcado (diária, semanal, uma vez ou expressão cron) e responde na conversa. O interruptor liga e desliga; a lixeira exclui; *Executar agora* testa na hora; *Histórico* mostra as execuções. O fuso padrão é `America/Sao_Paulo`.

### Aprovações

Quando o agente quer fazer algo que precisa de permissão, a conversa mostra o pedido em linguagem simples, com **Aprovar** e **Negar**. O sino do topo lista as aprovações pendentes, e o celular recebe um aviso. Se os parâmetros mudarem depois da aprovação, a ação é bloqueada.

### Notificações

Em cada aparelho: menu do usuário → **Notificações** → *Ativar notificações neste aparelho* → *Enviar teste*. Você é avisado quando um agente ou rotina responde e quando há aprovação pendente; tocar no aviso abre a conversa. Para silenciar um agente: painel do agente → *Notificações ativadas/desativadas*.

- Precisa de HTTPS confiável (domínio público ou [certificado instalado](#certificado-https-sem-aviso-do-navegador)). No iPhone, só com o app instalado na tela inicial.
- Se a conversa já estiver aberta e visível em algum aparelho, o aviso não é enviado.

### Voz

- **Mensagem de voz:** com o campo vazio, toque no **microfone**, fale (até 5 minutos) e envie. O áudio é transcrito e vira a mensagem.
- **Resposta em áudio:** no cadastro do agente, marque *Responder com áudio quando eu enviar áudio*.
- **Chamada de voz:** toque no **telefone** no topo da conversa. Fale normalmente; ao fazer uma pausa, o agente pensa (a célula se anima) e responde falando, depois volta a ouvir. Botões: desligar microfone, enviar na hora, interromper e encerrar.
- **Vozes:** Configurações → 9router: modelo de transcrição, modelo e voz de resposta (*Testar voz*) e a voz do próprio aparelho. Cada agente pode ter sua voz (*Voz deste agente*).

### Pastas do computador

Os agentes podem organizar arquivos do computador onde o Cell roda. Ative uma vez (e de novo se adicionar um disco):

```powershell
.\scripts\drives.ps1
.\scripts\deploy.ps1
```

O script libera os discos locais para o `worker` (do `C:` só a sua pasta de usuário) no arquivo `compose.override.yaml`, que fica só na sua máquina. Para desligar: `.\scripts\drives.ps1 -Remove` e depois `.\scripts\deploy.ps1`.

Depois peça, por exemplo: *"organize a pasta K:\Downloads por tipo de arquivo"*. O agente pede acesso, você aprova, e ele lista, propõe a reorganização e pede aprovação antes de mover, criar ou **excluir** (a exclusão é definitiva). Arquivos ocultos e de sistema (como `.env`) ficam bloqueados. Veja e remova acessos em **Configurações → Computador**.

### Comandos no computador

O ícone de **computador no topo da conversa** mostra se há computadores conectados: **verde** se pelo menos um responde, **cinza** se nenhum. Toque nele para ver cada computador, o estado e os detalhes.

Com o **Cell Host** instalado, você pode pedir (inclusive pelo celular) coisas como *"quanto espaço livre tem no disco K:?"*, *"quais programas estão usando mais memória?"* ou *"compacte a pasta K:\Projetos\site num zip"*. O agente monta o comando PowerShell e **você aprova cada um**, vendo exatamente o que será executado.

Instale **uma vez, no próprio computador** (PowerShell, na pasta do Cell; precisa do [Node.js](https://nodejs.org/) 22 ou mais novo):

```powershell
.\scripts\host.ps1
.\scripts\deploy.ps1
```

O que o instalador faz:

- cria uma **tarefa agendada** que liga o Cell Host quando você entra no Windows, com um **ícone na bandeja** (perto do relógio): colorido quando está rodando, cinza quando parado. Clique com o botão direito para **Iniciar**, **Parar**, **Abrir o Cell**, **Ver registro** ou **Fechar**. Depois de fechar, abra de novo pelo atalho **Cell Host** no menu Iniciar;
- roda com o **seu usuário, sem administrador**; comandos que exigem administrador falham;
- escuta **só em `127.0.0.1`**, sem nenhuma porta aberta para a rede ou a internet, com um token gerado na instalação (guardado em `%LOCALAPPDATA%\Cell\host.json` e no `.env`).

Como funciona no dia a dia:

- só funciona com o computador **ligado e com você logado**;
- o registro do Cell Host fica em `%LOCALAPPDATA%\Cell\host.log`;
- em **Configurações → Computador** você vê o estado, bloqueia ou libera os comandos num toque e confere os últimos comandos com o resultado.

Para remover: `.\scripts\host.ps1 -Remove` e depois `.\scripts\deploy.ps1`.

**Outros computadores (SSH).** Os agentes também podem usar máquinas Linux (bash) ou Windows com OpenSSH (PowerShell). Em **Configurações → Computador → Adicionar computador por SSH**:

1. informe nome, endereço, porta, usuário e a senha ou uma chave privada (prefira um usuário sem administrador e uma chave criada só para o Cell);
2. o Cell conecta e mostra a **impressão digital** da chave do servidor; confira no servidor (`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`) e confirme.

A senha ou a chave fica cifrada. Se a chave do servidor mudar, o Cell recusa a conexão. Com mais de um computador, o agente escolhe em qual rodar, e a aprovação mostra o computador.

> **Segurança:** isso dá ao Cell um terminal no seu computador. Toda execução depende da sua aprovação, mas **proteja o acesso ao Cell**: senha forte e, se usar acesso pela internet, o **Cloudflare Access** (passo 5 do [acesso pela internet](#acesso-pela-internet-cloudflare-tunnel)). Desconfie de comandos que você não pediu, por exemplo sugeridos depois de o agente ler uma página da web.

### Aplicativos (Notion, Google e outros)

Menu do usuário → **Conectar aplicativos**.

- **Um clique:** Notion, Todoist, Linear, Jira/Confluence, ClickUp, monday.com, Airtable, Miro, Zapier, Stripe, PayPal, Wix, Webflow, Supabase, Sentry, Cloudflare e Hugging Face. Toque em **Conectar**, autorize no próprio serviço e volte.
- **Canva:** o Canva só devolve a autorização para um endereço local. Depois de autorizar, abre uma página que não carrega (`http://127.0.0.1:53682/...`); copie o endereço dela e cole no Cell.
- **Google (Gmail, Drive, Agenda, Tarefas):** o Google exige um cliente OAuth seu, criado uma vez no Google Cloud. Em **Google → Como configurar**, o Cell mostra o passo a passo, o comando para ativar as APIs e o endereço de retorno exato para cadastrar. Depois, cada serviço conecta com um clique.
- **Permissões:** em **⋯ → Ferramentas e permissões** você escolhe quais ferramentas de cada aplicativo rodam sem aprovação.
- Outros servidores MCP: **Conexões MCP personalizadas (avançado)**.

> O retorno da autorização usa o primeiro endereço de `APP_ORIGIN`. Para conectar aplicativos de fora da sua rede, configure o [acesso pela internet](#acesso-pela-internet-cloudflare-tunnel).

### Acompanhar o que os agentes estão fazendo

- **Central de atividade** (ícone de atividade no topo): todas as execuções, com filtros, modelo, tempo, tokens, ferramentas usadas, arquivos, árvore de delegações e botões para aprovar, negar e cancelar.
- **Janela de contexto** (painel do agente): quanto da memória de trabalho do modelo a última execução usou. O limite (padrão de 16 mil tokens) fica em Configurações → Execução.
- **Diagnóstico** (Configurações → Diagnóstico): saúde do worker, banco, fila, provedor, conexões e aplicativos, sem mostrar segredos.

---

## Acesso por outros aparelhos e pela internet

### Pela rede de casa

Abra `https://SEU-IP` em qualquer aparelho da mesma rede. O endereço precisa estar no `-HostName` usado no setup (ou em `CELL_HOST` e `APP_ORIGIN` no `.env`; depois rode `.\scripts\deploy.ps1`).

### Certificado HTTPS sem aviso do navegador

```powershell
.\scripts\export-cert.ps1
```

Isso gera `cell-root.crt`. Instale-o em cada aparelho:

- **Windows:** abra o arquivo → *Instalar certificado* → *Máquina local* → *Autoridades de Certificação Raiz Confiáveis*.
- **Android:** Configurações → Segurança → Criptografia e credenciais → Instalar certificado → *Certificado de CA*.
- **iPhone:** abra o arquivo, instale o perfil e ative em Ajustes → Geral → Sobre → *Ajustes de Confiança de Certificado*.

### App no celular (PWA)

Abra o Cell no Chrome do Android (ou Safari do iPhone) e use **⋮ → Instalar app** (ou *Compartilhar → Adicionar à Tela de Início*). Pela rede local, instale o certificado antes. Pelo domínio público, funciona direto.

Se perder o celular: Configurações → Conta → *Sair de todos os outros dispositivos* e troque a senha.

### Acesso pela internet (Cloudflare Tunnel)

Com um **Cloudflare Tunnel** você acessa o Cell de qualquer lugar **sem abrir portas no roteador**.

1. **Não abra as portas 80/443 no roteador.**
2. No `.env`, inclua o domínio (exemplo `cell.seudominio.com`) e rode `.\scripts\deploy.ps1`:
   ```ini
   CELL_HOST=cell.seudominio.com, 192.168.0.10, localhost
   APP_ORIGIN=https://cell.seudominio.com,https://192.168.0.10,https://localhost
   ```
3. Na Cloudflare (Zero Trust → Networks → Tunnels → Public Hostname), aponte `cell.seudominio.com` para `https://localhost:443`, com **Origin Server Name** `cell.seudominio.com` e **No TLS Verify** ativado.
4. Desative **Rocket Loader**, **Email Address Obfuscation** e a injeção do **Web Analytics** para esse domínio (eles injetam scripts que a política de segurança do Cell bloqueia).
5. Recomendado: proteja o domínio com **Cloudflare Access** (login extra por e-mail antes da página carregar).
6. Recomendado: para o limite de tentativas de login usar o IP real do visitante, gere um segredo (`node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`), coloque no `.env` como `CELL_PROXY_SECRET=...` e crie na Cloudflare uma **Transform Rule → Modify Request Header** que envie `X-Cell-Proxy-Secret` com esse valor. Rode `.\scripts\deploy.ps1`.

---

## Manutenção: backup, atualização e senha

### Backup

```powershell
.\scripts\backup.ps1                                   # cria backups\AAAAMMDD-HHmmss
npm run backup:verify -- backups\20261026-120000      # confere se o backup restaura (precisa do Node.js)
.\scripts\restore.ps1 -Backup .\backups\20261026-120000
```

O backup pausa o Cell por alguns segundos e salva o banco e os arquivos. **Guarde o `.env` junto, em lugar seguro:** a restauração precisa da mesma `SECRET_KEY`, porque tokens e credenciais são cifrados com ela. A verificação restaura o backup num banco temporário e confere tudo, sem tocar no Cell em uso.

### Atualizar para uma versão nova

```powershell
.\scripts\backup.ps1
git pull
.\scripts\deploy.ps1
```

As migrações do banco rodam sozinhas. A versão instalada aparece no menu do usuário. O que mudou em cada versão está no [CHANGELOG.md](CHANGELOG.md). Para voltar a uma versão: `git checkout vX.Y.Z` e `.\scripts\deploy.ps1` (as migrações só avançam, por isso o backup antes).

### Senha

- **Trocar:** Configurações → Conta.
- **Esqueci a senha / criar a conta à mão:**
  ```powershell
  Write-Host 'Senha: ' -NoNewline; $s = Read-Host -AsSecureString; $env:CELL_ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)); "cell" | docker compose exec -T -e CELL_ADMIN_PASSWORD api npm run admin -- --reset; Remove-Item Env:CELL_ADMIN_PASSWORD
  ```
  Sem `-- --reset`, o comando cria a conta (se ainda não existir). A senha precisa de 12 caracteres ou mais e nunca vai para o histórico do PowerShell. Trocar a senha encerra as sessões abertas.

---

## Solução de problemas

| Problema | O que fazer |
|----------|-------------|
| **"Origem não permitida"** ao entrar | O endereço que você usou não está em `APP_ORIGIN`. Adicione no `.env` (com `https://`) e rode `.\scripts\deploy.ps1`. |
| Aviso de **"conexão não segura"** | Normal com o certificado local. [Instale o certificado](#certificado-https-sem-aviso-do-navegador). |
| `setup.ps1` **não roda** | `Set-ExecutionPolicy -Scope Process Bypass` e tente de novo. |
| **Docker não sobe** / porta em uso | Abra o Docker Desktop. Se outro programa usa as portas 80 ou 443 (IIS, Skype antigo, outro servidor web), feche-o. |
| Agente **não responde** / "9router: HTTP 401" | Confira endereço e token em Configurações → 9router e clique em **Testar conexão e atualizar modelos**. O Diagnóstico mostra o estado do provedor. |
| **Pesquisa na web** indisponível | Seu provedor não é o 9router. Conecte um aplicativo de pesquisa ou use o 9router. |
| **Microfone** não grava | Precisa de HTTPS confiável (domínio público ou certificado instalado) e permissão de microfone no navegador. |
| **Notificações** não chegam | Ative no próprio aparelho (menu → Notificações → Enviar teste). No iPhone, só com o app instalado na tela inicial. |
| **Rotina** não disparou | Confira se o interruptor está ligado, o horário e o fuso. O *Histórico* da rotina mostra o que aconteceu. |
| "O computador não respondeu" | O PC precisa estar ligado e com você logado. Confira em Configurações → Computador; se preciso, rode `.\scripts\host.ps1` e `.\scripts\deploy.ps1` de novo. O registro fica em `%LOCALAPPDATA%\Cell\host.log`. |
| Agente **não acha uma pasta** do PC | Rode `.\scripts\drives.ps1` e `.\scripts\deploy.ps1`; confira os discos em Configurações → Computador. |
| Algo travou | Configurações → **Diagnóstico** mostra o que está com problema. `docker compose logs -f api worker` mostra os registros. |

---

## Configuração avançada (.env)

O `setup.ps1` cria o `.env` sozinho. Os campos principais:

| Variável | Para que serve |
|----------|----------------|
| `POSTGRES_PASSWORD` | Senha do banco (aleatória). |
| `SECRET_KEY` | Chave que cifra tokens e credenciais. **Não perca:** sem ela os segredos salvos não abrem. |
| `CELL_HOST` | Endereços pelos quais o Cell é aberto, separados por vírgula. |
| `CELL_DEFAULT_SNI` | Endereço usado quando o navegador abre pelo IP. |
| `APP_ORIGIN` | Os mesmos endereços, com `https://`. O primeiro é usado no retorno dos aplicativos. |
| `NINEROUTER_BASE_URL` / `NINEROUTER_API_KEY` / `NINEROUTER_DEFAULT_MODEL` | Valores iniciais do provedor (também ajustáveis na interface). |
| `CELL_HOST_URL` / `CELL_HOST_TOKEN` | Endereço e token do Cell Host (gravados pelo `scripts\host.ps1`). |
| `CELL_PROXY_SECRET` | Segredo opcional enviado pelo Cloudflare Tunnel (veja acima). |
| `TRUSTED_PROXIES` | Lista de redes (CIDR) de proxies confiáveis, se não usar o segredo. |

Depois de editar o `.env`, rode `.\scripts\deploy.ps1`.

## Desenvolvimento

```powershell
npm install
npm run check      # verificação de tipos (TypeScript)
npm run build      # build da interface
npm run dev        # interface em http://127.0.0.1:5173 (proxy /api → 127.0.0.1:3101)
npm run test:db    # testes de integração com PostgreSQL temporário no Docker
npm run test:e2e   # testes de navegador (Chrome) em 360, 390, 768, 1024 e 1440 px
```

Estrutura:

| Pasta | Conteúdo |
|-------|----------|
| `apps/server/src` | API (`api.ts`), worker (`worker.ts`), ferramentas (`tools.ts`, `documents.ts`, `hostfiles.ts`, `computer.ts`, `connectors.ts`), provedor de modelos (`router.ts`). |
| `host` | Cell Host (`cell-host.mjs`): roda no Windows e executa os comandos aprovados. |
| `apps/server/migrations` | Migrações do banco, em ordem. |
| `apps/web/src` | Interface React. |
| `packages/shared` | Tipos e validações compartilhados. |
| `scripts` | Instalação, deploy, backup, restauração, certificado, discos e versões. |
| `tests` | Testes de integração e de navegador. |

Convenções:

- Diálogos da interface usam sempre os helpers de `apps/web/src/dialogs.ts` (SweetAlert2). Nunca `alert`, `confirm` ou `prompt` nativos.
- Versões seguem o [Versionamento Semântico](https://semver.org/lang/pt-BR/). Descreva cada mudança em `## [Não lançado]` no `CHANGELOG.md` e, com tudo commitado, rode `npm run release -- patch|minor|major` e depois `.\scripts\deploy.ps1`.
- Para usar um banco próprio nos testes, o nome dele precisa terminar em `_test`: `$env:TEST_DATABASE_URL = 'postgres://usuario:senha@127.0.0.1:5432/cell_test'; npm test`.
