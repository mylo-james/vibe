# Dependency maintenance

Dependencies are pinned and `package-lock.json` is tracked. Use `npm ci` for a reproducible installation. The 2026 maintenance pass replaced unused and obsolete packages, updated Express within version 4, upgraded Pug, JWT and Sequelize, and moved to supported Node runtime ranges. The application does not use the old CSRF or Faker dependencies.

Audit snapshot, 2026-09-09:

- Before: 13 package findings, including 1 critical and 4 high.
- After: 2 moderate package findings (`sequelize` and its transitive `uuid`) describing one underlying advisory. No high or critical findings.
- `qs` is overridden to 6.16.0 because the Express 4 dependency resolution selected an affected parser version. Keep the override until the upstream dependency range resolves a patched version, then recheck.

The remaining [UUID advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq) concerns v3/v5/v6 calls with an output buffer. The installed Sequelize 6.37.8 calls v1/v4 without caller-supplied buffers in the inspected utilities, query and transaction paths. Vibe has no direct UUID dependency or UUID calls. The reported vulnerable APIs are therefore not reachable through those inspected paths. Reassess this conclusion if Sequelize or UUID usage changes. Do not downgrade Sequelize to version 3 or force a cross-major override merely to silence an audit result.

`npm audit` still exits nonzero for the inherited advisory. Keep that visible. Cookie ownership, request validation, migration integrity and dependency changes are verified by the PostgreSQL suite; `npm run test:browser` verifies the affected UI flows. None of these checks substitutes for a production security review.
