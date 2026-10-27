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

## Backup e restauração

```powershell
.\scripts\backup.ps1                       # cria backups/AAAAMMDD-HHmmss
.\scripts\restore.ps1 -Backup .\backups\20261026-120000
```

O backup para a API, o worker e a web por alguns segundos, exporta o banco e os arquivos e depois os reinicia. Guarde o `.env` separadamente: a restauração exige a mesma `SECRET_KEY`, pois os tokens e as credenciais são criptografados com ela.

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

Testes (o de integração só roda com um banco descartável cujo nome termina em `_test`):

```powershell
$env:TEST_DATABASE_URL = 'postgres://cell:cell-test-only@127.0.0.1:55439/cell_test'; npm test
```
