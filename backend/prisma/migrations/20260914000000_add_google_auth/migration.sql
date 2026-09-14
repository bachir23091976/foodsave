BEGIN;
-- Fail without changing identities if the new uniqueness policy finds collisions.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "User" GROUP BY lower("email") HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Canonical email collisions require explicit investigation';
  END IF;
END $$;
ALTER TABLE "User" ADD COLUMN "canonicalEmail" TEXT;
UPDATE "User" SET "canonicalEmail" = lower("email");
ALTER TABLE "User" ALTER COLUMN "canonicalEmail" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "canonicalEmail" SET DEFAULT '';
-- Every writer uses the same policy, including existing registration code.
CREATE FUNCTION foodsave_canonical_email() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."canonicalEmail" := lower(NEW."email");
  RETURN NEW;
END $$;
CREATE TRIGGER foodsave_canonical_email BEFORE INSERT OR UPDATE ON "User"
FOR EACH ROW EXECUTE FUNCTION foodsave_canonical_email();
ALTER TABLE "User" ADD CONSTRAINT "User_canonicalEmail_matches" CHECK ("canonicalEmail" = lower("email"));
CREATE UNIQUE INDEX "User_canonicalEmail_key" ON "User"("canonicalEmail");
ALTER TABLE "User" ALTER COLUMN "password" DROP NOT NULL;
CREATE TABLE "ExternalIdentity" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "provider" TEXT NOT NULL,
  "issuer" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ExternalIdentity_provider_issuer_subject_key" ON "ExternalIdentity"("provider", "issuer", "subject");
CREATE INDEX "ExternalIdentity_userId_idx" ON "ExternalIdentity"("userId");
CREATE TABLE "GoogleAuthTransaction" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "stateHash" TEXT NOT NULL,
  "browserHash" TEXT NOT NULL,
  "nonce" TEXT NOT NULL,
  "pkceVerifier" TEXT NOT NULL,
  "frontendChallenge" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "authorizedAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "handoffHash" TEXT,
  "completedAt" TIMESTAMP(3),
  "userId" TEXT,
  "errorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "GoogleAuthTransaction_stateHash_key" ON "GoogleAuthTransaction"("stateHash");
CREATE UNIQUE INDEX "GoogleAuthTransaction_handoffHash_key" ON "GoogleAuthTransaction"("handoffHash");
CREATE INDEX "GoogleAuthTransaction_expiresAt_idx" ON "GoogleAuthTransaction"("expiresAt");
COMMIT;
