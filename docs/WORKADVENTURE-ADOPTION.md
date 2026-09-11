# WorkAdventure architecture adoption

Orbit uses WorkAdventure as a product and architecture benchmark, not as a
code dependency or source-code donor.

## Adopted in Orbit

- Map behaviours are data rather than conditionals tied to one map.
- Rectangular areas can combine several effects.
- Entry into an area changes media behaviour and can expose a contextual
  action.
- The map editor owns the same persisted representation consumed at runtime.
- Durable product data, live world state and media traffic stay separated.

## Intentionally not copied

WorkAdventure's production stack includes several independently deployed
services and supports Docker Compose or Kubernetes. Orbit keeps its smaller
Next.js + Socket.IO + Redis + managed media topology because it matches the
existing Vercel/Render/Neon deployment and current scale.

The relevant WorkAdventure packages are licensed under AGPLv3 with a Commons
Clause. Orbit therefore implements the ideas independently and does not copy
their source. Any future direct reuse needs a separate licensing decision.

## Next safe steps

1. Move occupancy and restricted-area decisions to the realtime gateway.
2. Publish map revisions so connected clients receive editor changes without a
   page reload.
3. Store large maps and custom assets in object storage/CDN.
4. Add server-observed area enter/leave events for analytics and automation.

Reference: <https://github.com/workadventure/workadventure>
