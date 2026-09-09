'use strict';

module.exports = (sequelize, DataTypes) => {
  const PlaylistSong = sequelize.define(
    'PlaylistSong',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      song: DataTypes.STRING,
      songId: DataTypes.INTEGER,
      playlistId: DataTypes.INTEGER,
    },
    {},
  );
  PlaylistSong.associate = function (models) {
    // associations can be defined here
    PlaylistSong.belongsTo(models.Song, { foreignKey: 'songId' });
    PlaylistSong.belongsTo(models.Playlist, { foreignKey: 'playlistId' });
  };
  return PlaylistSong;
};
