const express = require('express');
const path = require('path');
const authRoutes = require('./routes/auth');
const recordRoutes = require('./routes/records');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '100kb' }));

app.use('/api/auth', authRoutes);
app.use('/api/records', recordRoutes);

app.use(express.static(__dirname));

app.get('/health', (req, res) => {
    res.json({ ok: true });
});

app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
});

app.listen(PORT, () => {
    console.log(`Ponto Web rodando em http://127.0.0.1:${PORT}`);
});
