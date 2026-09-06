import { randomBytes } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webEnvPath = path.join(root, "apps", "web", ".env.local");
const realtimeEnvPath = path.join(root, "apps", "realtime", ".env");
const dbEnvPath = path.join(root, "packages", "db", ".env");
const targets = [webEnvPath, realtimeEnvPath, dbEnvPath];

async function exists(file) {
  try {
    await access(file, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

if ((await Promise.all(targets.map(exists))).some(Boolean)) {
  console.log("Setup preservado: um ou mais arquivos de ambiente já existem.");
  console.log("Apague apenas os .env locais se quiser regenerar todos os secrets em conjunto.");
  process.exit(0);
}

const authSecret = randomBytes(48).toString("base64url");
const realtimeSecret = randomBytes(48).toString("base64url");
const databaseUrl = "postgresql://orbit:orbit@localhost:54320/orbit";

await Promise.all([
  mkdir(path.dirname(webEnvPath), { recursive: true }),
  mkdir(path.dirname(realtimeEnvPath), { recursive: true }),
  mkdir(path.dirname(dbEnvPath), { recursive: true }),
]);

await writeFile(webEnvPath, [
  `BETTER_AUTH_URL=http://localhost:3100`,
  `BETTER_AUTH_SECRET=${authSecret}`,
  `DATABASE_URL=${databaseUrl}`,
  `REALTIME_TOKEN_SECRET=${realtimeSecret}`,
  `NEXT_PUBLIC_REALTIME_URL=http://localhost:3101`,
  `NEXT_PUBLIC_MEDIA_PROVIDER=livekit`,
  `LIVEKIT_URL=ws://localhost:7880`,
  `NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880`,
  `LIVEKIT_API_KEY=devkey`,
  `LIVEKIT_API_SECRET=devsecretdevsecretdevsecret`,
  "",
].join("\n"), { flag: "wx" });

await writeFile(realtimeEnvPath, [
  `REALTIME_TOKEN_SECRET=${realtimeSecret}`,
  `MEDIA_PROVIDER=livekit`,
  `CLOUDFLARE_REALTIME_APP_ID=`,
  `CLOUDFLARE_REALTIME_APP_SECRET=`,
  `REDIS_URL=redis://localhost:6379`,
  `WEB_ORIGIN=http://localhost:3100`,
  `PORT=3101`,
  `NODE_ENV=development`,
  "",
].join("\n"), { flag: "wx" });

await writeFile(dbEnvPath, `DATABASE_URL=${databaseUrl}\n`, { flag: "wx" });

console.log("Ambiente local criado com secrets aleatórios.");
console.log("Web:      http://localhost:3100");
console.log("Realtime: http://localhost:3101/health");
