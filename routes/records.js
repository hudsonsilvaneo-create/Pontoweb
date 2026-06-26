const express = require('express');
const { deleteRecord, listRecordsByUser, upsertRecord } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function isDateKey(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function isTimeValue(value) {
    return /^(\d{1,2})(:\d{1,2})?$/.test(String(value || '').trim());
}

router.use(requireAuth);

router.get('/', async (req, res) => {
    const records = await listRecordsByUser(req.user.id);
    return res.json({ records });
});

router.put('/:date', async (req, res) => {
    const date = req.params.date;
    const worked = String(req.body.worked || '').trim();
    const obs = String(req.body.obs || '').trim();

    if (!isDateKey(date)) {
        return res.status(400).json({ error: 'Data inválida.' });
    }

    if (!isTimeValue(worked)) {
        return res.status(400).json({ error: 'Informe as horas no formato 9:00 ou 8:30.' });
    }

    if (obs.length > 200) {
        return res.status(400).json({ error: 'A observação deve ter no máximo 200 caracteres.' });
    }

    const record = await upsertRecord(req.user.id, date, { worked, obs });
    return res.json({ record });
});

router.patch('/:date/obs', async (req, res) => {
    const date = req.params.date;
    const obs = String(req.body.obs || '').trim();
    const records = await listRecordsByUser(req.user.id);
    const existing = records.find(record => record.date === date);

    if (!isDateKey(date)) {
        return res.status(400).json({ error: 'Data inválida.' });
    }

    if (obs.length > 200) {
        return res.status(400).json({ error: 'A observação deve ter no máximo 200 caracteres.' });
    }

    if (!existing) {
        return res.status(404).json({ error: 'Registre as horas do dia antes da observação.' });
    }

    const record = await upsertRecord(req.user.id, date, {
        worked: existing.worked,
        obs
    });

    return res.json({ record });
});

router.delete('/:date', async (req, res) => {
    const date = req.params.date;

    if (!isDateKey(date)) {
        return res.status(400).json({ error: 'Data inválida.' });
    }

    await deleteRecord(req.user.id, date);
    return res.status(204).send();
});

module.exports = router;
