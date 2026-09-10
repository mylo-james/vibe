const { db } = require('./index');
const { serverlessPool } = require('./hosting');
const common = {
  dialect: 'postgres',
  // Keep the native driver visible to serverless dependency tracing.
  dialectModule: require('pg'),
  logging: false,
  seederStorage: 'sequelize',
  ...db,
};
module.exports = {
  development: common,
  test: common,
  production: {
    ...common,
    use_env_variable: 'DATABASE_URL',
    dialectOptions: { ssl: { require: true, rejectUnauthorized: true } },
    pool: serverlessPool,
  },
};
