# Vibe deployment

Vibe exports one Express application from `app.js`. Vercel detects that native
entry point; the local `bin/www` listener remains the development start command.
Use Node 24 and an isolated PostgreSQL database with verified TLS.

## Hosting configuration

- `NODE_ENV=production`
- `VIBE_PUBLIC_ORIGIN=https://vibe.mjames.dev`
- `VIBE_PORTFOLIO_ORIGIN=https://mjames.dev`
- `DATABASE_URL`: the app's own pooled, restricted database connection
- `JWT_SECRET`: at least 32 random bytes of stable signing material scoped to this app and environment
- `VIBE_PUBLIC_DEMO=1`: use the bounded public demo policy
- `CRON_SECRET`: separate random signing material of at least 32 bytes for native cleanup requests

Vercel supplies its own `VERCEL` and `VERCEL_ENV` markers. Only its one immediate
proxy hop is trusted. Production session cookies are Secure, HttpOnly, host-only,
and SameSite=Lax. Browser writes must match both the configured child origin and
the request's HTTPS host. The portfolio is a frame parent, not an API write origin.

For an isolated Vercel preview, explicitly set `VIBE_PUBLIC_ORIGIN` to the preview
child's canonical address and `VIBE_PORTFOLIO_ORIGIN=https://preview.mjames.dev`.
An additional exact `VIBE_PREVIEW_ORIGIN` is allowed only when Vercel marks the
deployment as a preview. Never share production data or signing material with a
preview.

`vercel.json` selects the native Express framework and Ohio region. Its rewrite
preserves the application's `/public/` asset URLs while Vercel serves `public/**`
through its CDN. Local audio is the credited, checked-in catalog; Audius playback
continues to stream directly from the existing allowed provider origins. Check
real deployed asset URLs and audio Range responses before launch.

The production Sequelize pool has at most three connections per function
instance and no minimum idle connections. A short idle timeout reduces unused
connections while the instance runs. This is not a global connection cap and
does not establish cleanup of connections while an instance is frozen. Use the
pooled database endpoint and verify cold starts and overlapping requests on the
selected hosting tier. Never close a shared Sequelize instance after each request.

## Public demo policy

With `VIBE_PUBLIC_DEMO=1`, the public app offers temporary demo sessions only.
Lasting registration and login are disabled, including their API endpoints, and
existing non-demo identities cannot authenticate in that mode. Ordinary local
operation keeps its existing account behavior when this setting is absent.

Each demo lasts two hours. Admission is limited to 100 active demo visitors and
40 new demos in a rolling 15-minute window across all instances. Each visitor
can have 20 playlists total, including the six starting playlists. PostgreSQL
transaction-scoped advisory locks make admission and playlist caps atomic across
function instances. Lock and statement timeouts bound time spent waiting.

New sessions start with 34 saved songs, six saved albums and six populated mixes.
The collection combines the existing curated Audius selections with ten local
tracks. Demo admission creates the user's library and playlists in one transaction,
using catalog references without calling the provider or storing remote descriptions.
Returning to Library does not restore items the visitor has removed.

Expired sessions immediately lose access. Expired demo users and their owned
playlists, playlist memberships, saved tracks/albums and friend links are deleted
when another demo is admitted or by daily cleanup. Durable local accounts and
the credited catalog are excluded. The cleanup schedule is `31 8 * * *` UTC;
Vercel Hobby may execute within that hour rather than at the exact minute.
Deletion normally follows on the next daily run, and can be later if a run fails.
See [Vercel cron management](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

Native cron sends an authenticated GET to `/api/maintenance/cleanup` on the
exact generated `VERCEL_URL` hostname. The endpoint verifies the secret in
constant time and is unavailable for other hosts/methods or outside public demo
mode. This narrowly scoped cron host does not become a browser write origin.
Verify the native Cron Jobs Run action after deployment and check its response.

## Database setup

Run the repository's migrations and licensed catalog seed once with the isolated
database's migration owner. Use a separate runtime role with no admin, database
creation, role creation, permanent schema creation or table truncation rights.
The existing nine migrations already support public demo mode; it adds no schema.

The runtime needs SELECT/INSERT/DELETE on Users, PlaylistSongs, SavedSongs and
SavedAlbums; SELECT/INSERT/UPDATE/DELETE on Playlists; SELECT/DELETE on UserFriends;
SELECT/INSERT on Songs and Albums for provider references; and SELECT on Artists.
Grant USAGE on only the corresponding inserted-table sequences, plus database
CONNECT and TEMPORARY and public schema USAGE. TEMPORARY supports Sequelize 6's
native `findOrCreate` helper in `pg_temp`; it grants no permanent schema creation.
Keep migration/seed metadata access with the migration owner. Do not seed or run
migrations at function startup, and do not import previous demo data.

## Release verification

Bind the deployment to an exact reviewed source commit and separate app secrets.
Verify native demo admission, expiry, saved collections and playlists, local audio
play/pause/seek and Range delivery, provider failure/retry, session isolation, and
the mobile portfolio embed. Verify session/data persistence across requests and
record native cleanup status. Local tests establish only their tested runtime;
repeat the visitor journey on the real canonical host before enabling the embed.
