import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

function safeList(dir: string) {
  try {
    return existsSync(dir) ? readdirSync(dir) : null;
  } catch (e) {
    return `error: ${(e as Error).message}`;
  }
}

export async function GET() {
  const candidates = [
    "/var/task/node_modules/@prisma/client/runtime",
    path.join(process.cwd(), "node_modules/@prisma/client/runtime"),
    path.join(__dirname, "../../../../node_modules/@prisma/client/runtime"),
  ];

  let requireResult: unknown;
  try {
    const resolved = require.resolve("@prisma/client/runtime/query_compiler_bg.postgresql.wasm");
    requireResult = { ok: true, resolved };
  } catch (e) {
    requireResult = { ok: false, error: (e as Error).message, stack: (e as Error).stack };
  }

  return Response.json({
    cwd: process.cwd(),
    dirname: __dirname,
    candidates: candidates.map((c) => ({ path: c, contents: safeList(c) })),
    requireResult,
  });
}
