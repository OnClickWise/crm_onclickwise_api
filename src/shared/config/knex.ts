import knex from "knex";
import { DB_CLIENT, DB_DATABASE, DB_HOST, DB_PASSWORD, DB_USER } from "./config";

export const knexInstance = knex({
    client: DB_CLIENT,
    connection: {
        host: DB_HOST,
        user: DB_USER,
        password: DB_PASSWORD,
        database: DB_DATABASE
    }
});