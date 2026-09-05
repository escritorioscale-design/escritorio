import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  engine: "classic",
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://orbit:orbit@localhost:54320/orbit",
  },
});
