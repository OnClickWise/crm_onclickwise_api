import knex from "knex";
import * as path from "path";
import { DB_CLIENT, DB_DATABASE, DB_HOST, DB_PASSWORD, DB_USER } from "./config";

export const knexInstance = knex({
    client: DB_CLIENT,
    connection: {
        host: DB_HOST,
        user: DB_USER,
        password: DB_PASSWORD,
        database: DB_DATABASE
    },
    migrations: {
        // Aponta pra pasta migrations da raiz do projeto.
        directory: path.resolve(__dirname, '../../../migrations'),
        // Aceita .ts e .js — historicamente algumas migrations foram registradas como .js.
        loadExtensions: ['.ts', '.js'],
        extension: 'ts',
        tableName: 'knex_migrations',
    },
});