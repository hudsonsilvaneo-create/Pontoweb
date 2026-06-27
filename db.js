require('dotenv').config({ quiet: true });

const crypto = require('crypto');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

const pool = DATABASE_URL
    ? new Pool({
        connectionString: DATABASE_URL,
        ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
        max: Number(process.env.PG_POOL_MAX || 5)
    })
    : null;

function getPool() {
    if (!pool) {
        throw new Error('Configure DATABASE_URL no arquivo .env para conectar ao Neon/PostgreSQL.');
    }

    return pool;
}

function schemaNameFromUserId(userId) {
    return `user_${String(userId).replaceAll('-', '_')}`;
}

function quoteIdentifier(identifier) {
    if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) {
        throw new Error('Identificador de banco inválido.');
    }

    return `"${identifier}"`;
}

function mapUser(row) {
    if (!row) return null;

    return {
        id: row.id,
        schemaName: row.schema_name,
        name: row.name,
        email: row.email,
        passwordHash: row.password_hash,
        createdAt: row.created_at
    };
}

function mapRecord(row) {
    if (!row) return null;

    return {
        id: row.id,
        date: row.work_date,
        worked: row.worked,
        obs: row.obs || '',
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

async function initializeDatabase() {
    await getPool().query(`
        CREATE TABLE IF NOT EXISTS public.app_users (
            id uuid PRIMARY KEY,
            schema_name text NOT NULL UNIQUE,
            name text NOT NULL,
            email text NOT NULL UNIQUE,
            password_hash text NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now()
        )
    `);
}

async function ensureUserSchema(client, schemaName) {
    const schema = quoteIdentifier(schemaName);

    await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
    await client.query(`
        CREATE TABLE IF NOT EXISTS ${schema}.time_records (
            id uuid PRIMARY KEY,
            work_date date NOT NULL UNIQUE,
            worked text NOT NULL,
            obs text NOT NULL DEFAULT '',
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )
    `);
}

async function createUser(user) {
    await initializeDatabase();

    const client = await getPool().connect();
    const schemaName = schemaNameFromUserId(user.id);

    try {
        await client.query('BEGIN');
        await ensureUserSchema(client, schemaName);

        const result = await client.query(
            `
                INSERT INTO public.app_users (id, schema_name, name, email, password_hash, created_at)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
            `,
            [user.id, schemaName, user.name, user.email, user.passwordHash, user.createdAt || new Date().toISOString()]
        );

        await client.query('COMMIT');
        return mapUser(result.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function findUserByEmail(email) {
    await initializeDatabase();

    const result = await getPool().query(
        'SELECT * FROM public.app_users WHERE lower(email) = lower($1) LIMIT 1',
        [email]
    );

    return mapUser(result.rows[0]);
}

async function findUserById(id) {
    await initializeDatabase();

    const result = await getPool().query(
        'SELECT * FROM public.app_users WHERE id = $1 LIMIT 1',
        [id]
    );

    return mapUser(result.rows[0]);
}

async function listRecordsByUser(userId) {
    const user = await findUserById(userId);
    if (!user) return [];

    const schema = quoteIdentifier(user.schemaName);
    const result = await getPool().query(`
        SELECT id, work_date::text, worked, obs, created_at, updated_at
        FROM ${schema}.time_records
        ORDER BY work_date
    `);

    return result.rows.map(mapRecord);
}

async function upsertRecord(userId, date, payload) {
    const user = await findUserById(userId);
    if (!user) throw new Error('Usuário não encontrado.');

    const schema = quoteIdentifier(user.schemaName);
    const result = await getPool().query(
        `
            INSERT INTO ${schema}.time_records (id, work_date, worked, obs)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (work_date)
            DO UPDATE SET
                worked = EXCLUDED.worked,
                obs = EXCLUDED.obs,
                updated_at = now()
            RETURNING id, work_date::text, worked, obs, created_at, updated_at
        `,
        [crypto.randomUUID(), date, payload.worked, payload.obs || '']
    );

    return mapRecord(result.rows[0]);
}

async function deleteRecord(userId, date) {
    const user = await findUserById(userId);
    if (!user) return false;

    const schema = quoteIdentifier(user.schemaName);
    const result = await getPool().query(
        `DELETE FROM ${schema}.time_records WHERE work_date = $1`,
        [date]
    );

    return result.rowCount > 0;
}

module.exports = {
    initializeDatabase,
    createUser,
    findUserByEmail,
    findUserById,
    listRecordsByUser,
    upsertRecord,
    deleteRecord
};
