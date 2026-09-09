module.exports = {
  async up(q, S) {
    await q.sequelize.transaction(async (transaction) => {
      const options = { transaction };
      await q.addColumn('Users', 'demoExpiresAt', { type: S.DATE, allowNull: true }, options);
      await q.changeColumn('Users', 'birthday', { type: S.DATEONLY, allowNull: true }, options);
      await q.changeColumn('Users', 'gender', { type: S.STRING(10), allowNull: true }, options);
      for (const [name, type] of Object.entries({
        audioPath: S.STRING,
        sourceUrl: S.STRING,
        license: S.STRING,
        style: S.STRING,
        duration: S.FLOAT,
      }))
        await q.addColumn('Songs', name, { type, allowNull: true }, options);
      // Keep one existing membership before introducing the database invariant.
      await q.sequelize.query(
        'DELETE FROM "PlaylistSongs" a USING "PlaylistSongs" b WHERE a."playlistId"=b."playlistId" AND a."songId"=b."songId" AND a.id>b.id',
        options,
      );
      await q.addIndex('PlaylistSongs', ['playlistId', 'songId'], {
        unique: true,
        name: 'playlist_song_unique',
        transaction,
      });
    });
  },
  async down(q) {
    await q.sequelize.transaction(async (transaction) => {
      await q.removeIndex('PlaylistSongs', 'playlist_song_unique', { transaction });
      for (const name of ['audioPath', 'sourceUrl', 'license', 'style', 'duration'])
        await q.removeColumn('Songs', name, { transaction });
      await q.removeColumn('Users', 'demoExpiresAt', { transaction });
      // Existing rows may have null birthday/gender; do not invent personal data in a rollback.
    });
  },
};
