require('dotenv').config({ quiet: true });
const { sequelize } = require('../db/models');
require('../services/import-catalog')
  .importCatalog()
  .then(() => console.log('Catalog updated.'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
