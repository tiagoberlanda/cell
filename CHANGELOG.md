# Changelog

Todas as mudanças relevantes do Cell ficam registradas aqui.
O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e as versões seguem o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Não lançado]

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
