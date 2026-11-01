# Cell

**Cell** é uma plataforma de agentes de IA que roda no seu próprio computador. Você monta uma equipe de agentes (cada um com cargo, instruções, memória e ferramentas), conversa com eles pelo navegador ou pelo celular, e eles pesquisam na web, geram imagens, planilhas, PDFs e apresentações, organizam pastas e rodam comandos no seu computador (e em servidores por SSH), usam aplicativos como Notion e Google Agenda, delegam tarefas entre si e trabalham em rotinas agendadas. Toda ação que muda algo fora do Cell pede a sua aprovação.

É feito para **um único usuário** (você) e fica **inteiramente sob seu controle**: os dados, as conversas e os arquivos ficam num banco PostgreSQL e numa pasta na sua máquina.

---

## Sumário

1. [O que o Cell faz](#o-que-o-cell-faz)
2. [Como funciona por dentro](#como-funciona-por-dentro)
3. [Antes de começar](#antes-de-começar)
4. [Instalação passo a passo](#instalação-passo-a-passo)
   - [Windows](#instalação-no-windows)
   - [Linux](#instalação-no-linux)
5. [Primeiro uso](#primeiro-uso)
6. [Ferramentas dos agentes](#ferramentas-dos-agentes)
7. [Usando o Cell no dia a dia](#usando-o-cell-no-dia-a-dia)
8. [Acesso por outros aparelhos e pela internet](#acesso-por-outros-aparelhos-e-pela-internet)
9. [Manutenção: backup, atualização e senha](#manutenção-backup-atualização-e-senha)
10. [Solução de problemas](#solução-de-problemas)
11. [Configuração avançada (.env)](#configuração-avançada-env)
12. [Desenvolvimento](#desenvolvimento)
13. [Licença](#licença)

---

## O que o Cell faz

- **Equipe de agentes:** crie quantos quiser, cada um com nome, cargo, descrição, instruções, memória, modelo de IA, ferramentas, cor e um ícone de célula. O **Coordenador** é o agente principal: organiza a equipe e pode criar e excluir agentes.
- **Conversas** com anexos (PDF, Word, Excel, imagens, textos), histórico, arquivamento e busca.
- **Ferramentas:** pesquisa na web, leitura de páginas, geração de imagens, **planilhas Excel/CSV, PDF, Word e PowerPoint**, pastas e **comandos no computador** (este PC e outros por SSH), delegação entre agentes, rotinas e mais de 20 aplicativos (Notion, Google, Todoist…).
- **Computadores:** indicador de conexão no topo, tarefas longas em segundo plano, alertas de disco, CPU e computador fora do ar, receitas de comandos e ligar à distância.
- **Aprovações:** o agente para e pergunta antes de qualquer ação que altere algo fora do Cell.
- **Rotinas:** tarefas agendadas (todo dia, toda semana, uma vez ou cron).
- **Voz:** envie áudios, receba respostas faladas e faça **chamadas de voz** com o agente.
- **Notificações** no celular e no computador.
- **App no celular** (PWA) para Android e iPhone.
- **Backup em um clique:** um arquivo cifrado com tudo, baixado e restaurado pelo próprio app (Configurações → Backup).

## Como funciona por dentro

![Diagrama de comunicação do Cell: o app (celular ou navegador) chega pela Cloudflare ou pela rede local ao Caddy, dentro do Docker; a API e o worker usam o PostgreSQL; o worker fala com o provedor de modelos e executa comandos aprovados no Host Windows (Cell Host) ou Linux (SSH).](docs/arquitetura.svg)

O caminho de um pedido, da esquerda para a direita:

1. **App:** você usa o Cell pelo navegador ou pelo app instalado no celular (PWA).
2. **Cloudflare (opcional):** de fora de casa, o pedido chega pelo domínio público. O **Cloudflare Tunnel** leva o tráfego até o programa `cloudflared`, que roda no computador do Cell e abre a conexão de dentro para fora, sem abrir portas no roteador. Na rede de casa, o app fala direto com o computador (`https://IP-do-computador`, linha tracejada).
3. **Docker:** o **Caddy** (`web`) recebe o HTTPS, entrega a interface e repassa `/api` para a **API**. A API grava no **PostgreSQL** e coloca as tarefas numa fila; o **worker** pega as tarefas, roda os agentes e as ferramentas.
4. **Host:** para responder, o worker chama o **provedor de modelos** (9router ou compatível). Para mexer no computador, ele usa o **Host**: no **Windows**, o **Cell Host** roda os comandos em PowerShell; no **Linux** (e em outros servidores), o Cell conecta por **SSH** e roda bash. De dentro do Docker, o próprio computador é o endereço `host.docker.internal`. Toda ação que muda algo no Host pede a sua aprovação.

O Cell roda em quatro containers Docker:

| Serviço  | O que faz |
|----------|-----------|
| `db`     | Banco PostgreSQL: agentes, conversas, configurações (segredos ficam cifrados). |
| `api`    | Servidor da aplicação (Fastify). É o único serviço exposto pela interface web. |
| `worker` | Executa as tarefas dos agentes, as ferramentas e as rotinas. |
| `web`    | Caddy: entrega a interface e faz o HTTPS nas portas 80 e 443. |

Fora do Docker, e opcionais: o **Cell Host** (só Windows) para os agentes executarem comandos aprovados neste computador, ou um acesso **SSH** no Linux (veja [Comandos no computador](#comandos-no-computador)), e o `cloudflared` para o [acesso pela internet](#acesso-pela-internet-cloudflare-tunnel).

Os modelos de IA **não** rodam dentro do Cell. Ele conversa com um provedor compatível com a API da OpenAI, chamado neste projeto de **9router** (veja a seguir).

## Antes de começar

O Cell roda em **Windows 10/11** (com Docker Desktop) e em **Linux** (com Docker Engine). Em resumo:

| Item | Windows | Linux |
|------|---------|-------|
| **Sistema** | Windows 10 (22H2) ou 11, 64 bits, com virtualização ligada na BIOS | Ubuntu 22.04+, Debian 12+, Fedora ou outra distribuição com Docker, 64 bits |
| **Hardware** | 4 GB de RAM livres e 10 GB de disco (os modelos de IA rodam no provedor, não no Cell) | Igual |
| **Docker** | [Docker Desktop](https://www.docker.com/products/docker-desktop/) com WSL 2 | [Docker Engine](https://docs.docker.com/engine/install/) com o plugin `docker compose` |
| **Git** | [git-scm.com](https://git-scm.com/download/win) | Pacote `git` da distribuição |
| **Scripts** | PowerShell (já vem no Windows) | bash; os comandos estão na [instalação no Linux](#instalação-no-linux) |
| **Provedor de modelos** | É quem responde (a "inteligência"). Veja abaixo. | Igual |
| **Comandos no computador** (opcional) | [Cell Host](#comandos-no-computador), precisa do [Node.js](https://nodejs.org/) 22+ | Por SSH, com o `openssh-server` |
| **Pastas do computador** (opcional) | `scripts\drives.ps1` | Um arquivo `compose.override.yaml` escrito à mão |
| **Acesso pela internet** (opcional) | Domínio na Cloudflare e o `cloudflared` | Igual |

O Node.js também é necessário para rodar os testes, nos dois sistemas.

### O provedor de modelos (9router)

O Cell fala com qualquer serviço **compatível com a API da OpenAI** (`/v1/chat/completions`). Ele foi feito para o **9router**, um roteador que reúne vários modelos e provedores num endereço só. O que cada recurso usa:

| Recurso | Rota usada | Funciona com |
|---------|-----------|--------------|
| Conversa e ferramentas | `/chat/completions` | Qualquer provedor compatível (9router, OpenAI, OpenRouter, Ollama, LM Studio…) |
| Gerar imagem | `/images/generations` | 9router, OpenAI e compatíveis |
| Transcrever áudio | `/audio/transcriptions` | 9router, OpenAI e compatíveis |
| Resposta em voz | `/audio/speech` | 9router, OpenAI e compatíveis. Sem modelo de voz, o próprio aparelho lê a resposta. |
| Pesquisa na web e leitura de páginas | `/search`, `/web/fetch` | Só 9router. Com outro provedor, conecte um aplicativo de pesquisa (MCP). |

Você vai precisar do **endereço** (ex.: `http://host.docker.internal:20128/v1` para um 9router no próprio PC, `http://192.168.0.20:20128/v1` em outra máquina da rede, ou `https://api.openai.com/v1`) e do **token** (chave de API) do seu provedor.

> **Provedor no próprio computador:** `host.docker.internal` é o computador visto de dentro do Docker. No Windows, um provedor que escuta só em `127.0.0.1` já funciona. No Linux, ele precisa escutar num endereço que os containers alcancem (`0.0.0.0` ou o IP da ponte do Docker, normalmente `172.17.0.1`), e o firewall precisa liberar a porta para as redes do Docker (veja o passo 7 da [instalação no Linux](#instalação-no-linux)).

## Instalação passo a passo

Escolha o seu sistema:

- [Instalação no Windows](#instalação-no-windows)
- [Instalação no Linux](#instalação-no-linux)

Nos dois casos, o Cell fica disponível em `https://localhost` no próprio computador e em `https://IP-do-computador` nos outros aparelhos da rede. O usuário da conta é **`cell`**.

### Instalação no Windows

#### 1. Prepare o Windows

Abra o **PowerShell como administrador** (botão direito no menu Iniciar → *Terminal (Admin)*) e instale o WSL 2, que o Docker Desktop usa:

```powershell
wsl --install
```

Reinicie o computador se ele pedir. Se o `wsl --install` disser que a virtualização está desligada, ative *Intel VT-x* ou *AMD-V/SVM* na BIOS.

#### 2. Instale o Docker Desktop e o Git

Ainda no PowerShell (pode ser sem administrador):

```powershell
winget install -e --id Docker.DockerDesktop
winget install -e --id Git.Git
```

Sem o `winget`, baixe pelos sites: [Docker Desktop](https://www.docker.com/products/docker-desktop/) e [Git](https://git-scm.com/download/win).

Abra o **Docker Desktop**, aceite os termos e espere aparecer *Engine running*. Em *Settings → General*, deixe marcado **Start Docker Desktop when you sign in**, para o Cell voltar sozinho quando o computador ligar. Feche e abra o PowerShell de novo (para ele achar o `git` e o `docker`) e confira:

```powershell
docker compose version
git --version
```

#### 3. Baixe o projeto

Abra o PowerShell na pasta onde quer guardar o Cell (por exemplo, `Documentos`) e rode:

```powershell
git clone https://github.com/tiagoberlanda/cell.git
cd cell
```

#### 4. Descubra o endereço do computador na rede

Para abrir o Cell de outros aparelhos (celular, notebook), você precisa do IP deste computador:

```powershell
ipconfig
```

Procure "Endereço IPv4" do adaptador que está ligado na rede (algo como `192.168.0.10`). Se for usar só neste computador, pode pular e usar `localhost`.

> Dica: reserve esse IP para o computador nas configurações do roteador (*DHCP estático* ou *reserva de endereço*). Se o IP mudar, os aparelhos param de achar o Cell.

#### 5. Rode a instalação

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

#### 6. Libere o acesso pela rede (se precisar)

O Docker Desktop costuma criar as regras de firewall sozinho. Se o celular não abrir `https://SEU-IP`, libere as portas 80 e 443 no PowerShell **como administrador**:

```powershell
New-NetFirewallRule -DisplayName 'Cell HTTPS' -Direction Inbound -Protocol TCP -LocalPort 80,443 -Action Allow -Profile Private
```

A regra vale só para redes marcadas como **Privada** (rede de casa). Confira em *Configurações → Rede e Internet → propriedades da rede*.

#### 7. Abra no navegador

Acesse `https://localhost` (ou `https://SEU-IP`). O navegador vai mostrar um **aviso de segurança**. Isso é esperado: o Cell usa um certificado próprio, emitido na sua máquina. Você pode clicar em "Avançado → Continuar" ou, melhor, [instalar o certificado](#certificado-https-sem-aviso-do-navegador) para o aviso sumir de vez.

Entre com o usuário **`cell`** e a senha que você criou. Depois siga o [Primeiro uso](#primeiro-uso).

Opcionais no Windows: [pastas do computador](#pastas-do-computador), [comandos no computador (Cell Host)](#comandos-no-computador) e [acesso pela internet](#acesso-pela-internet-cloudflare-tunnel).

### Instalação no Linux

Os comandos abaixo são para **Ubuntu/Debian**; em outras distribuições, troque o `apt` pelo gerenciador de pacotes dela. Os scripts `.ps1` do projeto são para Windows; no Linux, use os comandos bash desta seção (veja a [tabela de equivalências](#comandos-equivalentes-no-linux)).

#### 1. Instale o Docker Engine e o Git

Siga o guia oficial da sua distribuição em [docs.docker.com/engine/install](https://docs.docker.com/engine/install/), ou use o script oficial de instalação do Docker:

```bash
sudo apt update && sudo apt install -y git curl openssl
curl -fsSL https://get.docker.com | sudo sh
```

Deixe o Docker ligar junto com o computador e use-o sem `sudo`:

```bash
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
```

**Saia da sessão e entre de novo** (ou reinicie) para o grupo `docker` valer, e confira:

```bash
docker compose version
git --version
```

#### 2. Baixe o projeto

```bash
git clone https://github.com/tiagoberlanda/cell.git
cd cell
```

#### 3. Descubra o endereço do computador na rede

```bash
hostname -I
```

O primeiro endereço (algo como `192.168.0.10`) é o da rede. Se for usar só neste computador, use `localhost`. Como no Windows, vale reservar esse IP no roteador.

#### 4. Crie o arquivo `.env`

Troque `192.168.0.10` pelo seu IP e rode o bloco inteiro. Ele gera senhas e chaves aleatórias:

```bash
IP=192.168.0.10
cat > .env <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 24)
SECRET_KEY=$(openssl rand -hex 32)
NINEROUTER_BASE_URL=http://host.docker.internal:20128/v1
NINEROUTER_API_KEY=
NINEROUTER_DEFAULT_MODEL=
CELL_HOST=$IP, localhost
CELL_DEFAULT_SNI=$IP
APP_ORIGIN=https://$IP,https://localhost
COOKIE_SECURE=true
EOF
chmod 600 .env
```

O `chmod 600` deixa o arquivo legível só pelo seu usuário. **Guarde uma cópia do `.env` em lugar seguro**: a `SECRET_KEY` abre os tokens e senhas salvos no Cell.

#### 5. Suba os containers

```bash
export CELL_VERSION=$(sed -n 's/^  "version": "\(.*\)",$/\1/p' package.json)
docker compose up -d --build --wait
```

A primeira vez leva alguns minutos. O `CELL_VERSION` só marca as imagens com a versão do Cell, que aparece no menu do usuário. Os containers voltam sozinhos quando o computador liga.

#### 6. Crie a sua conta

A senha é lida sem aparecer na tela nem no histórico do terminal (mínimo de 12 caracteres):

```bash
read -rsp 'Senha inicial (mínimo 12 caracteres): ' CELL_ADMIN_PASSWORD && echo && export CELL_ADMIN_PASSWORD
echo cell | docker compose exec -T -e CELL_ADMIN_PASSWORD api npm run admin
unset CELL_ADMIN_PASSWORD
```

Deve aparecer **"Conta configurada."** O usuário é `cell`.

#### 7. Firewall e provedor no próprio computador

As portas 80 e 443 são publicadas pelo Docker, que cria as próprias regras de rede: os outros aparelhos já alcançam o Cell, **mesmo com o `ufw` ativo** (o `ufw` não filtra portas publicadas pelo Docker). Por isso, não deixe o computador exposto direto na internet; para acesso de fora, use o [Cloudflare Tunnel](#acesso-pela-internet-cloudflare-tunnel).

Já o caminho contrário, do container para serviços do próprio computador, passa pelo firewall. Se o **provedor de modelos** roda neste computador, deixe-o escutar em `0.0.0.0` (ou em `172.17.0.1`) e, com o `ufw`, libere a porta dele só para as redes do Docker:

```bash
sudo ufw allow from 172.16.0.0/12 to any port 20128 proto tcp
```

#### 8. Abra no navegador

Acesse `https://localhost` (ou `https://SEU-IP`), passe pelo aviso de certificado (ou [instale o certificado](#certificado-https-sem-aviso-do-navegador)) e entre com o usuário **`cell`** e a senha que você criou. Depois siga o [Primeiro uso](#primeiro-uso).

Opcionais no Linux: [pastas do computador](#pastas-no-linux), [comandos por SSH](#comandos-no-computador-pelo-linux-ssh) e [acesso pela internet](#acesso-pela-internet-cloudflare-tunnel).

#### Comandos equivalentes no Linux

O README usa os scripts do Windows nos exemplos. No Linux, rode na pasta do Cell:

| No Windows | No Linux |
|------------|----------|
| `.\scripts\setup.ps1` | Passos 4 a 6 acima. |
| `.\scripts\deploy.ps1` (aplicar mudanças no `.env` ou atualizar) | `export CELL_VERSION=$(sed -n 's/^  "version": "\(.*\)",$/\1/p' package.json) && docker compose up -d --build --wait` |
| `.\scripts\export-cert.ps1` | `docker compose cp web:/data/caddy/pki/authorities/local/root.crt cell-root.crt` |
| `.\scripts\drives.ps1` | `compose.override.yaml` à mão: veja [Pastas do computador no Linux](#pastas-no-linux). |
| `.\scripts\host.ps1` (Cell Host) | Não existe no Linux: use [SSH](#comandos-no-computador-pelo-linux-ssh). |

Se preferir, os scripts `deploy.ps1` e `export-cert.ps1` também rodam no Linux com o [PowerShell 7](https://learn.microsoft.com/powershell/scripting/install/install-ubuntu) (`pwsh ./scripts/deploy.ps1`).

## Primeiro uso

1. **Configure o provedor:** menu do usuário (canto inferior esquerdo) → **Configurações** → **9router**:
   - **Endereço** do provedor (ex.: `http://host.docker.internal:20128/v1`) e **Token** (chave de API);
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
| `pc_write` | Cria um arquivo de texto (substituir um existente aparece na aprovação; o anterior é guardado). | **Sim** |
| `pc_delete` | Exclui arquivos e pastas, vários de uma vez. Vão para a **Lixeira** e podem ser restaurados. | **Sim** |
| `pc_edit` | Altera trechos de um arquivo de texto. A aprovação mostra as linhas removidas e adicionadas. | **Sim** |
| `pc_save_file` | Salva um arquivo da biblioteca do Cell (um PDF ou planilha gerado, um anexo) numa pasta do PC. | **Sim** |
| `pc_import` | Traz um arquivo do PC para a conversa, anexado à resposta (até 25 MB). | Não |

Todas as alterações em pastas ganham o botão **Desfazer** na conversa (em *Ferramentas utilizadas*).

### Comandos no computador ([como ativar](#comandos-no-computador))

| Ferramenta | O que faz | Pede aprovação? |
|-----------|-----------|:---:|
| `pc_run` | Roda um comando num computador conectado: PowerShell neste PC e nos Windows por SSH, bash nos Linux. Mostra o computador e o script antes. | **Sim, sempre** |
| `pc_status` | Mostra quais computadores estão conectados, com nome, usuário, sistema, tempo ligado e memória. | Não |
| `pc_job` | Mostra as tarefas em segundo plano e a saída delas. | Não |
| `pc_wake` | Liga à distância um computador com o endereço MAC cadastrado (Wake-on-LAN). | Não |
| `pc_recipe` / `pc_recipe_trusted` | Roda uma receita de comando salva por você. As marcadas como **Liberada** rodam sem aprovação. | Sim / Não |

Comandos longos (backup, download, compactação) rodam **em segundo plano**, sem limite de tempo: o agente usa `pc_run` com `background`, você acompanha a saída ao vivo no ícone de computadores do topo (com o botão **Cancelar**) e recebe um aviso no celular quando termina.

### Aplicativos ([como conectar](#aplicativos-notion-google-e-outros))

Cada aplicativo conectado traz suas próprias ferramentas (ex.: buscar páginas no Notion, criar evento na Agenda). Elas são carregadas **só quando o pedido precisa do aplicativo**: o agente vê uma lista curta dos aplicativos e abre um deles (ferramenta `use_app`) antes de usá-lo, o que deixa as respostas mais rápidas e baratas. As de **leitura** rodam direto; as que **criam, alteram ou apagam** pedem aprovação. O **Google Tarefas** vem integrado: listar listas e tarefas, criar, concluir e excluir.

### Ligar e desligar ferramentas por agente

Editar agente → aba **Ferramentas**. Valem para todos os agentes, sem precisar ligar: documentos, pastas e comandos do computador (estes podem ser bloqueados de uma vez em Configurações → Computador) e os aplicativos conectados pelo catálogo.

### Modo planejamento (`/plan`)

Comece a mensagem com `/plan` (ex.: `/plan lançar a loja online`). Nesse modo o servidor **só libera ferramentas de leitura e pesquisa**: o agente investiga e entrega um plano, sem criar arquivos nem executar ações.

---

## Usando o Cell no dia a dia

### Agentes

- **Criar:** botão **+** na lista de agentes.
- **Editar:** painel do agente (ícone à direita no topo) → **Editar agente**. Abas: perfil (nome, cargo, descrição, seção, modelo), célula e cor, memória e instruções, ferramentas.
- **Menu rápido:** no **celular**, segure e solte sobre o agente; no **computador**, use os **três pontos** (ou o clique direito). Opções: **fixar no topo** (até 3 agentes), **renomear** e **mover para outra seção**.
- **Reordenar:** segure e arraste agentes e seções.
- **Seções:** agrupe agentes (ex.: "Equipe", "Pessoal"). Crie em **Nova seção**; renomeie ou exclua (vazia) pelo **⋯** da seção.
- **Fixados no topo:** até 3 agentes aparecem em destaque acima da lista.
- **Logo "cell.":** leva ao agente principal (Coordenador).
- **Recolher o menu (computador, telas a partir de 1200 px):** o botão no topo da lista deixa só os avatares; a escolha fica guardada no aparelho. Pesquisar e criar agente continuam acessíveis, e o ponto verde marca agentes com mensagem não lida.
- **Arquivar:** Editar agente → **Arquivar agente**. Agentes arquivados ficam em menu do usuário → **Agentes arquivados**, de onde podem ser restaurados. O agente principal não pode ser arquivado.
- **Estado de cada agente:** a célula se anima e muda de indicador quando o agente está trabalhando, na fila, aguardando aprovação ou outro agente, ou falhou.

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

- **Histórico:** ícone de relógio no topo mostra as conversas anteriores e as arquivadas (que podem ser restauradas); o de caixa arquiva a atual.
- **Ações em cada mensagem:** copiar, reenviar a solicitação e excluir. Avisos de erro também podem ser excluídos.
- **Parar:** enquanto o agente trabalha, o botão de enviar vira **parar** e cancela a execução.
- **Ensinar uma tarefa:** botão **+** → *Ensinar uma tarefa* transforma a conversa numa **habilidade** reutilizável, que você liga aos agentes. Todas as habilidades ficam em menu do usuário → **Habilidades**.

### Memória e resumo

Cada agente tem uma **memória** (preferências e fatos que você quer que ele lembre) e cada conversa longa ganha um **resumo** automático. Painel do agente → *Ver e editar memória e resumo*. Todas as versões ficam no histórico.

Há também uma **memória compartilhada**, comum a todos os agentes, para o que vale para a equipe inteira (por exemplo, "o cliente prefere relatórios curtos"). Peça a qualquer agente para guardar algo nela. Ela fica no banco e entra no backup. Gravar (`write_shared_memory`, que acrescenta ao fim, ou troca tudo com `mode=replace`) e apagar (`delete_shared_memory`) pedem aprovação. Cada agente recebe o começo dela no prompt e lê o resto com `read_shared_memory`.

### Rotinas

Painel do agente → **Rotinas** → *Nova rotina*: o agente recebe a tarefa no horário marcado (diária, semanal, uma vez ou expressão cron) e responde na conversa. O interruptor liga e desliga; a lixeira exclui; *Executar agora* testa na hora; *Histórico* mostra as execuções. O fuso padrão é `America/Sao_Paulo`.

### Aprovações

Quando o agente quer fazer algo que precisa de permissão, a conversa mostra o pedido em linguagem simples no fim do chat, logo acima da caixa de mensagem. Os botões são **Aprovar esta chamada**, **Aprovar sempre** e **Negar**. O sino do topo lista as aprovações pendentes, e o celular recebe um aviso **com os botões Aprovar e Negar na própria notificação** (no Android; no iPhone, toque para abrir). A notificação mostra o que será feito, como o comando e o computador. Se os parâmetros mudarem depois da aprovação, a ação é bloqueada.

**Aprovar sempre** aprova o pedido e deixa aquele agente usar a mesma ferramenta dali em diante sem perguntar (por exemplo, todos os comandos no computador, no caso de `pc_run`). Para desfazer: botão **+** ao lado da caixa de mensagem → **Sempre aprovadas**.

**Modo de aprovação** (botão **+** → *Modo de aprovação*), escolhido por agente:

| Modo | O que pede sua confirmação |
|---|---|
| **Pedir aprovação** (padrão) | Toda ferramenta da coluna "Pede aprovação?" |
| **Aprovar tudo menos exclusão** | Só exclusões: `pc_delete`, comandos que apagam (`Remove-Item`, `rm`, `del`, `rmdir`, `DROP TABLE`…), receitas com esses comandos e ferramentas de aplicativos com nomes como *delete*, *remove* ou *trash* |
| **YOLO (aprovação total)** | Nada. Pede uma confirmação ao ativar |

Com um modo diferente do padrão, a linha embaixo da caixa de mensagem mostra qual está ativo. Em qualquer modo, uma ação cujo resultado ficou incerto (o serviço pode já ter executado) continua esperando você conferir antes de repetir.

### Notificações

Em cada aparelho: menu do usuário → **Notificações** → *Ativar notificações neste aparelho* → *Enviar teste*. Você é avisado quando um agente ou rotina responde e quando há aprovação pendente; tocar no aviso abre a conversa. Para silenciar um agente: painel do agente → *Notificações ativadas/desativadas*.

- Precisa de HTTPS confiável (domínio público ou [certificado instalado](#certificado-https-sem-aviso-do-navegador)). No iPhone, só com o app instalado na tela inicial.
- Se a conversa já estiver aberta e visível em algum aparelho, o aviso não é enviado.
- O **sino** lista mensagens não lidas e aprovações pendentes. No celular ele aparece também no topo da lista de agentes, que cobre a conversa.

### Voz

- **Mensagem de voz:** com o campo vazio, toque no **microfone**, fale (até 5 minutos) e envie. O áudio é transcrito e vira a mensagem.
- **Resposta em áudio:** no cadastro do agente, marque *Responder com áudio quando eu enviar áudio*.
- **Chamada de voz:** toque no **telefone** no topo da conversa. Fale normalmente; ao fazer uma pausa, o agente pensa (a célula se anima) e responde falando, depois volta a ouvir. Botões: desligar microfone, enviar na hora, interromper e encerrar.
- **Vozes:** Configurações → 9router: modelo de transcrição, modelo e voz de resposta (*Testar voz*) e a voz do próprio aparelho. Cada agente pode ter sua voz (*Voz deste agente*).

### Pastas do computador

Os agentes podem organizar arquivos do computador onde o Cell roda. As pastas entram no container `worker` como discos (`/host/c`, `/host/k`…), e os agentes as chamam por letra, como no Windows (`K:\Downloads`).

#### Pastas no Windows

Ative uma vez (e de novo se adicionar um disco):

```powershell
.\scripts\drives.ps1
.\scripts\deploy.ps1
```

O script libera os discos locais para o `worker` (do `C:` só a sua pasta de usuário) no arquivo `compose.override.yaml`, que fica só na sua máquina. Para desligar: `.\scripts\drives.ps1 -Remove` e depois `.\scripts\deploy.ps1`.

#### Pastas no Linux

Crie à mão o arquivo `compose.override.yaml` na pasta do Cell (ele não vai para o git) e escolha uma **letra** para cada pasta que quer liberar. Exemplo, com a sua pasta pessoal como `H:` e um disco de dados como `D:`:

```yaml
services:
  worker:
    volumes:
      - type: bind
        source: /home/seu-usuario
        target: /host/h
      - type: bind
        source: /mnt/dados
        target: /host/d
```

Aplique com o comando de atualização (`export CELL_VERSION=… && docker compose up -d --build --wait`, veja a [tabela](#comandos-equivalentes-no-linux)). Agora `H:\Documentos` é `/home/seu-usuario/Documentos`. Os discos aparecem em **Configurações → Computador**.

O `worker` roda como o usuário de número **1000** (o primeiro usuário criado na maioria das distribuições; confira com `id -u`). Se as pastas forem de outro usuário, dê acesso a ele, por exemplo `sudo setfacl -R -m u:1000:rwX /mnt/dados`. Para desligar, apague o `compose.override.yaml` e rode o comando de atualização.

#### Usando as pastas

Depois peça, por exemplo: *"organize a pasta K:\Downloads por tipo de arquivo"*. O agente pede acesso, você aprova, e ele lista, propõe a reorganização e pede aprovação antes de mover, criar ou **excluir** (o que é excluído vai para a Lixeira, e tudo pode ser desfeito pelo botão **Desfazer**). Arquivos ocultos e de sistema (como `.env`) ficam bloqueados. Veja e remova acessos em **Configurações → Computador**.

### Comandos no computador

O ícone de **computador no topo da conversa** mostra se há computadores conectados: **verde** se pelo menos um responde, **cinza** se nenhum. Toque nele para ver cada computador, o estado e os detalhes.

#### Comandos no Windows: Cell Host

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

#### Comandos no computador pelo Linux (SSH)

O Cell Host é só para Windows. No Linux, o Cell usa o próprio computador **por SSH**, como qualquer outro servidor, e os agentes rodam comandos em bash.

1. Instale o servidor SSH e crie um usuário só para o Cell, sem `sudo` (os comandos rodam com as permissões dele):
   ```bash
   sudo apt install -y openssh-server
   sudo adduser --disabled-password --gecos '' cell-agente
   ```
2. Crie uma chave só para o Cell e autorize-a para esse usuário:
   ```bash
   ssh-keygen -t ed25519 -N '' -C cell -f cell-agente
   sudo install -d -m 700 -o cell-agente -g cell-agente /home/cell-agente/.ssh
   sudo install -m 600 -o cell-agente -g cell-agente cell-agente.pub /home/cell-agente/.ssh/authorized_keys
   ```
3. Com o `ufw`, libere o SSH só para as redes do Docker:
   ```bash
   sudo ufw allow from 172.16.0.0/12 to any port 22 proto tcp
   ```
4. No Cell, em **Configurações → Computador → Adicionar computador por SSH**: endereço **`host.docker.internal`**, porta `22`, usuário `cell-agente`, e cole o conteúdo do arquivo `cell-agente` (a chave privada). Confira a impressão digital mostrada com `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` e confirme.
5. Apague a chave privada do disco: `shred -u cell-agente` (ela fica cifrada no Cell).

Depois disso, o computador aparece no ícone de computadores e você pede coisas como *"quanto espaço livre tem no disco?"*, aprovando cada comando. Os comandos rodam como `cell-agente`: para eles lerem ou mudarem pastas suas, dê acesso a esse usuário (por grupo ou com `setfacl`).

**Alertas.** Uma checagem por minuto avisa no celular quando um disco passa do limite, um computador fica fora do ar ou a CPU fica alta por um tempo, e avisa quando volta ao normal. Ajuste os limites em **Configurações → Computador → Alertas dos computadores**. Alertas abertos deixam o ponto do ícone de computadores laranja.

**Receitas.** Em **Configurações → Computador → Últimos comandos**, toque em **Salvar como receita** num comando que você usa sempre. Ele aparece no painel de computadores para rodar com um toque. Os agentes também podem usar as receitas: com aprovação, ou sem, se você marcar **Liberada**.

**Ligar à distância.** Para computadores SSH, cadastre o endereço MAC (ícone de rede no cartão do computador, em Configurações → Computador) e ative o Wake-on-LAN na BIOS e na placa de rede dele. Quando ele estiver desligado, toque em **Ligar** no painel.

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

### Configurações

Menu do usuário (canto inferior esquerdo) → **Configurações**:

| Aba | O que tem |
|-----|-----------|
| **9router** | Endereço e token do provedor, modelo padrão, modelos de imagem, transcrição e voz, voz do aparelho. |
| **Aparência** | Tema escuro, claro ou seguindo o sistema. |
| **Execução** | Fuso horário, execuções simultâneas, etapas de ferramentas, profundidade de delegação, tokens por resposta e janela de contexto. |
| **Computador** | Cell Host e interruptor dos comandos, computadores SSH, alertas, receitas, últimos comandos, discos e pastas liberadas. |
| **Conta** | Trocar a senha e sair de todos os outros aparelhos. |
| **Uso e dados** | Tokens usados por modelo. |
| **Backup** | Fazer backup (baixar) e restaurar a partir de um arquivo. |
| **Notificações** | Ativar neste aparelho, enviar teste e aparelhos inscritos. |
| **Diagnóstico** | Saúde do worker, banco, fila, provedor e conexões. |

### Acompanhar o que os agentes estão fazendo

- **Central de atividade** (ícone de atividade no topo): todas as execuções, com filtros, modelo, tempo, tokens, ferramentas usadas, arquivos, árvore de delegações e botões para aprovar, negar e cancelar.
- **Janela de contexto** (painel do agente): quanto da memória de trabalho do modelo a última execução usou. O limite (padrão de 16 mil tokens) fica em Configurações → Execução.
- **Diagnóstico** (Configurações → Diagnóstico): saúde do worker, banco, fila, provedor, conexões e aplicativos, sem mostrar segredos.

---

## Acesso por outros aparelhos e pela internet

### Pela rede de casa

Abra `https://SEU-IP` em qualquer aparelho da mesma rede. O endereço precisa estar no `-HostName` usado no setup (ou em `CELL_HOST` e `APP_ORIGIN` no `.env`; depois rode `.\scripts\deploy.ps1`, ou o [comando de atualização no Linux](#comandos-equivalentes-no-linux)).

### Certificado HTTPS sem aviso do navegador

Exporte o certificado do Cell, na pasta do Cell:

```powershell
.\scripts\export-cert.ps1
```

No Linux:

```bash
docker compose cp web:/data/caddy/pki/authorities/local/root.crt cell-root.crt
```

Isso gera `cell-root.crt`. Instale-o em cada aparelho (só nos seus: ele faz o aparelho confiar em certificados emitidos por este Cell):

- **Windows:** abra o arquivo → *Instalar certificado* → *Máquina local* → *Autoridades de Certificação Raiz Confiáveis*.
- **Linux (Ubuntu/Debian):** `sudo cp cell-root.crt /usr/local/share/ca-certificates/ && sudo update-ca-certificates`. No Fedora: `sudo cp cell-root.crt /etc/pki/ca-trust/source/anchors/ && sudo update-ca-trust`. O **Firefox** tem a lista própria: *Configurações → Privacidade e Segurança → Certificados → Ver certificados → Autoridades → Importar*. O **Chrome** no Linux também: `chrome://certificate-manager` → *Autoridades* → *Importar*.
- **Android:** Configurações → Segurança → Criptografia e credenciais → Instalar certificado → *Certificado de CA*.
- **iPhone:** abra o arquivo, instale o perfil e ative em Ajustes → Geral → Sobre → *Ajustes de Confiança de Certificado*.

### App no celular (PWA)

Abra o Cell no Chrome do Android (ou Safari do iPhone) e use **⋮ → Instalar app** (ou *Compartilhar → Adicionar à Tela de Início*). Pela rede local, instale o certificado antes. Pelo domínio público, funciona direto.

Se perder o celular: Configurações → Conta → *Sair de todos os outros dispositivos* e troque a senha.

### Acesso pela internet (Cloudflare Tunnel)

Com um **Cloudflare Tunnel** você acessa o Cell de qualquer lugar **sem abrir portas no roteador**: o programa `cloudflared`, instalado no computador do Cell, abre uma conexão de dentro para fora até a Cloudflare, e ela entrega os pedidos do seu domínio por essa conexão (veja o [diagrama](#como-funciona-por-dentro)). Você precisa de um domínio gerenciado pela Cloudflare (o plano gratuito basta).

1. **Não abra as portas 80/443 no roteador.**
2. No `.env`, inclua o domínio (exemplo `cell.seudominio.com`) **em primeiro lugar** e aplique (`.\scripts\deploy.ps1` no Windows, ou o [comando de atualização no Linux](#comandos-equivalentes-no-linux)):
   ```ini
   CELL_HOST=cell.seudominio.com, 192.168.0.10, localhost
   APP_ORIGIN=https://cell.seudominio.com,https://192.168.0.10,https://localhost
   ```
   O primeiro endereço de `APP_ORIGIN` é usado no retorno dos aplicativos conectados e no aviso das notificações.
3. Crie o túnel: no painel da Cloudflare, **Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared**, dê o nome `cell` e escolha o sistema do computador. O painel mostra o comando de instalação com um **token** (é um segredo: não compartilhe).
   - **Windows:** instale com `winget install -e --id Cloudflare.cloudflared` e, no PowerShell **como administrador**, rode o comando do painel, `cloudflared.exe service install <TOKEN>`. Ele vira um serviço do Windows e liga sozinho.
   - **Linux:** rode os comandos que o painel mostra para a sua distribuição (repositório da Cloudflare, `apt install cloudflared`) e depois `sudo cloudflared service install <TOKEN>`. Ele vira um serviço do systemd (`systemctl status cloudflared`).

   O painel mostra o túnel como **Healthy** quando a conexão sobe.
4. Ainda no túnel, em **Public Hostname**, aponte `cell.seudominio.com` para `https://localhost:443`, com **Origin Server Name** `cell.seudominio.com` e **No TLS Verify** ativado (o certificado do Cell é local; a Cloudflare entrega o certificado público ao navegador).
5. Desative **Rocket Loader**, **Email Address Obfuscation** e a injeção do **Web Analytics** para esse domínio (eles injetam scripts que a política de segurança do Cell bloqueia).
6. Recomendado: proteja o domínio com **Cloudflare Access** (login extra por e-mail antes da página carregar).
7. Recomendado: para o limite de tentativas de login usar o IP real do visitante, gere um segredo (`node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`), coloque no `.env` como `CELL_PROXY_SECRET=...` e crie na Cloudflare uma **Transform Rule → Modify Request Header** que envie `X-Cell-Proxy-Secret` com esse valor. No Linux, gere o segredo com `openssl rand -hex 24`. Aplique com `.\scripts\deploy.ps1` (ou o comando de atualização no Linux).

---

## Manutenção: backup, atualização e senha

### Backup

Pelo próprio Cell, em qualquer aparelho: **Configurações → Backup**.

- **Fazer backup e baixar:** digite a senha da conta e o navegador baixa um arquivo `.cellbackup` com **tudo**: agentes, conversas, mensagens, arquivos, rotinas, habilidades, conexões e aplicativos, computadores, receitas e configurações. O arquivo sai **cifrado com a senha da conta** (AES-256): sem ela, ninguém lê o conteúdo. Guarde o arquivo e lembre-se da senha.
- **Restaurar:** escolha o arquivo, digite a senha usada quando ele foi feito e toque em **Enviar e verificar**. O Cell mostra a data, a versão e quantos agentes, conversas e arquivos o backup tem, **sem mudar nada**. Se estiver certo, toque em **Restaurar este backup** e confirme com a senha atual. Tudo é substituído pelo conteúdo do backup e todos os aparelhos precisam entrar de novo (com a senha da conta da época do backup).
- **Em outra instalação:** funciona direto. Os tokens e senhas salvos são adaptados à chave da instalação nova, sem precisar copiar o `.env`.
- **Versões:** um backup de uma versão anterior pode ser restaurado numa versão mais nova. O contrário é recusado, com o aviso para atualizar o Cell antes.
- **Tamanho:** pelo domínio público (Cloudflare), envios passam de no máximo 100 MB. Para restaurar backups maiores, use o endereço da rede local ou a linha de comando.

#### Pela linha de comando

Funciona em qualquer sistema com Docker, na pasta do Cell, e serve para automatizar backups ou restaurar arquivos grandes. Aqui a senha só protege o arquivo (use a mesma da conta para não esquecer). Primeiro, guarde-a numa variável sem que ela apareça na tela nem no histórico:

```bash
read -rsp 'Senha do backup: ' CELL_BACKUP_PASSWORD && export CELL_BACKUP_PASSWORD
```

No PowerShell:

```powershell
$s = Read-Host 'Senha do backup' -AsSecureString; $env:CELL_BACKUP_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
```

**Fazer backup** (o comando mostra o nome do arquivo; troque `<arquivo>` por ele):

```bash
docker compose exec -e CELL_BACKUP_PASSWORD api npm run backup -- create
docker compose cp api:/data/backups/saved/<arquivo>.cellbackup .
```

**Conferir e restaurar** um arquivo: copie-o para o container, rode `verify` (só mostra o conteúdo) e depois `restore` (substitui tudo):

```bash
docker compose cp cell-20261028.cellbackup api:/tmp/
docker compose exec -e CELL_BACKUP_PASSWORD api npm run backup -- verify /tmp/cell-20261028.cellbackup
docker compose exec -e CELL_BACKUP_PASSWORD api npm run backup -- restore /tmp/cell-20261028.cellbackup
docker compose exec -u root api rm /tmp/cell-20261028.cellbackup
```

Depois, apague a variável: `unset CELL_BACKUP_PASSWORD` (no PowerShell, `Remove-Item Env:CELL_BACKUP_PASSWORD`).

### Atualizar para uma versão nova

Faça um backup antes (Configurações → Backup) e depois:

```powershell
git pull
.\scripts\deploy.ps1
```

No Linux:

```bash
git pull
export CELL_VERSION=$(sed -n 's/^  "version": "\(.*\)",$/\1/p' package.json)
docker compose up -d --build --wait
```

As migrações do banco rodam sozinhas. A versão instalada aparece no menu do usuário. O que mudou em cada versão está no [CHANGELOG.md](CHANGELOG.md). Para voltar a uma versão: `git checkout vX.Y.Z` e `.\scripts\deploy.ps1`. As migrações do banco só avançam; se precisar voltar também os dados, restaure o backup feito antes da atualização (backups de versões anteriores sempre podem ser restaurados).

### Senha

- **Trocar:** Configurações → Conta.
- **Esqueci a senha / criar a conta à mão:**
  ```powershell
  Write-Host 'Senha: ' -NoNewline; $s = Read-Host -AsSecureString; $env:CELL_ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)); "cell" | docker compose exec -T -e CELL_ADMIN_PASSWORD api npm run admin -- --reset; Remove-Item Env:CELL_ADMIN_PASSWORD
  ```
  No Linux:
  ```bash
  read -rsp 'Senha: ' CELL_ADMIN_PASSWORD && echo && export CELL_ADMIN_PASSWORD
  echo cell | docker compose exec -T -e CELL_ADMIN_PASSWORD api npm run admin -- --reset
  unset CELL_ADMIN_PASSWORD
  ```
  Sem `-- --reset`, o comando cria a conta (se ainda não existir). Depois de restaurar um backup, a senha da conta volta a ser a da época do backup. A senha precisa de 12 caracteres ou mais e nunca vai para o histórico do terminal. Trocar a senha encerra as sessões abertas.

---

## Solução de problemas

| Problema | O que fazer |
|----------|-------------|
| **"Origem não permitida"** ao entrar | O endereço que você usou não está em `APP_ORIGIN`. Adicione no `.env` (com `https://`) e rode `.\scripts\deploy.ps1`. |
| Aviso de **"conexão não segura"** | Normal com o certificado local. [Instale o certificado](#certificado-https-sem-aviso-do-navegador). |
| `setup.ps1` **não roda** | `Set-ExecutionPolicy -Scope Process Bypass` e tente de novo. |
| **Docker não sobe** / porta em uso | Windows: abra o Docker Desktop. Se outro programa usa as portas 80 ou 443 (IIS, Skype antigo, outro servidor web), feche-o. Linux: veja quem usa a porta com `sudo ss -ltnp 'sport = :443'` (comum: `apache2` ou `nginx`) e pare o serviço (`sudo systemctl disable --now apache2`). |
| Linux: **"permission denied" no `docker.sock`** | Seu usuário não está no grupo `docker`. Rode `sudo usermod -aG docker "$USER"`, saia da sessão e entre de novo. |
| Linux: provedor ou SSH **não responde** em `host.docker.internal` | O serviço precisa escutar em `0.0.0.0` (ou `172.17.0.1`), não só em `127.0.0.1`, e o firewall precisa liberar a porta para `172.16.0.0/12`. Teste de dentro do Cell: `docker compose exec worker node -e "fetch('http://host.docker.internal:20128/v1/models').then(r=>console.log(r.status))"`. |
| Agente **não responde** / "9router: HTTP 401" | Confira endereço e token em Configurações → 9router e clique em **Testar conexão e atualizar modelos**. O Diagnóstico mostra o estado do provedor. |
| **Pesquisa na web** indisponível | Seu provedor não é o 9router. Conecte um aplicativo de pesquisa ou use o 9router. |
| **Microfone** não grava | Precisa de HTTPS confiável (domínio público ou certificado instalado) e permissão de microfone no navegador. |
| **Notificações** não chegam | Ative no próprio aparelho (menu → Notificações → Enviar teste). No iPhone, só com o app instalado na tela inicial. |
| **Rotina** não disparou | Confira se o interruptor está ligado, o horário e o fuso. O *Histórico* da rotina mostra o que aconteceu. |
| "O computador não respondeu" | Windows: o PC precisa estar ligado e com você logado. Confira em Configurações → Computador; se preciso, rode `.\scripts\host.ps1` e `.\scripts\deploy.ps1` de novo. O registro fica em `%LOCALAPPDATA%\Cell\host.log`. Linux (SSH): confira `systemctl status ssh` e a regra do firewall. |
| Agente **não acha uma pasta** do PC | Windows: rode `.\scripts\drives.ps1` e `.\scripts\deploy.ps1`. Linux: confira o `compose.override.yaml` e as permissões para o usuário 1000. Confira os discos em Configurações → Computador. |
| Backup: **"Senha incorreta ou arquivo de backup danificado"** | Use a senha que estava valendo quando o backup foi feito. Se a senha estiver certa, o arquivo foi alterado ou não baixou inteiro: baixe de novo. |
| Backup: **"versão mais nova do Cell"** | O backup veio de um Cell mais novo. Atualize este (`git pull` e `.\scripts\deploy.ps1`) e restaure de novo. |
| Backup grande **não envia** pelo domínio público | O Cloudflare limita envios a 100 MB. Restaure pelo endereço da rede local ou pela linha de comando. |
| Algo travou | Configurações → **Diagnóstico** mostra o que está com problema. `docker compose logs -f api worker` mostra os registros. |

---

## Configuração avançada (.env)

No Windows, o `setup.ps1` cria o `.env` sozinho; no Linux, ele é criado no [passo 4](#4-crie-o-arquivo-env). Os campos principais:

| Variável | Para que serve |
|----------|----------------|
| `POSTGRES_PASSWORD` | Senha do banco (aleatória). |
| `SECRET_KEY` | Chave que cifra tokens e credenciais. **Não troque nem perca** numa instalação em uso: os segredos salvos deixam de abrir. Para mudar de servidor, restaure um backup do Cell: ele adapta os segredos à chave nova. |
| `CELL_HOST` | Endereços pelos quais o Cell é aberto, separados por vírgula. |
| `CELL_DEFAULT_SNI` | Endereço usado quando o navegador abre pelo IP. |
| `APP_ORIGIN` | Os mesmos endereços, com `https://`. O primeiro é usado no retorno dos aplicativos. |
| `NINEROUTER_BASE_URL` / `NINEROUTER_API_KEY` / `NINEROUTER_DEFAULT_MODEL` | Valores iniciais do provedor (também ajustáveis na interface). |
| `CELL_HOST_URL` / `CELL_HOST_TOKEN` | Endereço e token do Cell Host (gravados pelo `scripts\host.ps1`). |
| `CELL_PROXY_SECRET` | Segredo opcional enviado pelo Cloudflare Tunnel (veja acima). |
| `TRUSTED_PROXIES` | Lista de redes (CIDR) de proxies confiáveis, se não usar o segredo. |

Depois de editar o `.env`, rode `.\scripts\deploy.ps1` (no Linux, o [comando de atualização](#comandos-equivalentes-no-linux)).

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
| `apps/server/src` | API (`api.ts`), worker (`worker.ts`), ferramentas (`tools.ts`, `documents.ts`, `hostfiles.ts`, `computer.ts`, `connectors.ts`), provedor de modelos (`router.ts`), backup (`backup.ts`, `backup-cli.ts`). |
| `host` | Cell Host (`cell-host.mjs`): roda no Windows e executa os comandos aprovados. |
| `apps/server/migrations` | Migrações do banco, em ordem. |
| `apps/web/src` | Interface React. |
| `packages/shared` | Tipos e validações compartilhados. |
| `scripts` | Instalação, deploy, certificado, discos, Cell Host, testes e versões. |
| `tests` | Testes de integração e de navegador. |

Convenções:

- Diálogos da interface usam sempre os helpers de `apps/web/src/dialogs.ts` (SweetAlert2). Nunca `alert`, `confirm` ou `prompt` nativos.
- Versões seguem o [Versionamento Semântico](https://semver.org/lang/pt-BR/). Descreva cada mudança em `## [Não lançado]` no `CHANGELOG.md` e, com tudo commitado, rode `npm run release -- patch|minor|major` e depois `.\scripts\deploy.ps1`.
- Para usar um banco próprio nos testes, o nome dele precisa terminar em `_test`: `$env:TEST_DATABASE_URL = 'postgres://usuario:senha@127.0.0.1:5432/cell_test'; npm test`.

## Licença

Distribuído sob a licença MIT. Veja [LICENSE](LICENSE).
