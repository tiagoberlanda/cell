# Changelog

Todas as mudanças relevantes do Cell ficam registradas aqui.
O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e as versões seguem o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Não lançado]

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
