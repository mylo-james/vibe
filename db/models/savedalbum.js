module.exports = (sequelize, D) => {
  const SavedAlbum = sequelize.define('SavedAlbum', { userId: D.INTEGER, albumId: D.INTEGER });
  SavedAlbum.associate = (m) => {
    SavedAlbum.belongsTo(m.User, { foreignKey: 'userId' });
    SavedAlbum.belongsTo(m.Album, { foreignKey: 'albumId' });
  };
  return SavedAlbum;
};
