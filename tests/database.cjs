require('dotenv').config({ quiet: true });
const { spawnSync } = require('node:child_process');
function testEnvironment() {
  const database = process.env.TEST_DATABASE || `${process.env.DB_DATABASE || 'vibe'}_test`;
  if (!/^[a-zA-Z0-9_]+_test$/.test(database) || process.env.DATABASE_URL)
    throw new Error('Tests require a dedicated database ending in _test and no DATABASE_URL.');
  return { ...process.env, NODE_ENV: 'test', DB_DATABASE: database };
}
function prepare() {
  const env = testEnvironment();
  for (const command of ['db:migrate', 'db:seed:all']) {
    const result = spawnSync(
      process.execPath,
      ['-r', 'dotenv/config', 'node_modules/sequelize-cli/lib/sequelize', command],
      { env, encoding: 'utf8', timeout: 60000 },
    );
    if (result.error || result.status !== 0)
      throw result.error || new Error(result.stdout + result.stderr);
  }
  const sync = spawnSync(process.execPath, ['scripts/import-catalog.cjs'], {
    env,
    encoding: 'utf8',
    timeout: 60000,
  });
  if (sync.error || sync.status !== 0) throw sync.error || new Error(sync.stdout + sync.stderr);
  return env;
}
module.exports = { testEnvironment, prepare };
