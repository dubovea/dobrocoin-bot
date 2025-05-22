const { Client } = require("pg");

// Подключение к PostgreSQL
const dbClient = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

dbClient.connect();

module.exports = dbClient;
