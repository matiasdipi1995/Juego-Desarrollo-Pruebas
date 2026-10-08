const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// ---------------------------------------------------------
// REGISTRO DE USUARIOS
// ---------------------------------------------------------
exports.register = async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios' });
    }

    try {
        // 1. Verificar si el usuario o email ya existen
        const [userExist] = await db.query(
            'SELECT id FROM usuarios WHERE username = ? OR email = ?', 
            [username, email]
        );

        if (userExist.length > 0) {
            return res.status(400).json({ error: 'El nombre de usuario o email ya está registrado' });
        }

        // 2. Encriptar contraseña
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // 3. Insertar nuevo usuario (por defecto el rol es 'user')
        const [result] = await db.query(
            'INSERT INTO usuarios (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
            [username, email, passwordHash, 'user']
        );

        const nuevoUsuarioId = result.insertId;

        // 4. Crear fila inicial de estadísticas para el usuario
        await db.query(
            'INSERT INTO estadisticas (usuario_id, partidas_jugadas, victorias, derrotas, puntuacion_maxima, nivel_actual, monedas) VALUES (?, 0, 0, 0, 0, 1, 100)',
            [nuevoUsuarioId]
        );

        res.status(201).json({ 
            mensaje: 'Usuario registrado exitosamente',
            usuarioId: nuevoUsuarioId 
        });

    } catch (error) {
        console.error('Error en Registro:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
};

// ---------------------------------------------------------
// LOGIN DE USUARIOS Y ADMINS
// ---------------------------------------------------------
exports.login = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email y contraseña requeridos' });
    }

    try {
        // 1. Buscar usuario por email
        const [rows] = await db.query('SELECT * FROM usuarios WHERE email = ?', [email]);

        if (rows.length === 0) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const usuario = rows[0];

        // 2. Verificar estado de la cuenta
        if (usuario.estado === 'baneado') {
            return res.status(403).json({ error: 'Tu cuenta ha sido suspendida' });
        }

        // 3. Comparar contraseña encriptada
        const esValida = await bcrypt.compare(password, usuario.password_hash);
        if (!esValida) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        // 4. Generar Token JWT con ID, Username y Rol
        const token = jwt.sign(
            { 
                id: usuario.id, 
                username: usuario.username, 
                role: usuario.role 
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            mensaje: 'Inicio de sesión exitoso',
            token,
            usuario: {
                id: usuario.id,
                username: usuario.username,
                email: usuario.email,
                role: usuario.role
            }
        });

    } catch (error) {
        console.error('Error en Login:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
};