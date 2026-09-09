// Additive migration: provider descriptions never enter durable storage.
module.exports = {
  async up(q, S) {
    await q.sequelize.transaction(async (transaction) => {
      const o = { transaction };
      for (const table of ['Songs', 'Albums']) {
        await q.addColumn(
          table,
          'source',
          { type: S.STRING, allowNull: false, defaultValue: 'local' },
          o,
        );
        await q.addColumn(table, 'sourceId', { type: S.STRING, allowNull: true }, o);
        await q.sequelize.query(`UPDATE "${table}" SET "sourceId" = id::text`, o);
        await q.changeColumn(table, 'sourceId', { type: S.STRING, allowNull: false }, o);
        await q.addIndex(table, ['source', 'sourceId'], {
          ...o,
          unique: true,
          name: `${table.toLowerCase()}_source_unique`,
        });
        await q.changeColumn(
          table,
          table === 'Songs' ? 'songName' : 'albumName',
          { type: S.STRING(255), allowNull: true },
          o,
        );
        await q.changeColumn(table, 'releaseDate', { type: S.DATE, allowNull: true }, o);
      }
      await q.changeColumn(
        'Songs',
        'albumId',
        { type: S.INTEGER, allowNull: true, references: { model: 'Albums', key: 'id' } },
        o,
      );
      await q.changeColumn(
        'Albums',
        'artistId',
        { type: S.INTEGER, allowNull: true, references: { model: 'Artists', key: 'id' } },
        o,
      );
      // Sequelize 6 retains NOT NULL when changeColumn also specifies references.
      await q.sequelize.query(
        'ALTER TABLE "Songs" ALTER COLUMN "albumId" DROP NOT NULL; ALTER TABLE "Albums" ALTER COLUMN "artistId" DROP NOT NULL',
        o,
      );
      await q.addColumn(
        'Songs',
        'artistId',
        { type: S.INTEGER, allowNull: true, references: { model: 'Artists', key: 'id' } },
        o,
      );
      await q.sequelize.query(
        'UPDATE "Songs" s SET "artistId"=a."artistId" FROM "Albums" a WHERE s."albumId"=a.id',
        o,
      );
      await q.changeColumn('PlaylistSongs', 'song', { type: S.STRING(255), allowNull: true }, o);
      for (const [table, key, target] of [
        ['SavedSongs', 'songId', 'Songs'],
        ['SavedAlbums', 'albumId', 'Albums'],
      ]) {
        await q.createTable(
          table,
          {
            id: { type: S.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
            userId: {
              type: S.INTEGER,
              allowNull: false,
              references: { model: 'Users', key: 'id' },
              onDelete: 'CASCADE',
            },
            [key]: {
              type: S.INTEGER,
              allowNull: false,
              references: { model: target, key: 'id' },
              onDelete: 'CASCADE',
            },
            createdAt: { type: S.DATE, allowNull: false },
            updatedAt: { type: S.DATE, allowNull: false },
          },
          o,
        );
        await q.addIndex(table, ['userId', key], {
          ...o,
          unique: true,
          name: `${table.toLowerCase()}_owner_unique`,
        });
      }
      // SequelizeMeta makes this a one-time copy, never a startup resave.
      await q.sequelize.query(
        `INSERT INTO "SavedSongs" ("userId", "songId", "createdAt", "updatedAt")
        SELECT DISTINCT p."userId", ps."songId", NOW(), NOW() FROM "PlaylistSongs" ps
        JOIN "Playlists" p ON p.id=ps."playlistId" JOIN "Songs" s ON s.id=ps."songId"
        WHERE s."audioPath" IS NOT NULL`,
        o,
      );
    });
  },
  async down(q) {
    // Rollback removes feature relationships; never rewrites original catalog IDs or playlists.
    await q.sequelize.transaction(async (transaction) => {
      const o = { transaction };
      await q.dropTable('SavedAlbums', o);
      await q.dropTable('SavedSongs', o);
      await q.removeColumn('Songs', 'artistId', o);
      for (const table of ['Songs', 'Albums']) {
        await q.removeIndex(table, `${table.toLowerCase()}_source_unique`, o);
        await q.removeColumn(table, 'sourceId', o);
        await q.removeColumn(table, 'source', o);
      }
    });
  },
};
