const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { createUser, findUserByEmail } = require('../db');
const { requireAuth, signUserToken } = require('../middleware/auth');

const router = express.Router();

function cleanText(value) {
    return String(value || '').trim();
}

function publicUser(user) {
    return {
        id: user.id,
        name: user.name,
        email: user.email
    };
}

router.post('/register', async (req, res) => {
    const name = cleanText(req.body.name);
    const email = cleanText(req.body.email).toLowerCase();
    const password = String(req.body.password || '');

    if (name.length < 2) {
        return res.status(400).json({ error: 'Informe um nome com pelo menos 2 caracteres.' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Informe um e-mail válido.' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres.' });
    }

    const existingUser = await findUserByEmail(email);
    if (existingUser) {
        return res.status(409).json({ error: 'Já existe um usuário com esse e-mail.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await createUser({
        id: crypto.randomUUID(),
        name,
        email,
        passwordHash,
        createdAt: new Date().toISOString()
    });

    return res.status(201).json({
        token: signUserToken(user),
        user: publicUser(user)
    });
});

router.post('/login', async (req, res) => {
    const email = cleanText(req.body.email).toLowerCase();
    const password = String(req.body.password || '');
    const user = await findUserByEmail(email);

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    }

    return res.json({
        token: signUserToken(user),
        user: publicUser(user)
    });
});

router.get('/me', requireAuth, (req, res) => {
    return res.json({ user: req.user });
});

module.exports = router;
