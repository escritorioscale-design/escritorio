# Orbit

Escritório virtual multiusuário com presença em tempo real, chamadas por
proximidade, reuniões e compartilhamento de tela.

## Stack

- Next.js 16, React 19 e TypeScript
- Better Auth com organizações, membros, convites e papéis
- PostgreSQL e Prisma
- Socket.IO com Redis Adapter para presença e movimento
- LiveKit SFU para áudio, vídeo e screen sharing

A separação de responsabilidades e os limites de confiança estão documentados
em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Desenvolvimento local

Requisitos: Node.js 20.9+, Docker Desktop e npm.

1. Gere os arquivos locais e secrets automaticamente:

   ```bash
   npm run setup:dev
   ```

2. Abra o Docker Desktop e inicie PostgreSQL, Redis e LiveKit:

   ```bash
   npm run infra:up
   ```

   O PostgreSQL do Orbit usa a porta local `54320` para não conflitar com
   instalações existentes na porta padrão `5432`.

3. Aplique a migration inicial e gere o client:

   ```bash
   npm run db:migrate
   npm run db:generate
   ```

4. Em terminais separados, inicie o gateway e o app:

   ```bash
   npm run dev:realtime
   npm run dev:web
   ```

O app abre em `http://localhost:3100`. O gateway expõe healthcheck em
`http://localhost:3101/health`.

## Qualidade

```bash
npm run typecheck
npm run build
npm audit --omit=dev
```

O build gera uma aplicação Next.js standalone e um serviço realtime compilado
em `apps/realtime/dist`.

## Produção

- Use secrets exclusivos e rotacionáveis; nunca os valores locais do Compose.
- Use PostgreSQL gerenciado com pool de conexões e backups automáticos.
- Exponha web e realtime apenas por TLS (`https`/`wss`).
- Para múltiplas instâncias realtime, Redis é obrigatório.
- Use LiveKit Cloud ou um cluster LiveKit regional. Não publique as portas de
  mídia do Compose local diretamente na internet.
- Adicione observabilidade, rate limiting no edge e filas para e-mail/auditoria
  antes de abrir cadastro público.
