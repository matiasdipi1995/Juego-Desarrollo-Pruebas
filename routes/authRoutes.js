const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../config/db');

// Middleware para verificar si es Admin
function esAdmin(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Acceso denegado: Token no provisto.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secreto_super_seguro');
        if (decoded.role !== 'admin') {
            return res.status(403).json({ error: 'Acceso denegado: Se requieren permisos de Administrador.' });
        }
        req.usuario = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token inválido o expirado.' });
    }
}

// ---------------------------------------------------------
// 1. RUTA DE REGISTRO (/api/auth/register)
// ---------------------------------------------------------
// 1. RUTA DE REGISTRO (/api/auth/register)
router.post('/register', async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        // 1. Insertar usuario usando 'password_hash' (nombre correcto según tu SQL)
        const [userResult] = await db.query(
            'INSERT INTO usuarios (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
            [username, email, hashedPassword, 'user']
        );

        const nuevoUsuarioId = userResult.insertId;

        // 2. Insertar registros iniciales en la tabla estadisticas
        await db.query(
            'INSERT INTO estadisticas (usuario_id, partidas_jugadas, victorias, derrotas, puntuacion_maxima, nivel_actual, monedas) VALUES (?, 0, 0, 0, 0, 1, 100)',
            [nuevoUsuarioId]
        );

        return res.status(201).json({ mensaje: 'Usuario registrado exitosamente' });

    } catch (error) {
        console.error("=== ERROR DETALLADO EN REGISTRO ===", error);

        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'El usuario o email ya está en uso' });
        }

        return res.status(500).json({ error: 'Error al registrar: ' + error.message });
    }
});

// ---------------------------------------------------------
// 2. RUTA DE LOGIN (/api/auth/login)
// ---------------------------------------------------------
// 2. RUTA DE LOGIN (/api/auth/login)
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Por favor ingresa correo y contraseña.' });
    }

    try {
        const [results] = await db.query('SELECT * FROM usuarios WHERE email = ?', [email]);

        if (results.length === 0) {
            return res.status(400).json({ error: 'Credenciales inválidas.' });
        }

        const usuario = results[0];

        // Comparar con usuario.password_hash en lugar de usuario.password
        const esValida = await bcrypt.compare(password, usuario.password_hash);
        if (!esValida) {
            return res.status(400).json({ error: 'Credenciales inválidas.' });
        }

        const secretKey = process.env.JWT_SECRET || 'clave_super_secreta';
        const token = jwt.sign(
            { id: usuario.id, username: usuario.username, role: usuario.role },
            secretKey,
            { expiresIn: '8h' }
        );

        return res.json({
            mensaje: 'Inicio de sesión exitoso.',
            token,
            usuario: {
                id: usuario.id,
                username: usuario.username,
                email: usuario.email,
                role: usuario.role
            }
        });

    } catch (error) {
        console.error("=== ERROR EN LOGIN ===", error);
        return res.status(500).json({ error: 'Error en el servidor al iniciar sesión' });
    }
});

// ---------------------------------------------------------
// 3. RUTA PROTEGIDA DE ADMIN (/api/auth/admin/dashboard)
// ---------------------------------------------------------
router.get('/admin/dashboard', esAdmin, (req, res) => {
    res.json({ mensaje: 'Bienvenido al Panel de Control de Administrador' });
});

module.exports = router;