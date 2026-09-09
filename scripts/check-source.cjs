const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const pug = require('pug');
const root = path.resolve(__dirname, '..');
let count = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (
      ['node_modules', '.git', 'test-results', 'playwright-report', 'coverage'].includes(entry.name)
    )
      continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(js|cjs)$/.test(file) || file.endsWith('/bin/www')) {
      const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
      if (result.status) throw new Error(result.stderr);
      count++;
    }
  }
}
walk(root);
for (const view of ['index', 'login', 'signup', 'music', 'credits', 'error'])
  pug.compileFile(path.join(root, 'views', view + '.pug'));
const seen = new Set();
for (const track of require('../data/catalog.json')) {
  if (!/^\/public\/music\/[a-z0-9-]+\.mp3$/.test(track.audioPath) || seen.has(track.audioPath))
    throw new Error('Invalid or duplicate catalog path.');
  seen.add(track.audioPath);
  const hash = createHash('sha256')
    .update(fs.readFileSync(path.join(root, track.audioPath)))
    .digest('hex');
  if (hash !== track.sha256 || !track.sourceUrl || !track.license || !(track.duration > 0))
    throw new Error('Invalid catalog entry: ' + track.key);
}
console.log(`${count} JavaScript files, 6 Pug views, and ${seen.size} catalog assets checked.`);
