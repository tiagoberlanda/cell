# Changelog

Todas as mudanças relevantes do Cell ficam registradas aqui.
O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e as versões seguem o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Adicionado
- Sistema de comandos slash ("/") no compositor com menu suspenso interativo: `/clean`, `/imagem`, `/plan`, `/new`, `/search`, `/settings` e `/help`.
- Indicador luminoso LED verde pulsante (`.state-dot.running`) no avatar da célula enquanto um agente está em execução, com suporte a acessibilidade (`prefers-reduced-motion`).
- Vinculação direta das chamadas de ferramentas à respectiva mensagem de resposta do assistente (componente `ToolActivityCard`), em vez de acumular todas em um único bloco ao final da conversa.
- Migração `0010_message_run_id` adiciona `run_id` à tabela `messages` e vincula o histórico existente.

### Modificado
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
