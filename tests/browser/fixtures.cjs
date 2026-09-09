const base = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '../..');

const test = base.test.extend({
  page: async ({ page }, use) => {
    const output = process.env.VIBE_COVERAGE_DIR;
    if (!output) return use(page);
    fs.mkdirSync(output, { recursive: true });
    await page.coverage.startJSCoverage({ resetOnNavigation: false });
    async function collect() {
      const entries = await page.coverage.stopJSCoverage();
      const result = [];
      for (const entry of entries) {
        let url;
        try {
          url = new URL(entry.url);
        } catch {
          continue;
        }
        if (
          url.origin !== new URL(test.info().project.use.baseURL).origin ||
          !/^\/public\/js\/[\w-]+\.js$/.test(url.pathname)
        )
          continue;
        const filename = path.join(root, url.pathname);
        // Refuse to credit different/transformed source with the local file's coverage.
        if (entry.source !== fs.readFileSync(filename, 'utf8'))
          throw new Error(`Coverage source differs from disk: ${filename}`);
        result.push({ ...entry, source: undefined, url: pathToFileURL(filename).href });
      }
      fs.writeFileSync(
        path.join(output, `browser-${randomUUID()}.json`),
        JSON.stringify({ result }),
      );
    }
    try {
      await use(page);
    } finally {
      if (!page.isClosed()) await collect();
    }
  },
});
module.exports = { test, expect: base.expect };
