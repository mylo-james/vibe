# Audius integration

The small curated catalog uses public read-only Audius REST endpoints through Node fetch. No SDK, account writes, background synchronization or credential is required by the verified current path. Public availability may change.

`data/audius-catalog.json` holds only album/track IDs and Vibe-authored section selections. Local `Song` and `Album` rows carry `(source, sourceId)` and nullable descriptive fields. The unique pair prevents duplicate identities. SavedSong and SavedAlbum relate those references to Vibe accounts; PlaylistSong remains independent. The additive migration copies historical playlist-derived Library membership once and preserves local IDs.

`GET /api/catalog` provides local data and remote references. `GET /api/catalog/metadata?ids=...` accepts at most 25 local reference IDs; curated or listener-owned references qualify. `/api/catalog/albums/:id` verifies the album flag and reads ordered membership per session. `/api/catalog/songs/:id/stream` rechecks access and resolves a fresh signed URL at playback. Arbitrary URLs are never accepted. Descriptive data is normalized before leaving the server.

The adapter shares one 15-second deadline across at most two HTTP attempts and respects Retry-After. It rejects gates, restricted API-key lists, deleted, unlisted and scheduled content. Exact HTTPS origins in `data/audius-origins.json` were taken from selected provider responses and their content-node mirrors. New origins fail closed until reviewed and added; the browser receives no general media proxy. A mirror reuses the original signed path, never just the mirror root.

The browser cache lives only in module maps and coalesces in-flight reads. Logout, pagehide and a new document clear it. Only the volume preference uses localStorage. The server retains no metadata cache. A fresh-session outage produces removable saved-reference placeholders; an existing session can retain details it already fetched. The player keeps one audio element through navigation, cancels stale selections, refreshes a failed remote URL once, and stops after one unsuccessful queue pass.

## Updating the selection

Read public provider metadata in memory. Select authentic artist albums with ordered multi-track membership and standalone originals that fit the app. Check uploader identity, descriptions, remix/cover indicators, access restrictions and license notices. Exclude unclear third-party compilations, radio mixes, bootlegs and gated material. Streaming access alone is not a copyright assessment.

Keep provider album IDs distinct from numeric backlink IDs. Album membership and names can change and are checked during the session. The stored selection contains no copied release names, artist names, artwork URLs, stream URLs or recordings. After choosing IDs, verify batches of 25, exact media/art origins, artist/license links, real browser playback and counts. Retired saved references remain available to their owners; they are never silently replaced with local songs.

Credits present the uploader's license label and the applicable provider/Creative Commons link. An absent license is labeled Audius Open Music License, never CC0. The ten local tracks retain their separate redistribution evidence in `data/catalog.json` and `docs/music.md`.
