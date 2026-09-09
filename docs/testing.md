# Testing Vibe

Run tests against a disposable PostgreSQL database ending in `_test`. Set `TEST_DATABASE` explicitly in your private `.env`, using the same local PostgreSQL host/user configuration as the app. The helper rejects other names and `DATABASE_URL`.

```sh
npm test
npm run test:browser
npm run test:coverage
```

These commands share one test database. Run one command at a time. Node tests run serially and Playwright uses one worker. The schema test rolls back every migration, checks the old tables disappeared, rebuilds from scratch, and checks idempotent catalog seeding. API tests reset their own records before each test; they do not depend on a previous test creating a playlist or saving a song. This database must contain no valuable data.

## Coverage gate

`npm run test:coverage` clears the generated `coverage/` directory, collects Node V8 coverage from the server, modules, CLI and migration processes, then adds native Chromium JavaScript coverage from the browser suite. Playwright shuts down its server gracefully so Node can flush its coverage. Browser entries must have the local server origin and exactly match the checked-out source before they count toward a local file.

[c8](https://github.com/bcoe/c8) includes every JavaScript runtime file matched by the explicit `package.json` include list, even if no test loads it. That list covers the server entry point, configuration, routes, services, all database code, browser modules and catalog import CLI. No runtime file has an ignore-coverage directive or a special exclusion to raise the result. Test code, dependencies, generated reports, development/check tooling, Pug and CSS are outside the JavaScript metric. Source checks compile Pug and validate assets separately; browser tests exercise the rendered pages.

Statements, branches, functions and lines must each reach **81% overall**. Any failed test still fails the command, even if the report meets all four thresholds. This is a global threshold, not a promise that each file reaches 81%. Inspect the browser and server files separately, especially uncovered error branches. V8-derived function and branch counts follow c8's conversion semantics; 100% reported functions does not mean every behavior or callback outcome was tested.

Reports are ignored by Git:

- `coverage/index.html`: navigable file-by-file report.
- `coverage/coverage-summary.json`: totals and per-file percentages.
- `coverage/lcov.info`: standard format for coverage services/editors.
- `playwright-report/index.html`: browser results and failure traces.

`npm run coverage:report` regenerates the report and checks thresholds using the last collected data. Use `test:coverage` for fresh verification. The internal `--report-only` option suppresses the threshold check for baseline measurement; it still returns a failure for failed tests.

## What the tests establish

- HTTP integration tests use real Express routes, signed session cookies and PostgreSQL writes to verify account isolation, validation, save/remove behavior, search results and catalog import integrity.
- Module tests use controlled fetch responses to verify request shape, errors, metadata batching, overlapping requests, retries, stale results and cache clearing. Deferred promises control ordering instead of arbitrary sleeps.
- Process tests run the actual server entry point with missing configuration, a refused database connection and an occupied listener to verify startup failure.
- Browser journeys exercise demo/account forms, playlist and Library interactions, search filters, history, responsive layout and automated accessibility checks. Album fixtures have distinct tracks and varied tags so broken filters cannot pass by returning everything.
- Browser player tests use real HTML audio playback with the checked-in local recordings. Audius metadata and temporary URLs are intercepted at the network boundary for deterministic expiry, failure and late-response cases. The timeout test advances the browser clock, then delivers a response beyond cancellation and checks that it cannot revive the exhausted queue.

The deterministic browser suite does not prove current Audius availability, external artist metadata or audio output from physical speakers. Chromium coverage can undercount scripts retired by full-page navigation; failed-auth cases deliberately stay on those pages to exercise their scripts. Hardware media controls, physical mobile devices and live provider behavior need separate manual checks.

## Writing useful regression tests

Assert an observable result that would be wrong if the behavior broke: exact returned IDs, changed database membership, the next selected song, or editable controls after an error. A successful status alone does not establish that search matched the query or that a delete removed anything. Arrange each test's required records, include a nonmatching item for filtering, and keep provider fixtures faithful to the boundary being exercised.

When fixing a bug, first reproduce it with a focused assertion, then run that test after the fix and the full relevant gate. Coverage points identify places to inspect; they do not establish that an assertion is useful or that the application is bug-free.
