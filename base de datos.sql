-- 1. Crear la base de datos
CREATE DATABASE IF NOT EXISTS batalla_medieval
  CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;

USE batalla_medieval;

-- 2. Tabla de Usuarios
CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('user', 'admin') DEFAULT 'user',
    estado ENUM('activo', 'baneado') DEFAULT 'activo',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 3. Tabla de Estadísticas
CREATE TABLE IF NOT EXISTS estadisticas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL UNIQUE,
    partidas_jugadas INT DEFAULT 0,
    victorias INT DEFAULT 0,
    derrotas INT DEFAULT 0,
    puntuacion_maxima INT DEFAULT 0,
    nivel_actual INT DEFAULT 1,
    monedas INT DEFAULT 100,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 4. Tabla de Historial de Partidas
CREATE TABLE IF NOT EXISTS historial_partidas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    jugador1_id INT NOT NULL,
    jugador2_id INT NULL,
    ganador_id INT NULL,
    duracion_segundos INT DEFAULT 0,
    fecha_partida TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (jugador1_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (jugador2_id) REFERENCES usuarios(id) ON DELETE SET NULL,
    FOREIGN KEY (ganador_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 5. Tabla de Logs de Administrador
CREATE TABLE IF NOT EXISTS admin_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin_id INT NOT NULL,
    accion VARCHAR(255) NOT NULL,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

UPDATE usuarios 
SET role = 'admin' 
WHERE email = 'laranadalissc@gmail.com';