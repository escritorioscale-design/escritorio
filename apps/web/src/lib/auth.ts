import "server-only";
import { db } from "@orbit/db";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";

const isBuild = process.env.NEXT_PHASE === "phase-production-build";
const configuredSecret = process.env.BETTER_AUTH_SECRET;

if (!configuredSecret && process.env.NODE_ENV === "production" && !isBuild) {
  throw new Error("BETTER_AUTH_SECRET is required in production");
}

export const auth = betterAuth({
  appName: "Orbit",
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3100",
  secret: configuredSecret ?? "orbit-local-development-secret-change-me",
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  plugins: [
    organization({
      allowUserToCreateOrganization: true,
      creatorRole: "owner",
      membershipLimit: 500,
    }),
    nextCookies(),
  ],
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
  },
});
