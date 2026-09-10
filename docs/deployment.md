# Vibe deployment

Vibe exports one Express application from `app.js`. Vercel detects that native
entry point; the local `bin/www` listener remains the development start command.
Use Node 24 and an isolated PostgreSQL database with verified TLS.

## Hosting configuration

- `NODE_ENV=production`
- `VIBE_PUBLIC_ORIGIN=https://vibe.mjames.dev`
- `VIBE_PORTFOLIO_ORIGIN=https://mjames.dev`
- `DATABASE_URL`: the app's own pooled, restricted database connection
- `JWT_SECRET`: stable signing material scoped to this app and environment

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

## Launch state

This change prepares hosting and framing. It does not enable a public demo-only
mode or introduce scheduled deletion. Durable sign-up and the original
entry-triggered demo cleanup remain the application's current behavior. The
public account/retention policy must be resolved before production launch.

Before promotion, bind an exact reviewed source commit to separate app secrets,
run migrations and the licensed seed against the isolated destination, then
verify native demo admission, saved collections and playlists, local audio
play/pause/seek, provider failure/retry, and the mobile portfolio embed. Verify
session and data behavior across restart and record the chosen cleanup and
recovery operations. Local tests do not establish hosted acceptance.
