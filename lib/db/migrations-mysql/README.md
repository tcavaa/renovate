# MySQL / MariaDB migrations — legacy, rollback only

The migration history of the MySQL era (0000–0027), up to the move to PostgreSQL (Supabase) in
October 2026. Nothing in this branch runs these files: the app's migrations are in
`lib/db/migrations` (Postgres). They are kept, unchanged, because a rollback to the cPanel host
(MariaDB) deploys the last MySQL-era commit — tag `legacy-mysql-cpanel` — whose own
`lib/db/migrations` they are (docs/operations.md#legacy-cpanel-and-the-vps-rollback-only).

Delete this folder together with the rest of the legacy path once the move is approved.
