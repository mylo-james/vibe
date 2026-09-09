# Vibe

A music player built with Pug, Express, PostgreSQL and plain JavaScript. Browse electronic, chill and chiptune recordings, play a queue, and make private playlists. Discover contains 100 selected Audius tracks across six full albums/EPs and 46 tracks without Audius album membership. A separate local collection has 10 credited CC0 recordings, including short game loops.

This is a maintenance pass on a collaborative first project. It keeps the original stack and yellow Vibe identity while repairing account isolation, finishing the player experience, and making the code easier to maintain. [Project history](docs/project-history.md) explains the original contributions and the changes in this edition.

## Run locally

Requires Node.js 24 through 26 and PostgreSQL. Development was verified with Node 26.8.1, PostgreSQL 17.11 and Chrome. Start PostgreSQL using your normal local setup, then:

```sh
npm ci
cp .env.example .env
createdb vibe_development
```

Set the `DB_*` fields in `.env` to your local PostgreSQL user, database and host. `DB_HOST` can also be a PostgreSQL Unix socket directory. Generate `JWT_SECRET` with the command in `.env.example`, and paste the result into that field. Keep `.env` private and outside version control.

```sh
npm run db:migrate
npm run db:seed
npm start
```

The server binds to `127.0.0.1:4331` by default. For a private Tailscale preview, expose that listener through Tailscale Serve and open the HTTPS URL it returns:

```sh
tailscale serve --bg --https=8448 http://127.0.0.1:4331
```

Choose an unused HTTPS port if 8448 already belongs to another app. Only the loopback proxy is trusted. The session cookie becomes `Secure` when the trusted proxy reports HTTPS. Do not expose the loopback application directly to the internet.

Use **Try the demo** for a fresh private workspace with three starter playlists. Demo sessions last two hours. Expired demo accounts are removed when another demo starts. Registered accounts retain their own saved songs, saved albums and playlists. Saving a song and adding it to a playlist are independent actions. There is no shared demo password.

Use `npm run dev` for server restarts on source changes. Migrations and seeding are setup steps, not restart steps. A new local database is the safest way to compare this edition with the original; applying the migration to an existing database is a separate operation that needs a backup and review.

## Working on the code

- `views/`: Pug pages and reusable `brand`, `icon` and `field` mixins.
- `public/stylesheets/`: shared design values and page-specific CSS. [Style guide](docs/styles.md).
- `public/js/api.js`: one fetch/error/session boundary.
- `public/js/music.js`: navigation, DOM rendering and playlist interactions.
- `public/js/player.js`: audio queue, shuffle, repeat, seeking and volume.
- `routes/backend-routes/`: authenticated API and ownership checks.
- `public/js/catalog-cache.js`: per-document metadata cache and request coalescing.
- `public/js/music-ui.js`: safe DOM and artwork primitives.
- `public/js/motion.js`: system reduced-motion, visibility and playback motion controls.
- `services/audius.js`: bounded provider reads, eligibility and verified content origins.
- `db/`: additive migrations, independent saved-item relationships and local catalog seed.
- `data/audius-catalog.json`: provider IDs and Vibe-authored selections only.
- `data/catalog.json`: music metadata, sources, license declarations and file checksums.

```sh
npm run format
npm run check
npm run catalog:sync
```

`catalog:sync` is an explicit, idempotent update from the checked-in manifest. Existing song IDs and playlist membership are preserved. Run one sync at a time. [Music intake](docs/music.md) describes adding a track and verifying its permission and assets.

## Verification

Create a dedicated test database. The default name is the configured `DB_DATABASE` plus `_test`, or set `TEST_DATABASE` explicitly. Tests refuse database names without the `_test` suffix and refuse `DATABASE_URL`. **The tests clear application data and roll back/rebuild the schema in that test database.** Never point it at valuable data.

```sh
createdb vibe_development_test
npm test
npm run test:browser
npm run test:coverage
```

The API suite runs real migrations and exercises real PostgreSQL writes through HTTP. The browser suite uses installed Chrome and its own temporary loopback server on port 4334. It covers account forms, playlist CRUD, safe text rendering, search, browser history, real audio playback, desktop/phone layout and automated accessibility checks. Browser reports are written to the ignored `playwright-report/` directory. Tests do not prove behavior on physical iOS devices.

`test:coverage` runs both suites and fails if any test fails or if statements, branches, functions or lines fall below 81%. It measures server and browser JavaScript, including unloaded runtime files. Open `coverage/index.html` for the file-by-file report. [Testing guide](docs/testing.md) explains the scope, fixture boundaries and regression checks.

## Catalog storage

Vibe stores Audius IDs and its own collection relationships. Remote titles, artist names, artwork URLs and temporary stream URLs are fetched on demand, returned with `Cache-Control: no-store`, and never written to the database or persistent browser storage. Audio streams directly from Audius. The browser naturally buffers playback; there is no Vibe audio download or offline cache.

Reloading starts a fresh metadata session. During an outage, saved references remain removable but may show “Details unavailable.” The local collection stays available. See [Audius integration](docs/audius.md) for the adapter and selection workflow.

## Current boundaries

This edition supports catalog/album browsing, an independent Library, private playlists, and system-aware motion. Audius public API access is read-only and can become unavailable; no provider key is currently needed. Social following, account recovery, uploads, payment, and recommendations are not implemented. Demo playlists do not transfer when an account is created. Authentication uses signed cookies; clearing a cookie logs out that browser, but there is no server-side token revocation list. Rate limits use an in-memory store for this single-process preview. Production scaling and account recovery need separate design and verification.

Dependency audit on 2026-09-09: no critical or high advisories; two moderate package findings remain for one advisory inherited through Sequelize's `uuid` dependency. The affected v3/v5/v6 buffer APIs are not used by the inspected application or Sequelize paths. See [dependency notes](docs/dependencies.md). This is a scoped source assessment, not a claim of zero risk.

## Credits

Original team:

- **UX/UI lead:** Mylo James (`mylo-james`)
- **Backend lead:** Geoffrey Otieno (`gootieno`)
- **Team lead:** Emily Burnham (`Aderyn1121`)

Audius artist and license attribution is fetched per session and shown under each track’s Credits control. Local music attribution is visible at `/credits` and recorded in [the catalog manifest](data/catalog.json). Sintony and Montserrat are self-hosted under the SIL Open Font License; license texts are in `docs/licenses/`. Historical media with no verified redistribution permission was removed from this checkout. Git history is unchanged and may still contain those files.
