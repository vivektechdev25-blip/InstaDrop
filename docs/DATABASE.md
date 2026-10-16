# Database

ReelSaveNow has **no database**. It stores no Instagram media, no credentials and no request logs: the API fetches what a request needs, streams media straight from Instagram's CDN to the visitor, and keeps nothing.

An anonymous request-log table in Supabase PostgreSQL (`request_logs`: id, hashed IP, endpoint, status code, timestamp) was scaffolded early on, but nothing ever wrote to it. The unused repository, its row model and the `@supabase/supabase-js` dependency were removed on 2026-10-16 as dead code; the scaffold is in git history if logging is ever built for real. If it is, the original rules still apply: no PII, IP addresses hashed with SHA-256 and a daily rotating salt before storage, and no Instagram usernames, passwords or session cookies persisted (see [SECURITY.md](./SECURITY.md)).
