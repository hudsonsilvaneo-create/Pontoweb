const jwt = require('jsonwebtoken');
const { findUserById } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'pontoweb-local-dev-secret';

async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const [, token] = authHeader.split(' ');

    if (!token) {
        return res.status(401).json({ error: 'Sessão não informada.' });
    }

    try {
        const payload = jwt.verify(token, JWT_SECRET);
        const user = await findUserById(payload.sub);

        if (!user) {
            return res.status(401).json({ error: 'Usuário não encontrado.' });
        }

        req.user = {
            id: user.id,
            name: user.name,
            email: user.email
        };
        return next();
    } catch {
        return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
    }
}

function signUserToken(user) {
    return jwt.sign(
        {
            sub: user.id,
            email: user.email
        },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}

module.exports = {
    requireAuth,
    signUserToken
};
