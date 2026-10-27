# Changelog

Todas as mudanças relevantes do Cell ficam registradas aqui.
O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e as versões seguem o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Não lançado]

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
