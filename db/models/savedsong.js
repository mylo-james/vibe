module.exports = (sequelize, D) => {
  const SavedSong = sequelize.define('SavedSong', { userId: D.INTEGER, songId: D.INTEGER });
  SavedSong.associate = (m) => {
    SavedSong.belongsTo(m.User, { foreignKey: 'userId' });
    SavedSong.belongsTo(m.Song, { foreignKey: 'songId' });
  };
  return SavedSong;
};
