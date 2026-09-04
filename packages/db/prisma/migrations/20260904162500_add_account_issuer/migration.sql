-- Better Auth 1.7 scopes every account identity by issuer.
ALTER TABLE "account" ADD COLUMN "issuer" TEXT NOT NULL;

CREATE UNIQUE INDEX "account_issuer_accountId_key"
ON "account"("issuer", "accountId");
