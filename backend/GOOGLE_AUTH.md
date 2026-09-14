# GOOGLE-AUTH-1 operations

Customer only. No account linking, replacement accounts, or merchant/admin Google login.
An existing canonical email returns `auth.googleCollision`; use the existing login method.
Returning identities use GOOGLE + canonical issuer + subject. Provider email changes never
change the stored FoodSave email or role. Apple remains disabled.

## Environment (not configured by this implementation)

Backend: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, FRONTEND_URL,
and a stable JWT_SECRET. Missing Google configuration fails closed, without changing
password login. Never use NEXT_PUBLIC variables for secrets.

Local: FRONTEND_URL=http://localhost:3000 and
GOOGLE_REDIRECT_URI=http://localhost:4000/auth/google/callback.

Production: FRONTEND_URL=https://foodsave-xi.vercel.app and
GOOGLE_REDIRECT_URI=https://foodsave-api-pgrf.onrender.com/auth/google/callback.

Vercel: NEXT_PUBLIC_API_URL=https://foodsave-api-pgrf.onrender.com.
Local frontend: NEXT_PUBLIC_API_URL=http://localhost:4000.

## Google Console (manual work, not executed)

Create separate Web application OAuth clients for local and production. Configure the
exact corresponding backend callback above. Configure consent branding, authorized
domains, privacy/terms links and test users as appropriate. Request only openid, email,
profile. Do not request offline access. The frontend completion route is not a Google
authorized redirect URI. No browser Google SDK or frontend client secret is required.

## Flow and security

POST /auth/google/start accepts only a SHA-256 frontend verifier challenge and fr/en.
The verifier stays in sessionStorage. GET /auth/google/authorize atomically claims the
start ticket and establishes a first-party HttpOnly, Lax cookie before leaving for
Google. This avoids depending on third-party cookies between Vercel and Render.
GET /auth/google/callback validates state and the cookie and durably consumes the
transaction BEFORE exchanging the provider code outside the database transaction.
PKCE S256 and nonce bind the provider response. A crash consumes the attempt; start
a fresh attempt rather than replaying a possibly consumed provider code.

The fixed frontend completion redirect carries only a random one-use handoff in a
fragment. POST /auth/google/complete requires the original frontend verifier and
atomically consumes the handoff. The final seven-day FoodSave JWT is returned in JSON
and stored using the existing localStorage token convention. No tokens go in URLs.
All attempts expire after ten minutes. Consumed/expired attempts cannot be replayed.
No provider tokens are stored. Callback completion erases nonce and PKCE verifier.

Do not enable URL/body capture for /auth/google/* in proxies, access logs, analytics,
APM or error collectors: authorization requests/callbacks carry sensitive state/code/
binding values. Application handlers intentionally never log these values or provider
errors. Review upstream logging before rollout. Expired records can later be purged by
an explicitly approved retention process; expiry is enforced regardless of cleanup.

## Migration and rollout

The new migration is transactional. It aborts on lowercase email collisions and never
merges/deletes users. It preserves existing emails, hashes, roles and relationships.
A trigger computes canonicalEmail for every writer; its unique index enforces races.
Password becomes nullable for Google-only accounts; external identities and OAuth
transactions are separate tables. Existing Phase A migrations remain unchanged.

Validate this migration (including collision rollback) on disposable PostgreSQL before
production approval. Audit production collision/backup readiness only with separate
authorization. Apply schema before enabling the new application. Keep Google credentials
disabled until all old backend instances are drained: old password login code does not
handle null passwords. After Google-only users exist, rollback needs compatible code.
Never drop identities or merge users to facilitate rollback.

Local integration tests require ONLY FOODSAVE_TEST_DATABASE_URL targeting 127.0.0.1:55432,
foodsave_test_phase_a, foodsave_phase_a_runner in foodsave-phase-a-postgres. There is no
DATABASE_URL fallback. Do not start/recreate a container or substitute a remote database.

Release checks: mocked suites/builds; real isolated database migration and independent
client tests; then separately authorized Google test-user flow, cookies, logging and
cross-origin redirects. Rate limiting uses the existing per-process mechanism; a shared
rate-limit store is an operational consideration when horizontally scaling, not replay
protection (which is enforced in PostgreSQL).
