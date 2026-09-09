const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'coverage');
const temp = path.join(output, 'tmp');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(temp, { recursive: true });
function run(args, env = process.env) {
  const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  return result.status ?? 1;
}
const tests = fs.readdirSync(path.join(root, 'tests')).filter((f) => f.endsWith('.test.cjs'));
let status = run(
  [
    '-r',
    'dotenv/config',
    '--test',
    '--test-concurrency=1',
    '--test-timeout=60000',
    ...tests.map((f) => 'tests/' + f),
  ],
  { ...process.env, NODE_V8_COVERAGE: temp },
);
if (!status) status = run(['scripts/prepare-test-db.cjs']);
if (!status)
  status = run(['node_modules/@playwright/test/cli.js', 'test'], {
    ...process.env,
    VIBE_COVERAGE_DIR: temp,
  });
const report = run([
  'node_modules/c8/bin/c8.js',
  'report',
  ...(process.argv.includes('--report-only') ? ['--check-coverage=false'] : []),
]);
process.exitCode = status || report;
