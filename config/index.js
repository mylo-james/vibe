const environment = process.env.NODE_ENV || 'development';
module.exports = {
  environment,
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 4331),
  db: {
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
  },
  jwtConfig: { secret: process.env.JWT_SECRET, expiresIn: 60 * 60 * 24 * 7 },
};
