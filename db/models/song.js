'use strict';
module.exports = (sequelize, DataTypes) => {
  const Song = sequelize.define(
    'Song',
    {
      songName: DataTypes.STRING,
      source: { type: DataTypes.STRING, defaultValue: 'local' },
      sourceId: DataTypes.STRING,
      releaseDate: DataTypes.DATE,
      albumId: DataTypes.INTEGER,
      artistId: DataTypes.INTEGER,
      audioPath: DataTypes.STRING,
      sourceUrl: DataTypes.STRING,
      license: DataTypes.STRING,
      style: DataTypes.STRING,
      duration: DataTypes.FLOAT,
    },
    {},
  );
  Song.associate = function (models) {
    // associations can be defined here
    Song.belongsTo(models.Artist, { foreignKey: 'artistId' });
    Song.belongsTo(models.Album, { foreignKey: 'albumId' });
    Song.belongsToMany(models.Playlist, { through: models.PlaylistSong, foreignKey: 'songId' });
  };
  return Song;
};
