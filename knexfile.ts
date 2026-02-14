import type { Knex } from "knex";
import dotenv from "dotenv";

dotenv.config();

const config: Record<string, Knex.Config> = {
  development: {
    client: "postgresql",

    connection: {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
    },

    migrations: {
      directory: "./migrations",
      extension: "ts",
      tableName: "knex_migrations",
    },

    seeds: {
      directory: "./seeds",
    },
  },
};

module.exports = config;
