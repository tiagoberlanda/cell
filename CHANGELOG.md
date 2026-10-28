# Changelog

Todas as mudan?as relevantes do Cell ficam registradas aqui.
O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e as vers?es seguem o [Versionamento Sem?ntico](https://semver.org/lang/pt-BR/).

## [N?o lan?ado]

### Adicionado
- Mem?ria compartilhada local em `memory.md`, acess?vel por todos os agentes.
- Exclus?o protegida de conversas e pesquisa em conversas ativas, arquivadas e t?tulos.

### Corrigido
- Cart?es de agentes ignoram estado, mensagens e notifica??es de conversas arquivadas.

## [0.30.0] - 2026-10-28

### Adicionado
- **Aprovar sempre:** novo botão no pedido de aprovação. Aprova a chamada e deixa o agente usar a mesma ferramenta sem perguntar de novo. As regras ficam em **+ → Sempre aprovadas**, onde podem ser esquecidas.
- **Modo de aprovação por agente**, no botão **+** ao lado da caixa de mensagem: *Pedir aprovação* (padrão), *Aprovar tudo menos exclusão* (só exclusões e comandos que apagam pedem confirmação) e *YOLO (aprovação total)*, que pede confirmação ao ativar. O modo ativo aparece embaixo da caixa de mensagem. Uma ação com resultado incerto sempre espera você, em qualquer modo.

### Corrigido
- Um diálogo aberto logo depois de fechar um menu deixava o app inteiro invisível para leitores de tela (`aria-hidden` preso na página). Os diálogos agora esperam o menu terminar de fechar.

### Alterado
- Prévia dos agentes ignora mensagens de conversas arquivadas.
- Adicionado controle de modo de aprovação, aprovação permanente por ferramenta e modo YOLO.

## [0.29.0] - 2026-10-28

### Corrigido
- **Respostas no meio do caminho não somem mais:** o que o agente escreve antes de usar uma ferramenta ("Vou pesquisar primeiro…") fica na conversa como mensagem própria, com as ferramentas daquela etapa logo abaixo. Antes, só a resposta final sobrava.
- Ferramentas de uma execução cancelada não aparecem mais soltas em "Atividade adicional de ferramentas": entram em "Ferramentas utilizadas" da resposta seguinte.

### Alterado
- Computadores: o computador com o Cell Host aparece com o nome dele (por exemplo `WINDOWS11`) ou como "Computador conectado", em vez de "Este computador", que não fazia sentido no celular ou em outro aparelho.
- **Cabeçalho no celular:** ficam à vista só as notificações e os botões de arquivar e de chamada. Central de atividade, histórico de conversas, computadores e detalhes do agente vão para o menu ⋮. No computador, nada muda.
- **Aprovações no fim da conversa:** o cartão de aprovação fica sempre por último, logo acima da caixa de mensagem, abaixo das ferramentas em execução. Tocar numa notificação de aprovação abre a conversa já nele, sem precisar rolar.
- Pedidos de aprovação do agente cujo chat está aberto não geram mais aviso no app nem notificação no aparelho onde o chat está na tela; o pedido já aparece na conversa. Avisos de outros agentes continuam.

## [0.28.1] - 2026-10-28

### Corrigido
- **Tabelas nas mensagens, no celular:** as palavras não quebram mais no meio ("Cana l", "16:0 0"). Cabeçalhos ficam numa linha só, cada coluna tem largura mínima e a quebra acontece só entre palavras; tabelas largas rolam para o lado dentro do balão, com uma sombra na borda indicando que há mais conteúdo.

## [0.28.0] - 2026-10-28

### Adicionado
- **Backup pelo app:** Configurações → **Backup**. "Fazer backup e baixar" pede a senha da conta e baixa um arquivo `.cellbackup` com tudo (agentes, conversas, mensagens, execuções, arquivos, rotinas, habilidades, conexões, computadores, receitas e configurações), cifrado com a senha da conta (AES-256-GCM, chave derivada com scrypt). "Restaurar" envia o arquivo, mostra o conteúdo sem mudar nada e só substitui tudo depois da confirmação com a senha atual; todos os aparelhos saem e entram de novo.
- O backup funciona em outra instalação: os segredos salvos são re-cifrados para a `SECRET_KEY` da instalação nova. Backups de versões anteriores são aceitos; de versões mais novas, recusados com aviso. Execuções que estavam em andamento no momento do backup voltam como interrompidas.
- Linha de comando para qualquer sistema com Docker: `docker compose exec -e CELL_BACKUP_PASSWORD api npm run backup -- create | verify | restore`.

### Removido
- `scripts/backup.ps1`, `scripts/restore.ps1`, `scripts/verify-backup.mjs` e `npm run backup:verify` (só funcionavam no Windows e exigiam o `.env` original para restaurar).

### Alterado
- `.env.example` revisado: só as variáveis que o `.env` realmente usa, separadas em obrigatórias, provedor e opcionais, com explicação de cada uma. Saíram `DATABASE_URL`, `COOKIE_SECURE`, `WORKSPACE_PATH` e `PORT` (o `compose.yaml` define essas sozinho; no `.env` não tinham efeito) e entraram `CELL_HOST_URL`, `CELL_HOST_TOKEN`, `CELL_PROXY_SECRET` e `TRUSTED_PROXIES`.
- Endereço padrão do provedor: `http://host.docker.internal:20128/v1` (um 9router no próprio computador) em vez de um IP de rede específico, no `.env.example`, no `setup.ps1`, no `compose.yaml` e no código. Instalações existentes não mudam (o endereço fica no `.env` e nas configurações).
- Limpeza: importações e variáveis sem uso removidas.


## [0.27.0] - 2026-10-28

### Adicionado
- **Recolher o menu no desktop:** a partir de 1200 px de largura, um botão no topo da lista de agentes recolhe a lateral para um rail só com os avatares e volta a expandir com outro toque. O nome, o subtítulo, os menus de cada agente e os rótulos das seções ficam ocultos no modo recolhido, e a conversa ganha a largura que sobra. A escolha fica guardada neste aparelho (`localStorage`: `cell.sidebar`). No celular e no tablet o comportamento não muda: abaixo de 768 px continua a gaveta, e entre 768 e 1199 px a lateral já é um rail.

### Alterado
- **Agentes maiores na lista:** avatares da lista de 40 para 44 px, nome de 13 para 14 px, subtítulo de 11 para 12 px e um pouco mais de espaço em cada linha; nos fixados do topo, o avatar vai de 56 para 64 px e o cartão de 91×100 para 98×108. Tudo continua cabendo em uma linha, sem corte de nome nem rolagem horizontal.
- **Sino de notificações também na lista de agentes (celular):** o sino com o contador de não lidas agora aparece no topo da gaveta de agentes, ao lado da busca e do **+**. Antes ele existia só no cabeçalho da conversa, e no celular a gaveta ocupa a tela inteira e cobre o cabeçalho: com a lista aberta (sem conversa na tela), um pedido de aprovação chegava sem nenhum aviso visível. O sino da gaveta abre a mesma lista, marca como lidas e leva à conversa do agente (fechando a gaveta). No computador nada muda: continua só o sino do cabeçalho.

### Corrigido
- **Menu recolhido e barra estreita do tablet:** o menu do agente (clique direito ou segurar) abria no canto superior esquerdo da tela, porque o botão de três pontos, ao qual ele se ancora, ficava com `display:none`; agora ele continua no layout sem largura e o menu abre ao lado do agente. O ponto de **mensagem não lida** também aparece sobre o avatar nesses modos (antes ficava escondido). No menu recolhido do desktop, **Pesquisar** e **Criar agente** continuam visíveis, empilhados.
- **Logo do topo:** clicar em **cell.** agora leva ao **agente principal (master)** na hora, sem recarregar a página. Antes o wordmark era um link para `/`, então o clique recarregava o app inteiro (a tela piscava) e o `localStorage` restaurava o agente e a conversa em que você estava, dando a impressão de que nada acontecia. Se você já está no master, o clique volta para a conversa mais recente dele; no celular, também fecha a gaveta de agentes.

### Como foi verificado
- **Real:** teste de navegador novo ("menu estreito: menu do agente ao lado dele, não lidas visíveis e atalhos") em 768, 1024 e 1440 px; sem a correção ele falha nas três larguras. Suíte inteira aprovada nas cinco larguras.
- **Real:** teste de navegador novo (`tests/e2e/ui.spec.ts`: "sino de notificações fica visível na lista de agentes no celular") em 360 e 390 px: abre a gaveta, confere o sino com contador, abre o aviso de aprovação do Redator e chega à conversa dele com a gaveta fechada. O teste do sino original passou a apontar para o do cabeçalho (`.chat-header`), já que agora existem dois no celular. Suíte inteira: 125 testes de navegador aprovados nas cinco larguras, sem rolagem horizontal.
- **Real:** teste de navegador novo (`tests/e2e/ui.spec.ts`: "menu lateral recolhe e expande no desktop") em 1440 px: recolhe, confere que a lateral fica mais estreita e que o texto do agente some, recarrega a página e a escolha continua valendo, depois expande e tudo volta (inclusive a largura original). Nos demais tamanhos de tela o teste é pulado, porque o botão só existe no desktop. A suíte inteira fechou em 123 testes de navegador aprovados nas cinco larguras testadas (360, 390, 768, 1024 e 1440 px), sem rolagem horizontal.
- **Real:** teste de navegador novo (`tests/e2e/ui.spec.ts`: "logo do topo leva ao agente principal sem recarregar a página") em celular (390 px) e desktop (1440 px): sai do Redator, clica em **cell.** e o cabeçalho passa a mostrar o Coordenador, com a marca de que a página não recarregou. Rodado contra o código antigo, o mesmo teste falha (continua no Redator), provando que ele cobre o bug.

## [0.26.0] - 2026-10-28

### Adicionado
- **Alertas dos computadores:** uma checagem por minuto avisa no celular quando um disco passa do limite de uso, quando um computador fica fora do ar e quando a CPU fica alta por um tempo; avisa de novo quando volta ao normal. Os alertas abertos aparecem no ícone de computadores do topo (ponto laranja) e no painel. Limites em Configurações → Computador (padrão: disco 90%, fora do ar 10 min, CPU 90% por 15 min). O Cell Host 1.2.0 passa a informar discos e CPU; os computadores por SSH também.
- **Ligar à distância (Wake-on-LAN):** cadastre o endereço MAC de um computador SSH (Configurações → Computador, ícone de rede) e use **Ligar** no painel quando ele estiver desligado, ou peça ao agente (`pc_wake`). O sinal sai pelo Cell Host, dentro da sua rede.
- **Receitas de comandos:** salve um comando dos "Últimos comandos" como receita com nome. Rode com um toque no painel de computadores (o resultado aparece na hora; tarefas longas seguem em segundo plano). Os agentes usam receitas com aprovação (`pc_recipe`) ou, para as marcadas como **Liberada**, sem aprovação (`pc_recipe_trusted`); uma receita alterada depois não roda nos termos antigos.
- **Editar arquivos com prévia:** `pc_edit` troca trechos exatos de um arquivo de texto numa pasta liberada. O cartão de aprovação mostra as linhas removidas (vermelho) e adicionadas (verde) antes de aprovar; quebras de linha do Windows são preservadas e dá para desfazer.
- Migração `0022_alerts_wake_recipes_preview`.

### Como foi verificado
- **Real:** espaço dos discos lido pelo Node no Windows (C: e K:).
- **Simulado:** teste de integração: alerta de disco imediato, CPU e fora do ar só depois do tempo configurado, resolução; MAC inválido recusado, sinal pelo Cell Host com MAC e broadcast certos; receitas (nome repetido, computador desconhecido, rodar, aprovação versus liberada, alteração depois bloqueada, modo plano); `pc_edit` pelo worker com prévia gravada antes da aprovação, CRLF preservado, trecho ausente ou repetido, desfazer. Teste de navegador da prévia colorida, alertas, Ligar e receita.
- **Não verificado:** acordar um computador de verdade (depende de Wake-on-LAN ligado na BIOS e na placa de rede dele).

## [0.25.0] - 2026-10-28

### Adicionado
- **Aprovar pela notificação:** a notificação de aprovação no celular mostra o que será feito (o comando e o computador, os arquivos ou a pasta) e tem os botões **Aprovar** e **Negar**, que respondem sem abrir o app. Cada botão leva um código de uso único, válido só para aquela aprovação e aquela decisão, enquanto ela estiver pendente; a notificação confirma o resultado.
- **Lixeira e Desfazer:** exclusões vão para a **Lixeira do Windows** (pelo Cell Host) ou, sem ele, para a lixeira do Cell (`.cell-lixeira` dentro da pasta liberada, invisível para os agentes). Mover, renomear, excluir, criar pasta, gravar e salvar arquivos ficam registrados, e as ferramentas usadas na conversa ganham o botão **Desfazer**: os itens voltam para onde estavam, os excluídos saem da Lixeira e um arquivo substituído volta à versão anterior.
- **Arquivos entre o Cell e o computador:** `pc_save_file` salva um arquivo da biblioteca (PDF, planilha, imagem que o agente gerou, ou um anexo) numa pasta liberada, com aprovação; `pc_import` traz um arquivo do computador para a conversa, anexado à resposta (qualquer formato, até 25 MB).
- **Tarefas em segundo plano:** `pc_run` com `background` roda comandos longos (backup, download, compactação) sem limite de tempo, neste PC (Cell Host 1.1.0) e em computadores Linux por SSH. O ícone de computadores do topo lista as tarefas com a **saída ao vivo** e o botão **Cancelar**; ao terminar, o resultado aparece na conversa e o celular recebe um aviso. `pc_job` deixa o agente acompanhar.
- Migração `0021_file_ops_jobs`.

### Alterado
- `pc_delete` não exclui mais definitivamente: o item vai para a Lixeira e pode ser restaurado.

### Como foi verificado
- **Real:** Cell Host 1.1.0 no Windows: tarefa com saída parcial ao vivo, conclusão com código de saída e cancelamento encerrando o processo.
- **Simulado:** teste de integração: aprovação pela notificação (código errado ou de outra decisão recusado, aprovado uma única vez), mover, substituir e excluir pela Lixeira e desfazer cada um, salvar da biblioteca no PC e trazer do PC (formato livre), tarefa em segundo plano até a mensagem de conclusão, repetição sem iniciar duas vezes, cancelamento, tarefa Linux por SSH. Teste de navegador do Desfazer e das tarefas com saída e cancelamento.
- **Não verificado:** os botões na notificação de um Android real e a restauração da Lixeira do Windows de verdade (precisam do Cell Host 1.1.0, ver abaixo).

## [0.24.0] - 2026-10-27

### Adicionado
- Indicador de computadores no topo da conversa: ícone de computador **verde** quando pelo menos um computador está conectado e **cinza** quando nenhum está. Ao tocar, mostra cada computador com o estado (conectado ou não), tipo, usuário, sistema, tempo ligado, memória livre ou o motivo da falha e quando foi visto pela última vez, com **Verificar agora** e **Gerenciar computadores**. O estado é atualizado a cada minuto.
- Vários computadores: além deste PC (Cell Host), os agentes podem usar outras máquinas por **SSH**, Linux (bash) ou Windows com OpenSSH (PowerShell). Em Configurações → Computador, **Adicionar computador por SSH** pede endereço, porta, usuário e senha ou chave privada, testa a conexão e mostra a impressão digital da chave do servidor para você confirmar. A senha ou a chave fica cifrada e o Cell recusa a conexão se a chave do servidor mudar.
- `pc_run` e `pc_status` passam a receber o computador. Com mais de um, o agente precisa escolher, e a aprovação mostra em qual computador o comando vai rodar. O computador é conferido no momento da execução, então um computador removido ou com chave trocada não roda nada.
- Migração `0020_computers`.

### Como foi verificado
- **Simulado:** teste de integração com um servidor SSH real em memória: senha errada recusada, salvar exige confirmar a impressão digital, senha guardada cifrada e nunca devolvida, status e comando pelo SSH (pasta com aspas sem injeção), escolha obrigatória com dois computadores, chave trocada recusada no status e no comando, remoção. Teste de navegador do indicador verde e cinza e da lista em cinco larguras.
- **Não verificado:** conexão com um servidor Linux de verdade.

## [0.23.0] - 2026-10-27

### Adicionado
- Ícone do Cell Host na bandeja do Windows (perto do relógio): colorido quando está rodando, cinza quando parado. O menu tem **Iniciar**, **Parar**, **Abrir o Cell**, **Ver registro** e **Fechar (parar e sair)**; um duplo clique inicia quando está parado. Se o Cell Host cair, a bandeja o reinicia sozinha (até 5 vezes seguidas, depois avisa).
- Atalho **Cell Host** no menu Iniciar para abrir de novo depois de fechar. Abrir uma segunda cópia só avisa que já está rodando.

### Corrigido
- Modelos que nunca tinham passado pelo teste de capacidades (por exemplo, o Grok) não recebiam **nenhuma ferramenta**: respondiam só em texto, sem gerar imagem, usar aplicativos ou o computador. Agora o modelo é testado automaticamente na primeira execução e o resultado é gravado; se o teste não puder ser feito, o Cell assume que o modelo usa ferramentas. Era a causa principal de o Artista com o Grok não gerar a imagem.
- O instalador do Cell Host encerra versões anteriores em execução antes de instalar.

### Como foi verificado
- **Real:** no worker de produção, o Cell Host respondeu pelo `host.docker.internal` com o token. Um pedido real ao Coordenador (Grok) mostrou que o modelo recebia zero ferramentas (3,5 mil tokens de entrada), o que levou à correção. Ícones da bandeja renderizados.
- **Simulado:** teste de integração: modelo novo é testado uma vez, recebe ferramentas e o resultado fica gravado; modelo sem suporte não recebe ferramentas.
- **Não verificado:** a bandeja rodando de fato (precisa reinstalar o Cell Host com `.\scripts\host.ps1`).

## [0.22.0] - 2026-10-27

### Adicionado
- Comandos no computador: com o **Cell Host** instalado no Windows (`.\scripts\host.ps1`), os agentes podem rodar comandos PowerShell no computador, pedindo pelo celular ou pelo PC. O Cell Host roda no login, com o seu usuário e sem administrador, escuta só no `127.0.0.1` (a rede local e a internet não o alcançam), exige um token e recusa chamadas de navegadores.
  - `pc_run` roda um comando, **sempre com aprovação**, mostrando o script, a pasta e o tempo limite (até 10 minutos; o processo e os filhos são encerrados no limite). A saída volta limitada a 20 mil caracteres.
  - `pc_status` mostra o estado do computador (nome, usuário, sistema, tempo ligado, memória).
  - As duas fazem parte do aplicativo "Computador", carregado só quando o pedido precisa (`use_app`). O modo `/plan` não roda comandos.
- Configurações → Computador: estado do Cell Host, interruptor para permitir ou bloquear comandos e os últimos 20 comandos com o resultado.
- Pastas do computador: `pc_write` (criar arquivo de texto; substituir só com `overwrite`) e `pc_delete` (excluir arquivos e pastas, vários de uma vez, definitivamente), ambas **com aprovação**. A própria pasta liberada não pode ser excluída.

### Como foi verificado
- **Real:** Cell Host rodando no Windows, chamado de dentro de um container: comando com acentos em UTF-8, token errado recusado (401), chamada com cabeçalho de navegador recusada (403), comando de 30 s encerrado no limite de 2 s.
- **Simulado:** teste de integração com um Cell Host falso: ferramentas só sob demanda, nada roda antes da aprovação, aprovado roda e aparece no histórico, negado nunca chega ao computador, interruptor desliga para todos os agentes e sobrevive a salvar as configurações. Gravar e excluir arquivos dentro e fora da pasta liberada. Teste de navegador da tela Computador.

## [0.21.0] - 2026-10-27

### Alterado
- Ferramentas dos aplicativos conectados (Notion, Canva, Google, conexões MCP personalizadas) agora são carregadas sob demanda. Em cada chamada, o modelo recebe só uma ferramenta leve, `use_app`, com a lista dos aplicativos e o que cada um faz. Quando o pedido precisa de um aplicativo, o modelo chama `use_app`, e as ferramentas daquele aplicativo passam a ser enviadas a partir da etapa seguinte da mesma execução. Aprovações e permissões não mudam; uma ferramenta já usada na execução continua disponível (por exemplo, depois de uma aprovação).
- Efeito no agente Artista (Notion e Canva conectados): de 134 ferramentas e cerca de 300 mil caracteres de definições por chamada para 20 ferramentas e cerca de 9 mil, com respostas mais rápidas e baratas.

### Como foi verificado
- **Real:** com as ferramentas do Artista e o Grok pelo 9router de produção, "gere uma imagem" chamou `generate_image` direto (3,6 mil tokens de entrada em vez de cerca de 109 mil) e "crie um design no Canva" chamou `use_app` com `canva`.
- **Simulado:** teste de integração: `use_app` lista só os aplicativos conectados, abrir um aplicativo libera só as ferramentas dele, e pelo worker a primeira chamada ao modelo não leva o Notion e a seguinte, depois do `use_app`, leva.

## [0.20.1] - 2026-10-27

### Corrigido
- Agentes com modelos Grok não usavam nenhuma ferramenta (gerar imagem, Canva, etc.) e respondiam que "não conseguiam". O nome de cada ferramenta de aplicativo era cortado em 64 caracteres, e duas ferramentas do Notion (`notion-calendar-list-calendars` e `notion-calendar-list-calendar-events`) ficavam com o mesmo nome. O Gemini aceitava a duplicata; o Grok recusa a lista inteira ("Duplicate function definition"), e a resposta saía sem ferramentas. Nomes longos agora recebem um sufixo curto que os torna únicos (nomes que cabem em 64 caracteres não mudam), e a lista enviada ao modelo nunca repete um nome.

### Como foi verificado
- **Real:** pelo 9router de produção, com as 133 ferramentas do agente Artista: antes, o Grok respondia erro 400 de definição duplicada; depois, tanto o Grok quanto o Gemini chamaram `generate_image`.
- **Simulado:** teste de integração dos nomes (sem colisão, até 64 caracteres, nomes curtos inalterados, estáveis).

## [0.20.0] - 2026-10-27

### Adicionado
- Novas ferramentas para todos os agentes, com o arquivo anexado à resposta e salvo na biblioteca:
  - `create_spreadsheet`: Excel (.xlsx) com várias abas, cabeçalho destacado, filtros, colunas ajustadas e fórmulas; ou CSV com `;` e BOM (abre direto no Excel em português, acentos preservados).
  - `create_pdf`: PDF A4 com páginas numeradas a partir de Markdown (títulos, parágrafos, listas, tabelas, negrito, itálico e `---` para nova página).
  - `create_docx`: documento Word com os mesmos recursos, para edição.
  - `create_presentation`: PowerPoint 16:9 com capa, tópicos em dois níveis, tabelas, imagens da biblioteca, anotações do apresentador e cor de destaque.
- Planilhas Excel enviadas na conversa agora são lidas pelo agente (uma seção por aba).
- README reescrito como guia passo a passo: requisitos, instalação, primeiro uso, todas as ferramentas, recursos, acesso externo, manutenção e solução de problemas.

### Corrigido
- O texto de PDFs não era extraído no servidor: o `tsx`, que roda a aplicação, quebra o pdf.js embutido no `pdf-parse` ("bad XRef entry"). A leitura agora roda num processo Node separado, com tempo limite. Afetava PDFs anexados e os lidos nas pastas do computador.

### Como foi verificado
- **Real:** arquivos gerados e reabertos: PDF renderizado (2 páginas, tabela, listas, acentos), Word e planilha lidos de volta, apresentação com 3 slides e anotações. Leitura de PDF sob `tsx` confirmada com falha antes e sucesso depois.
- **Simulado:** teste de integração com o modelo pedindo uma planilha (arquivo anexado à resposta, nome saneado, fórmulas lidas), CSV com aspas e separador, PDF com texto extraído, Word, PowerPoint com imagem da biblioteca, modo plano sem geração de arquivos.
- **Não verificado:** abertura dos arquivos no Excel, Word e PowerPoint de verdade (os arquivos seguem os formatos Office e foram validados pelas bibliotecas de leitura).

## [0.19.0] - 2026-10-27

### Adicionado
- Pastas do computador: os agentes podem organizar arquivos do PC onde o Cell roda. Para usar uma pasta (ex.: `K:\Downloads`), o agente pede acesso e você aprova na conversa; o acesso vale para aquele agente, com subpastas. Na pasta liberada, listar e ler (txt, md, csv, json, pdf, docx) é livre; mover (em lote, com uma única aprovação), renomear e criar pastas sempre pedem aprovação. Não há ferramenta para apagar, nada é sobrescrito e arquivos ocultos ou de sistema (incluindo `.env`) ficam bloqueados.
- Configurações → Computador: discos disponíveis e pastas liberadas por agente, com botão para remover o acesso.
- `scripts/drives.ps1`: libera os discos locais para o worker (do `C:` só a pasta do usuário), gravando `compose.override.yaml` (não versionado). `-Remove` desliga.
- Aprovações de ações no computador aparecem em linguagem simples (pasta pedida, lista "origem → destino").
- Menu do agente na lista: no celular, segure e solte sobre o agente (segurar e arrastar continua reordenando); no computador, ícone de três pontos. Opções: fixar/desafixar no topo, renomear e mover para outra seção (ou criar uma nova).
- Limite de 3 agentes fixados no topo, aplicado também no servidor. Agentes fixados mostram um alfinete na lista.
- Migração `0019_host_grants`.

### Como foi verificado
- **Simulado:** teste de integração com um disco K: simulado: pedido de acesso pelo agente parando na aprovação e liberando a pasta ao aprovar; listar (sem ocultos), ler, `..` e pastas não liberadas recusados, outro agente sem acesso, mover sem sobrescrever e sem sair da pasta liberada, renomear, modo plano só leitura, revogação imediata. Limite de fixados, renomear e mover de seção pela API. Testes de navegador do menu (segurar, renomear, mover para nova seção, limite de 3) e da tela Computador.
- **Real:** os discos C:, D:, E: e K: deste PC montam no Docker.

## [0.18.0] - 2026-10-27

### Adicionado
- Chamada de voz: botão de telefone no topo da conversa abre uma tela de chamada com o agente. Você fala e, ao fazer uma pausa, o Cell envia o trecho; a célula do agente mostra que está pensando (anéis girando e pontinhos), depois responde falando (ondas sonoras) e volta a ouvir sozinha. Legendas mostram o que você disse e o que o agente respondeu. Dá para desligar o microfone, enviar na hora, interromper a fala do agente e encerrar. A tela fica acesa durante a chamada.
- Na chamada o agente sempre responde em voz, mesmo que esteja configurado para responder áudios em texto. Fora da chamada vale a opção do agente.
- Escolha de voz em lista: em Configurações → 9router, a voz padrão agora é escolhida entre as vozes conhecidas do modelo selecionado (OpenAI: 11 vozes no gpt-4o-mini-tts, 9 no tts-1) ou digitada em "Outra".
- Voz por agente: no cadastro do agente, "Voz deste agente" escolhe outro modelo de voz e/ou outra voz; vazio usa o padrão do espaço.
- Voz do aparelho: escolha qual voz do celular ou computador lê as respostas quando não há modelo de voz (vale só para aquele aparelho).
- Migração `0018_voices_call`.

### Como foi verificado
- **Simulado:** teste de integração da voz por agente (voz do modelo padrão, modelo próprio sem a voz padrão), da chamada (resposta sempre em voz, mensagem marcada como chamada) e do catálogo de vozes. Testes de navegador em cinco larguras: chamada passando por ouvindo, pensando e falando, com interromper, microfone desligado e encerrar; escolha e gravação da voz do agente.
- **Não verificado:** chamada com microfone e alto-falante reais no celular, e a detecção de pausa em ambiente com ruído. Sem um modelo de voz funcionando no 9router, a resposta da chamada é lida pela voz do aparelho.

## [0.17.2] - 2026-10-27

### Corrigido
- Aprovar uma ação travava a execução: o Cell guardava a impressão dos parâmetros na ordem enviada pelo modelo, mas o banco reordena as chaves. Ao conferir, a ordem não batia e a execução falhava com "Parâmetros mudaram após a aprovação", deixando a aprovação na tela. A impressão agora ignora a ordem das chaves (alteração real dos parâmetros continua bloqueando).
- Execuções encerradas (falha, conclusão ou cancelamento) agora fecham as aprovações pendentes, que deixam de aparecer com botões. A migração `0017_stale_approvals` limpa as que ficaram presas.
- O diagnóstico contava como conexões MCP as tentativas de conexão não concluídas. Agora mostra quantas estão ativas e lista as não concluídas à parte.

### Como foi verificado
- **Real:** a falha foi confirmada no banco de produção (execução encerrada no mesmo instante em que a aprovação foi criada).
- **Simulado:** teste de integração com argumentos em ordem que o banco reordena: aprovação, escrita e conclusão; execução encerrada fecha a aprovação e o botão responde "não está mais pendente". Teste de navegador do diagnóstico com uma conexão ativa e uma não concluída.

## [0.17.1] - 2026-10-27

### Corrigido
- Os diálogos de confirmação não aceitavam toque quando abertos sobre uma janela (por exemplo, "Abrir o Canva" em Conectar aplicativos, "Desconectar" ou "Excluir rotina" no editor): a janela bloqueia cliques e foco fora dela. Agora o diálogo é exibido dentro da janela aberta, aceita toque e digitação, e o Esc fecha só o diálogo.

### Como foi verificado
- Teste de navegador em cinco larguras: na janela de aplicativos, "Abrir o Canva" abre a aba, o campo recebe o endereço colado e a conexão conclui; Esc fecha só o diálogo. Sem a correção, o mesmo teste falha no clique.

## [0.17.0] - 2026-10-27

### Adicionado
- Janela de contexto: nova configuração "Janela de contexto (tokens)" em Configurações → Execução, com padrão de 16 mil. Cada execução envia ao modelo só o que cabe nela (instruções, a nova mensagem e o histórico mais recente; anexos usam no máximo metade). Antes o limite era fixo em 120 mil caracteres.
- Nos detalhes do agente, "Janela de contexto" mostra quanto a última execução da conversa usou em relação ao máximo, com barra (amarela acima de 70%, vermelha acima de 90%).
- Treze aplicativos novos no catálogo, todos testados com o endereço de retorno do Cell: ClickUp, monday.com, Airtable, Miro, Zapier, Stripe, PayPal, Wix, Webflow, Supabase, Sentry, Cloudflare e Hugging Face. O catálogo agora é agrupado por categoria.

### Corrigido
- Canva: a conexão falhava com "Invalid redirect URI", porque o Canva só aceita retorno para endereço local de aplicativos que ele não aprovou. Agora o Cell usa o retorno local: depois de autorizar, a página que não carrega tem o endereço com a autorização; basta colá-lo no Cell para concluir.

### Como foi verificado
- **Real:** consulta aos servidores MCP de 25 serviços com o endereço de retorno do Cell. Os 13 adicionados aceitaram; Asana, Box, Dropbox, Figma, GitHub, HubSpot, Vercel e Intercom só aceitam aplicativos pré-aprovados e ficaram de fora. O Canva aceitou o retorno local.
- **Simulado:** teste de integração do fluxo de colar o endereço (retorno local, código trocado uma vez, endereço de outro aplicativo recusado) e da janela de contexto (padrão de 16 mil, histórico antigo cortado em 2 mil tokens, uso medido). Testes de navegador em cinco larguras.
- **Não verificado:** conexão real com as contas desses serviços.

## [0.16.1] - 2026-10-27

### Adicionado
- Rotinas: interruptor para ativar ou desativar direto no cartão (no lugar do ícone de pausar) e botão de excluir com confirmação. Ativar recusa rotinas cujo horário já passou.

### Corrigido
- O campo de mensagem ficava grande enquanto o agente trabalhava: ao enviar uma mensagem longa, o texto era limpo mas a altura não voltava. Agora o campo se ajusta a cada mudança, inclusive ao enviar.
- Nas ferramentas usadas, o selo "Concluído" saía do cartão no celular quando o nome da ferramenta era longo. O nome agora quebra linha, o selo fica no lugar e as ferramentas de aplicativos aparecem sem o prefixo interno (`notion-fetch` em vez de `mcp_<id>_notion-fetch`; o nome completo fica na dica).

### Como foi verificado
- Testes de navegador em cinco larguras: interruptor liga e desliga e o estado persiste, exclusão com confirmação remove o cartão; campo volta à altura original depois de enviar uma mensagem de cinco linhas. Selo e nome da ferramenta medidos em 360 px com o CSS real.

## [0.16.0] - 2026-10-27

### Adicionado
- Mensagens de voz: botão de microfone no campo de mensagem (aparece quando o campo está vazio), barra "Gravando" com tempo e Cancelar, limite de 5 minutos. O áudio é transcrito pelo 9router (modelo de transcrição escolhido em Configurações), a transcrição vira o texto da mensagem e o áudio fica anexado para ouvir.
- Opção "Responder com áudio quando eu enviar áudio" no cadastro do agente. Marcada: uma mensagem de voz recebe resposta em áudio, tocada automaticamente. Desmarcada (padrão): a resposta é sempre em texto. Mensagens digitadas sempre recebem texto.
- Voz da resposta: modelo e voz de síntese do 9router em Configurações, com "Testar voz". Sem modelo de síntese, o próprio aparelho lê a resposta em português ("Ouvir resposta").
- Logotipos oficiais dos aplicativos no catálogo (Notion, Gmail, Google Drive, Agenda, Tarefas, Todoist, Linear, Jira), do Simple Icons (CC0). O Canva continua com a inicial.
- Migração `0016_voice`.

### Corrigido
- Conectar o Notion (e outros aplicativos) pelo app instalado no Android falhava com "Grant not found or authorization code expired": o Android entrega o retorno da autorização duas vezes e o código só vale uma vez. A segunda entrega agora reaproveita o resultado da primeira.

### Segurança
- `Permissions-Policy` libera o microfone só para o próprio site (`microphone=(self)`).

### Como foi verificado
- **Real:** transcrição pelo 9router (`cx/transcribe`) de um WAV e de uma gravação WebM/Opus do Chrome. Duplicação do retorno do Notion confirmada nos logs de produção (mesmo código recebido duas vezes, com 3 s de intervalo).
- **Simulado:** teste de integração com transcrição e síntese falsas (resposta em texto ou áudio conforme o agente, sem modelo de síntese, áudio servido inline, formato recusado) e retorno OAuth repetido em paralelo e depois. Testes de navegador com microfone falso: gravar, cancelar, mensagens de áudio, opção do agente e logotipos.
- **Não verificado:** síntese de voz real, porque os modelos de voz do 9router atual falham (o aparelho lê a resposta até um provedor de voz ser configurado no 9router).

## [0.15.1] - 2026-10-27

### Corrigido
- Os servidores MCP do Google listam ferramentas sem login, então o Gmail, o Drive e a Agenda podiam aparecer como conectados sem autorização (e todas as chamadas falhariam). Os aplicativos do catálogo agora iniciam a autorização antes de listar as ferramentas.

## [0.15.0] - 2026-10-27

### Adicionado
- Catálogo de aplicativos com conexão em um clique (OAuth com registro automático do cliente): Notion, Canva, Todoist, Linear e Jira/Confluence. Cartões com estado, número de ferramentas, Reconectar, Desconectar e Ferramentas e permissões.
- Google: configuração única guiada (comando das APIs, URI de redirecionamento para copiar, Client ID e Client Secret cifrado) e conexão em um clique para Gmail, Google Drive e Google Agenda (servidores MCP oficiais do Google, em prévia).
- Google Tarefas integrado nativamente: listar listas e tarefas, criar, concluir e excluir, com renovação automática do token; escritas pedem aprovação e o modo `/plan` só libera a leitura.
- Ferramentas dos aplicativos do catálogo ficam disponíveis para todos os agentes; as de leitura são detectadas pela anotação `readOnlyHint` do MCP (ou pelo nome) e as demais exigem aprovação.
- Endereço único de retorno OAuth (`/api/connections/oauth/callback`), protegido pelo `state` e sem exigir sessão, para concluir a conexão mesmo iniciando pela rede local. Ao voltar, o Cell mostra o resultado e abre o painel.
- Migração `0015_connector_catalog`.

### Como foi verificado
- **Simulado:** teste de integração com servidores OAuth falsos de comportamento real: registro dinâmico, PKCE, retorno sem sessão, `state` forjado recusado, ferramentas liberadas para todos com leitura/escrita classificadas, chamada autenticada; servidor estilo Google com cliente estático e escopos; Google Tarefas com troca de código, renovação de token, criar/listar/concluir e restrição no `/plan`. Testes de navegador do catálogo e do guia do Google em cinco larguras.
- **Não verificado:** conexão real com Notion, Canva, Todoist, Linear, Atlassian e Google, que exige suas contas. Os servidores do Google estão em prévia e podem exigir participação no programa de prévia do Google Workspace.

## [0.14.0] - 2026-10-27

### Adicionado
- Notificações por agente: "Receber notificações deste agente" no editor e botão no painel do agente; agentes silenciados não geram push, aviso no app nem item no sino, e aparecem com um sino cortado na lista.
- Sino de notificações no cabeçalho: mensagens não lidas dos agentes (inclusive de rotinas) e aprovações pendentes, com "Marcar como lidas" e atalho para configurar; tocar num item abre a conversa.
- Avisos dentro do app quando chega mensagem de outra conversa, com **Abrir** e **Dispensar**.
- Contagem de não lidas no título da aba e no ícone do app instalado (onde o sistema suporta).
- Convite discreto para ativar as notificações em cada aparelho que ainda não as recebe ("Agora não" é lembrado).
- `GET /api/notifications`, `POST /api/notifications/read-all`, `POST /api/agents/:id/notify`; migração `0014_agent_notify`.

### Corrigido
- Uma aba do Cell aberta em segundo plano marcava a conversa como lida e impedia o push no celular e no computador. Agora a conversa só é marcada como lida com a tela visível (e é atualizada quando a aba volta a ficar visível).

## [0.13.1] - 2026-10-27

### Corrigido
- A Cloudflare guardava o `sw.js` em cache por até 4 horas, atrasando atualizações do app e das notificações nos aparelhos. O Caddy agora envia `Cache-Control: no-cache` para `sw.js` e `manifest.webmanifest`.

## [0.13.0] - 2026-10-27

### Adicionado
- Notificações push (Web Push) no celular e no computador: avisam quando um agente ou uma rotina envia mensagem e quando uma ação precisa de aprovação. Tocar no aviso abre o Cell direto na conversa (ou traz o app aberto para a frente).
- Configurações → Notificações: ativar e desativar por aparelho, enviar teste e ver ou remover os aparelhos inscritos. Sair da conta desativa o aparelho.
- O aviso só sai se a mensagem continuar sem leitura 10 segundos depois; com a conversa aberta em algum aparelho, nada é enviado.
- Chaves VAPID geradas uma vez por instalação (privada cifrada com a `SECRET_KEY`); inscrições expiradas (404/410) ou com falhas repetidas são removidas.
- Ícone monocromático para a barra de status do Android.
- Migração `0013_web_push`.

### Como foi verificado
- **Simulado:** teste de integração com um serviço de push falso que recebe a entrega real gerada pela biblioteca `web-push`; a notificação é decifrada com a chave do "aparelho" e conferida (título, texto, link e etiqueta), além de VAPID, assinatura expirada removida, conversa aberta sem aviso e recusa de endereços sem HTTPS. Testes de navegador do painel em cinco larguras.
- **Não verificado:** a entrega pelo serviço de push real do Google até um celular. O Chrome controlado por automação recusa a inscrição ("permission denied"), então essa etapa depende do botão **Enviar teste** em um aparelho de verdade.

## [0.12.0] - 2026-10-27

### Corrigido
- Rotinas propostas por um agente ficavam desativadas sem que isso ficasse visível: a ativação existia só na aba Rotinas do painel do agente. Agora a proposta aparece como um cartão na própria conversa, com **Ativar rotina** e **Descartar**; depois de ativada, o cartão mostra a próxima mensagem e permite **Pausar**.
- A rotina respondia numa conversa nova ("Rotina: …") mesmo quando o pedido era "me mande uma mensagem aqui". Agora ela responde na conversa em que foi proposta (se ainda existir e não estiver arquivada) e o disparo aparece como "Rotina agendada", não como mensagem sua. A execução manual segue a mesma regra.
- Uma rotina atrasada mais de 2 minutos (servidor ou PC desligado no horário, deploy) era descartada como perdida. Agora ela roda uma vez se o atraso for de até 2 horas; acima disso é registrada como perdida, sem acumular execuções.
- Rotinas do tipo "uma vez" sempre se encerram depois de disparar.

### Adicionado
- `POST /api/routines/:id/enabled` para ativar ou pausar (recalcula o próximo horário; recusa datas que já passaram).
- Migração `0012_routine_conversation`: rotinas guardam a conversa de origem; as já propostas por agentes são ligadas à conversa onde foram pedidas.

## [0.11.0] - 2026-10-27

Plano de confiabilidade e acompanhamento dos agentes (iniciado pelo Codex, revisado e concluído nesta versão).

### Corrigido
- Contexto montado quando a execução começa: mensagens enviadas em sequência agora veem as respostas anteriores já concluídas, e anexos de mensagens anteriores voltam ao contexto dentro dos limites de texto, imagens e capacidade do modelo.
- Rotinas interrompidas durante o despacho são retomadas sem duplicar a tarefa; uma rotina cujo despacho falha (ex.: agente arquivado) registra a falha e é pausada, em vez de ser tentada a cada 10 segundos.
- Ferramentas pendentes são executadas mesmo ao atingir o limite de etapas; a última chamada ao modelo vai sem ferramentas, para fechar a resposta.
- Conclusão e cancelamento não se sobrescrevem mais: a conclusão só vale se a execução ainda estiver rodando, e o evento enviado à interface sai na mesma transação.
- Delegações simultâneas cruzadas (A → B e B → A) não travam mais a fila.
- Erro explícito retornado por uma ferramenta MCP encerra a chamada como erro, sem pedir nova aprovação; só resultados desconhecidos (queda, timeout) exigem revisão.
- Modo `/plan` persistido em cada execução e restrito no servidor a pesquisa e leitura; a instrução de planejamento não se repete mais ao retomar.
- O painel do agente mostra o mesmo estado real do cabeçalho e da lista.
- Uma falha temporária (limite de requisições, servidor reiniciando) não leva mais à tela de login; só "não autenticado" encerra a sessão.

### Segurança
- `CF-Connecting-IP` só é aceito do proxy autorizado: com `CELL_PROXY_SECRET` (cabeçalho injetado por regra da Cloudflare) ou dos endereços em `TRUSTED_PROXIES`.
- Limite geral de requisições: 1200/min com sessão, 120/min sem sessão (o login segue em 10 a cada 15 min).

### Adicionado
- Central de atividade com execuções, fila, aprovações e falhas; filtros por agente e estado; detalhes com modelo, duração, tokens, ferramentas, documentos, arquivos e árvore de delegações; aprovar, negar e cancelar.
- Configurações → Diagnóstico: worker, banco, fila, execuções paradas, 9router, MCP e confiança no proxy, sem segredos. Heartbeat do worker e das execuções.
- Memória do agente e resumo da conversa editáveis, com histórico de versões e origem; o resumo automático preserva as decisões anteriores.
- "Documentos usados" sob cada resposta.
- `npm run backup:verify`: restauração isolada e verificação de integridade do backup; `backup.ps1` grava as contagens no manifesto.
- `npm run test:e2e`: testes de navegador em 360, 390, 768, 1024 e 1440 px.
- Migração `0011_reliability`.

### Como foi verificado
- **Simulado:** 47 testes de integração com 9router e servidor MCP simulados e PostgreSQL temporário (interrupção do agendador, mensagens consecutivas, limite de uma etapa, delegações simultâneas, cancelamento durante a conclusão, erro MCP, restrições do `/plan`, cabeçalhos de IP falsificados, anexos entre mensagens, atualização de resumo); 27 testes de navegador em pilha isolada com dados semeados.
- **Real:** backup da produção restaurado em banco isolado e conferido (contagens e arquivos), além de cópias adulteradas recusadas; após o deploy, migração e endpoints novos conferidos no servidor e no domínio público.

## [0.10.0] - 2026-10-27

### Corrigido
- Mensagem da tela offline do Service Worker (sw.js): corrigida codificação de caracteres com charset=utf-8 no cabeçalho Content-Type, meta tag charset e entidades HTML seguras, eliminando erros de acentuação (Cell está offline).
- Cache do Service Worker atualizado para cell-shell-v4 com suporte a ícone e layout Cell.

### Adicionado
- Sistema de comandos slash ("/") no compositor com menu suspenso interativo: `/clean`, `/imagem`, `/plan`, `/new`, `/search`, `/settings` e `/help`.
- Indicador luminoso LED verde pulsante (`.state-dot.running`) no avatar da célula enquanto um agente está em execução, com suporte a acessibilidade (`prefers-reduced-motion`).
- Vinculação direta das chamadas de ferramentas à respectiva mensagem de resposta do assistente (componente `ToolActivityCard`), em vez de acumular todas em um único bloco ao final da conversa.
- Migração `0010_message_run_id` adiciona `run_id` à tabela `messages` e vincula o histórico existente.

### Modificado
- Placeholder do campo de mensagem simplificado para 'Envie uma mensagem'.
- Ações de "Conectar aplicativos" e "Habilidades" movidas da barra lateral para dentro do submenu do usuário (junto a Configurações e Agentes arquivados), simplificando a barra lateral e otimizando o espaço da lista de agentes.
- Ícone principal do aplicativo padronizado com o ícone do Coordenador (célula animal em tom claro #f1f0e9) na tela de loading, tela de login, wordmark da barra lateral e em todos os assets de PWA/atalhos: icon.svg, icon-192.png, icon-512.png, icon-maskable-512.png e apple-touch-icon.png.
- Modo mobile: ações de arquivar conversa e histórico de conversas tornadas visíveis e acessíveis no cabeçalho.
- Modo mobile: gaveta lateral da lista de agentes expandida para ocupar 100% da tela (`max-width: 100vw; inset: 0`), eliminando a fresta lateral do chat e incluindo botão de fechar.

### Restaurado
- Restaurados os ícones biológicos padrão do sistema: o Coordenador volta a usar a célula Animal em tom claro (#f1f0e9), o avatar padrão do sistema volta a ser a Ameba com organelas (#b3efbc) e os 12 tipos clássicos de células ficam disponíveis.
- Migração `0009_restore_cell_icons` restaura o Coordenador e agentes ao formato clássico de células.

## [0.9.0] - 2026-10-27

### Alterado
- O Coordenador usa o mesmo ícone do aplicativo (a célula verde do logo). O novo tipo de célula "Cell" é reservado ao agente principal; o logo da barra lateral e a tela de login também passaram a usar exatamente esse desenho.
- Migração `0008_master_app_icon` aplica o ícone e a cor ao Coordenador existente.

## [0.8.1] - 2026-10-27

### Corrigido
- Modelos de raciocínio (ex.: "FREE" = DeepSeek R1) mostravam o pensamento `<think>…</think>` na conversa. Agora só a resposta final aparece, tanto ao vivo quanto na mensagem salva, na prévia da barra lateral e ao copiar; mensagens antigas também são filtradas na exibição.
- Respostas que se esgotavam só raciocinando eram salvas pela metade. As chamadas passam a enviar um limite explícito de tokens, e uma resposta sem texto final vira um erro claro explicando o motivo.
- Erros da fila de execução agora registram a causa no log.

### Adicionado
- Configurações → Execução → "Máximo de tokens por resposta" (padrão 4096).

## [0.8.0] - 2026-10-27

### Segurança
- O limite de tentativas de login era compartilhado por todos (o servidor via só o IP do Caddy): 7 erros de qualquer pessoa bloqueavam o login de todos. Agora o limite é por IP real do visitante, com `CF-Connecting-IP` aceito apenas vindo de um endereço local (túnel da Cloudflare), e ficou em 10 tentativas a cada 15 minutos.
- Login com usuário inexistente leva o mesmo tempo que com senha errada (não revela usuários válidos); tentativas recusadas são registradas com o IP.
- Cookie de sessão com prefixo `__Host-` (preso a este domínio, só HTTPS). Todos os aparelhos precisam entrar de novo uma vez.
- Erros de banco de dados e falhas internas não são mais devolvidos ao navegador; ficam só no log do servidor.
- Cabeçalhos: HSTS, Permissions-Policy, Cross-Origin-Opener-Policy e `X-Robots-Tag: noindex`; removidos `Server` e `Via` e os cabeçalhos duplicados. Corpo de requisição limitado a 30 MB no Caddy.

### Adicionado
- Configurações → Conta → "Sair de todos os outros dispositivos".
- Ícones PNG (192, 512, maskable e apple-touch) para instalar o Cell como app no Android.
- `npm run test:db`: roda os testes em um PostgreSQL temporário, removido ao final.
- README: publicação pela Cloudflare (túnel, Access, ajustes que quebram a CSP) e instalação no Android.

## [0.7.0] - 2026-10-27

### Adicionado
- Botão "Arquivar conversa" no cabeçalho: a conversa atual fica salva no histórico e uma nova conversa começa do zero (sem o contexto da anterior). Pede confirmação e fica desativado durante tarefas em andamento.
- Ícone de histórico lista as conversas ativas e, em seção própria, as arquivadas, com data do arquivamento e número de mensagens.
- Conversas arquivadas abrem em modo leitura, com opções "Restaurar" e "Voltar à conversa atual". A API recusa novas mensagens nelas.
- Migração `0007_archived_conversations`.

## [0.6.2] - 2026-10-27

### Corrigido
- Agentes não sabiam a data atual e pesquisavam períodos antigos (ex.: "abril 2025"). O contexto de cada execução agora traz data e hora atuais no fuso configurado, com a orientação de usá-las em buscas sobre fatos recentes.

## [0.6.1] - 2026-10-27

### Alterado
- Confirmações e campos de nome usam SweetAlert2 (`Swal.fire`) com o tema do Cell, no lugar de `confirm`/`prompt` nativos; os helpers ficam em `apps/web/src/dialogs.ts`.

## [0.6.0] - 2026-10-27

### Adicionado
- Geração de imagens pelo 9router (`generate_image`, via `/v1/images/generations?response_format=binary`): a imagem é salva na biblioteca e aparece dentro da resposta do agente, com link para baixar. Habilitada para todos os agentes.
- Escolha do modelo de imagem em Configurações → 9router (padrão: o primeiro disponível).
- Seções na barra lateral: criar, renomear e excluir (vazias) pelo menu "…" de cada seção ou pelo botão "Nova seção"; o editor do agente sugere as seções existentes.
- Segurar e arrastar para reordenar agentes (inclusive entre seções) e seções; com o mouse basta arrastar. A lista rola sozinha perto das bordas e a ordem é salva ao soltar.

### Alterado
- Agente fixado único fica centralizado no topo; a ordem dos fixados segue a ordem da lista.
- Leitura de páginas (`web_fetch`) envia `format: markdown` e limite de 30 mil caracteres, conforme a documentação do 9router.

### Corrigido
- Execuções interrompidas por reinício do worker (por exemplo, durante uma atualização) ficavam presas em "Trabalhando"; agora voltam para a fila quando o worker inicia.

## [0.5.0] - 2026-10-26

### Adicionado
- Coordenador como agente principal: não pode ser arquivado nem excluído (pela interface ou pela API) e recebe as ferramentas `create_agent` e `delete_agent`.
- `create_agent` cria agentes com nome, cargo e descrição obrigatórios (instruções, tipo de célula e cor opcionais); recusa nomes repetidos.
- `delete_agent` exclui um agente e suas conversas somente após aprovação do usuário, conferindo id e nome; nunca exclui o Coordenador.
- Selo "Agente principal" no painel de detalhes.

### Alterado
- Campo "Função" passa a se chamar "Cargo" e é obrigatório; a descrição ganhou um texto de exemplo.
- Migração `0005_master_agent` marca o Coordenador como agente principal.

## [0.4.0] - 2026-10-26

### Corrigido
- Avisos de erro apareciam sempre no fim da conversa, parecendo recentes. Agora ficam logo após a mensagem que os causou, com data e hora.

### Adicionado
- Excluir avisos de erro (lixeira no aviso; `DELETE /api/runs/:id`, só para execuções com erro ou canceladas).
- Excluir mensagens da conversa (lixeira nas ações da mensagem, com confirmação; `DELETE /api/messages/:id`). Mensagens excluídas deixam de entrar no contexto do agente.

## [0.3.0] - 2026-10-26

### Adicionado
- Novos ícones dos agentes inspirados em tipos de células: Animal, Vegetal, Bacilo, Coco, Neurônio, Hemácia, Ameba, Paramécio, Euglena, Diatomácea, Levedura e Leucócito. Membrana e organelas acompanham a cor escolhida.
- Fixar e desafixar agentes direto pela lista lateral (ícone de alfinete) e pelo painel de detalhes; só os fixados aparecem no topo.
- Atalho "Célula e cor" no painel de detalhes abre o editor na aba de aparência.

### Alterado
- Agentes padrão de novas instalações: só o Coordenador vem fixado.
- Migração `0004_cell_types` converte as formas antigas (circular, oval, cápsula…) para os novos tipos de célula.

## [0.2.0] - 2026-10-26

### Corrigido
- Conversas falhavam com "Streaming interrompido antes da conclusão." mesmo com a resposta do modelo recebida: o 9router encerra o stream com `finish_reason` sem enviar `data: [DONE]`. Os dois sinais agora são aceitos como fim da resposta; streams cortados sem nenhum deles continuam gerando erro.
- `setup.ps1` rejeitava senhas iniciadas por `!`.

### Adicionado
- Versionamento: versão única no `package.json` da raiz, exibida no menu do usuário e em `GET /api/health`; imagens Docker marcadas com a versão (`cell-server:X.Y.Z`, `cell-web:X.Y.Z`).
- `npm run release -- patch|minor|major` gera a versão (atualiza os `package.json`, data o CHANGELOG, faz commit e cria a tag `vX.Y.Z`).
- `scripts/deploy.ps1` publica no Docker a versão atual.
- README com instalação, configuração de senha, certificado, backup e versionamento.

## [0.1.0] - 2026-10-26

### Adicionado
- Primeira versão: agentes com memória, skills e ferramentas MCP, conversas com streaming, delegação entre agentes, aprovações de escrita externa, rotinas agendadas, biblioteca de arquivos e deploy com Docker Compose + Caddy (HTTPS).
- Acesso pela rede local: `APP_ORIGIN` aceita vários endereços e o Caddy responde por IP (`default_sni`).
