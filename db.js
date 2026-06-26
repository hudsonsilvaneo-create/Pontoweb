const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');

const initialData = {
    users: [],
    records: []
};

let writeQueue = Promise.resolve();

async function ensureDatabase() {
    await fs.mkdir(DATA_DIR, { recursive: true });

    try {
        await fs.access(DATA_FILE);
    } catch {
        await fs.writeFile(DATA_FILE, JSON.stringify(initialData, null, 2));
    }
}

async function readData() {
    await ensureDatabase();
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(raw || JSON.stringify(initialData));
}

async function writeData(data) {
    await ensureDatabase();
    writeQueue = writeQueue.then(() => fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2)));
    return writeQueue;
}

async function createUser(user) {
    const data = await readData();
    data.users.push(user);
    await writeData(data);
    return user;
}

async function findUserByEmail(email) {
    const data = await readData();
    return data.users.find(user => user.email.toLowerCase() === email.toLowerCase()) || null;
}

async function findUserById(id) {
    const data = await readData();
    return data.users.find(user => user.id === id) || null;
}

async function listRecordsByUser(userId) {
    const data = await readData();
    return data.records.filter(record => record.userId === userId);
}

async function upsertRecord(userId, date, payload) {
    const data = await readData();
    const existingIndex = data.records.findIndex(record => record.userId === userId && record.date === date);
    const record = {
        userId,
        date,
        worked: payload.worked,
        obs: payload.obs || '',
        updatedAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
        data.records[existingIndex] = {
            ...data.records[existingIndex],
            ...record
        };
    } else {
        data.records.push({
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            ...record
        });
    }

    await writeData(data);
    return record;
}

async function deleteRecord(userId, date) {
    const data = await readData();
    const originalLength = data.records.length;
    data.records = data.records.filter(record => !(record.userId === userId && record.date === date));
    await writeData(data);
    return data.records.length !== originalLength;
}

module.exports = {
    createUser,
    findUserByEmail,
    findUserById,
    listRecordsByUser,
    upsertRecord,
    deleteRecord
};
