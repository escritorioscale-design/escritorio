import "server-only";

const adminEmails = new Set(
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

export function isPlatformAdmin(email: string) {
  return adminEmails.has(email.toLowerCase());
}
