import "server-only";
import { PrismaClient } from "./generated/client";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://orbit:orbit@localhost:54320/orbit";
const globalForPrisma = globalThis as unknown as { orbitPrisma?: PrismaClient };

export const db =
  globalForPrisma.orbitPrisma ?? new PrismaClient({ datasourceUrl: connectionString });

if (process.env.NODE_ENV !== "production") globalForPrisma.orbitPrisma = db;

export * from "./generated/client";
