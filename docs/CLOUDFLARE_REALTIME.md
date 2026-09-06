# Cloudflare Realtime SFU

The proximity-media integration can run on Cloudflare Realtime while regular
meeting rooms remain on LiveKit during the migration period.

## Secret handling

Create separate Cloudflare Realtime SFU applications for development and
production. If an App Secret is ever pasted into a chat, ticket, commit, or
client-side variable, rotate it before use.

The App Secret belongs only on the realtime gateway. Never add it to a
`NEXT_PUBLIC_` variable or return it to the browser.

## Local development

Add this to `apps/realtime/.env`:

```ini
MEDIA_PROVIDER=cloudflare
CLOUDFLARE_REALTIME_APP_ID=<development-app-id>
CLOUDFLARE_REALTIME_APP_SECRET=<new-development-app-secret>
```

Add this to `apps/web/.env.local`:

```ini
NEXT_PUBLIC_MEDIA_PROVIDER=cloudflare
```

Keep the existing LiveKit variables during the transition because the
full-screen meeting-room UI still uses LiveKit.

## Preview deployment

On the Render realtime service, add the three server variables from the local
realtime example above, using the development Cloudflare application. On the
Vercel Preview environment, add only:

```ini
NEXT_PUBLIC_MEDIA_PROVIDER=cloudflare
```

Redeploy both services. Test with two distinct authenticated users in separate
browsers. Confirm that:

1. No camera or microphone permission is requested while each user is alone.
2. Moving into range connects the media layer.
3. Audio is received only inside the applicable proximity/table area.
4. Camera activation is manual and video stops after leaving the area.
5. A fourth nearby camera remains a photo/initial tile instead of being pulled.

## Production rollout

After Preview succeeds, use the production Cloudflare App ID and a newly
generated production App Secret on the production Render service. Set
`NEXT_PUBLIC_MEDIA_PROVIDER=cloudflare` in Vercel Production and redeploy.

Rollback is immediate: set the web variable back to `livekit`, redeploy the web
application, and leave the LiveKit environment variables in place.

## Current scaling boundary

The realtime gateway keeps the active Cloudflare track catalog in process
memory. This is intentional for the current single-instance deployment. Before
running more than one realtime instance, move that catalog to Redis and publish
catalog changes between instances.
