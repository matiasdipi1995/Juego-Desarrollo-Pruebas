const mysql = require('mysql2/promise');
require('dotenv').config();

// Pool de conexiones para rendimiento óptimo
const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'admin',
    database: process.env.DB_NAME || 'batalla_medieval',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Probar conexión al iniciar
db.getConnection()
    .then(connection => {
        console.log('✅ Conexión exitosa a la Base de Datos MySQL');
        connection.release();
    })
    .catch(err => {
        console.error('❌ Error al conectar a la Base de Datos:', err.message);
    });

module.exports = db;