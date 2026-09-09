const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { testEnvironment } = require('./database.cjs');
// The documented test commands run database suites serially against the guarded _test database.
const env = testEnvironment();
function migrate(command) {
  const r = spawnSync(
    process.execPath,
    ['-r', 'dotenv/config', 'node_modules/sequelize-cli/lib/sequelize', command],
    { env, encoding: 'utf8', timeout: 60000 },
  );
  assert.equal(r.status, 0, r.error?.message || r.stdout + r.stderr);
}
test('the full schema upgrades from empty tables and the catalog seeder preserves IDs on rerun', async () => {
  Object.assign(process.env, env);
  const { sequelize, Song, Album, User } = require('../db/models');
  const seeder = require('../db/seeders/20260909000200-licensed-catalog');
  const q = sequelize.getQueryInterface();
  try {
    migrate('db:migrate:undo:all');
    const empty = await q.showAllTables();
    for (const name of ['Songs', 'Albums', 'SavedSongs', 'SavedAlbums', 'Users', 'Playlists'])
      assert.equal(empty.includes(name), false, name + ' should be absent');
    migrate('db:migrate');
    await seeder.up(q);
    assert.equal(await Song.count(), 10);
    assert.ok((await Album.count()) > 0);
    assert.equal(await User.count(), 0);
    const ids = (await Song.findAll({ order: [['id', 'ASC']] })).map((s) => s.id);
    await seeder.up(q);
    assert.deepEqual(
      (await Song.findAll({ order: [['id', 'ASC']] })).map((s) => s.id),
      ids,
    );
    await assert.rejects(seeder.down(q), /removal is explicit/);
    assert.equal(await Song.count(), 10);
    assert.equal((await q.describeTable('Songs')).albumId.allowNull, true);
  } finally {
    // Restore the test schema if an assertion fails; never target the preview database.
    migrate('db:migrate');
    await sequelize.close();
  }
});
