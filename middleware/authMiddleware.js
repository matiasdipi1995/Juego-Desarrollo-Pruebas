const jwt = require('jsonwebtoken');

// Verificar si el usuario está autenticado
exports.verificarToken = (req, res, next) => {
    const tokenHeader = req.headers['authorization'];

    if (!tokenHeader) {
        return res.status(401).json({ error: 'Acceso denegado. No se proporcionó token' });
    }

    // Formato esperado: "Bearer TOKEN"
    const token = tokenHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.usuario = decoded; // Guarda los datos del token en req.usuario
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Token inválido o expirado' });
    }
};

// Verificar si es Administrador
exports.esAdmin = (req, res, next) => {
    if (req.usuario && req.usuario.role === 'admin') {
        next();
    } else {
        return res.status(403).json({ error: 'Acceso denegado: Se requieren permisos de Administrador' });
    }
};