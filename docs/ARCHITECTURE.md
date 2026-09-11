# Orbit architecture

Orbit separates durable product data, ephemeral world state, and media traffic.
This prevents a video spike from degrading movement or authentication.

```text
Browser
  |-- HTTPS ------------> Next.js web/BFF ----> PostgreSQL
  |                         |  auth + RBAC
  |                         |  short-lived grants
  |-- WebSocket ---------> Realtime gateway --> Redis
  |-- WebRTC ------------> LiveKit SFU -------> Redis
```

## Trust boundaries

- The browser never receives database, auth, Redis, or LiveKit secrets.
- Every protected HTTP request resolves a server-side Better Auth session.
- Workspace access is checked through organization membership before issuing
  realtime or LiveKit grants.
- Realtime tokens expire after five minutes and only authorize one workspace.
- LiveKit identities and room names use opaque database IDs, never email or PII.

## Scaling path

- Run multiple stateless Next.js containers behind an HTTP load balancer.
- Run multiple realtime instances behind a WebSocket-capable load balancer; the
  Socket.IO Redis adapter fans events across nodes.
- Use managed PostgreSQL with pooling and automated backups.
- Start on LiveKit Cloud or run a regional LiveKit cluster. Distributed LiveKit
  uses Redis for room state and its message bus.
- Store maps and avatar assets in object storage/CDN, not PostgreSQL.

## Domain ownership

- Better Auth owns users, sessions, accounts, organizations, memberships and
  invitations.
- Orbit owns workspaces, spaces, rooms, map versions, meetings, messages and
  audit logs.
- Redis owns online presence and live positions. PostgreSQL stores only durable
  snapshots and configuration.

## Data-driven map areas

`Space.mapData` stores rooms, furniture and rectangular interaction zones. A
zone owns geometry plus one or more composable effects instead of requiring a
new hardcoded room type for each behaviour:

- `CONVERSATION` turns the area into one isolated voice bubble.
- `SILENT` disconnects proximity media while a participant is inside.
- `OPEN_LINK` exposes a contextual, http(s)-only action in the map UI.

The browser evaluates these effects from the same layout used by rendering and
audio subscriptions. Layout JSON from before zones existed is normalized with
an empty `zones` collection, so the change needs no PostgreSQL migration.

These effects are experience rules, not authorization boundaries. Future
restricted areas or capacity limits must be enforced by the realtime gateway
using server-owned map data; client collision alone is not security.

## Deployment fit

The area model adds no service to the production topology. Next.js remains on
Vercel, durable layout JSON remains in Neon/PostgreSQL, Socket.IO remains on the
WebSocket-capable realtime host, Redis remains the ephemeral coordination
layer, and media can continue on LiveKit or Cloudflare Realtime.
