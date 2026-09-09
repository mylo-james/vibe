const { importCatalog } = require('../../services/import-catalog');
module.exports = {
  up: (queryInterface) => importCatalog(queryInterface),
  down: async () => {
    throw new Error('Catalog removal is explicit because listeners may have saved these tracks.');
  },
};
