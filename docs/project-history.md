# Revisiting the first Vibe

Vibe began as a team project using Express, Pug, PostgreSQL, Sequelize and native CSS. Mylo James led UX/UI, Geoffrey Otieno led the backend, and Emily Burnham was team lead. The original brief also proposed social following, friends and genre discovery; a brief is not evidence that those features shipped.

This maintenance edition preserves the stack and credits. Its purpose is to show how an older application can be understood, repaired and extended without discarding the original work.

| Original problem | Change in this edition |
| --- | --- |
| Session restoration selected user 2 regardless of the signed identity | Verify the signed subject and restore that account; use an HttpOnly cookie |
| Playlist routes accepted another listener's IDs | Authenticate every private route and enforce ownership before reading or writing |
| Raw search strings were compiled as regular expressions | Match bounded, literal search terms across track metadata and owned playlists |
| Playlist writes could race and create duplicates | Await writes, use a transaction for deletion and add a database uniqueness constraint |
| Library and player controls were incomplete | Implement a saved-track library, shuffled queue, repeat modes, seeking and navigation history |
| Duplicated routers, templates and page-specific style fragments | Separate API, player and page code; shared Pug mixins and CSS primitives |
| Bundled audio had no documented redistribution permission | Use a source-linked CC0 catalog and visible artist credits |
| There was no working test suite or tracked dependency lock | Add real PostgreSQL regression tests, browser journeys and a tracked lockfile |

The UI keeps the yellow waveform mark and dark music-player setting, with layouts that fit desktop and phone widths. It removes fake loading delays and inert controls. The current demo is an isolated two-hour workspace; registered listeners keep their own playlists.

The untouched original commit is `742bedaeef7a05b5f526ce50b2e836a6286ede77`. Historical media remains in Git history. This edition does not claim social features, account recovery, production hardening or physical-device validation that has not been implemented and verified.
