// adminRoutes.js
const bcrypt = require('bcryptjs');
const pool = require('./db');

const VALID_CLASSES = ['warrior', 'mage', 'archer', 'ninja'];
const VALID_SLOTS = ['arma', 'armadura', 'sombrero', 'accesorio'];
const VALID_ATTRS = ['vida', 'mana', 'ataque', 'defensa'];

/**
 * Middleware que verifica en PostgreSQL que el usuario autenticado sea realmente admin.
 */
async function verifyAdmin(req, res, next) {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'No autenticado.' });
    }

    const result = await pool.query('SELECT rol FROM usuarios WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0 || result.rows[0].rol !== 'admin') {
      return res.status(403).json({ error: 'Acceso denegado. Se requieren permisos de administrador.' });
    }

    next();
  } catch (err) {
    console.error('[VERIFY ADMIN ERROR]', err);
    res.status(500).json({ error: 'Error verificando permisos de administrador.' });
  }
}

function registerAdminRoutes(app, verifyToken) {
  // 1. Carga inicial completa del panel (stats, ítems y usuarios)
  app.get('/api/admin/overview', verifyToken, verifyAdmin, async (req, res) => {
    try {
      const [statsRes, itemsRes, usersRes] = await Promise.all([
        pool.query('SELECT * FROM personajes_stats ORDER BY id ASC'),
        pool.query('SELECT * FROM items ORDER BY clase_compatible, id ASC'),
        pool.query('SELECT id, username, email, monedas, rol, intentos_fallidos, cuenta_bloqueada, creado_en FROM usuarios ORDER BY id ASC')
      ]);

      res.json({
        stats: statsRes.rows,
        items: itemsRes.rows,
        users: usersRes.rows
      });
    } catch (err) {
      console.error('[ADMIN OVERVIEW ERROR]', err);
      res.status(500).json({ error: 'Error al cargar los datos del panel.' });
    }
  });

  // 2. Actualizar estadísticas base de un personaje
  app.put('/api/admin/stats/:clase', verifyToken, verifyAdmin, async (req, res) => {
    const clase = req.params.clase;
    if (!VALID_CLASSES.includes(clase)) {
      return res.status(400).json({ error: 'Clase de personaje inválida.' });
    }

    const vida = parseInt(req.body?.vida_base, 10);
    const mana = parseInt(req.body?.mana_base, 10);
    const ataque = parseInt(req.body?.ataque_base, 10);
    const defensa = parseInt(req.body?.defensa_base, 10);

    if (![vida, mana, ataque].every(n => Number.isFinite(n) && n > 0) || !Number.isFinite(defensa) || defensa < 0) {
      return res.status(400).json({ error: 'Los valores numéricos de atributos son inválidos.' });
    }

    try {
      const result = await pool.query(
        `UPDATE personajes_stats
         SET vida_base = $1, mana_base = $2, ataque_base = $3, defensa_base = $4
         WHERE clase = $5
         RETURNING *`,
        [vida, mana, ataque, defensa, clase]
      );

      res.json({ message: `Estadísticas de ${clase} actualizadas.`, stat: result.rows[0] });
    } catch (err) {
      console.error('[ADMIN UPDATE STATS ERROR]', err);
      res.status(500).json({ error: 'Error al actualizar las estadísticas.' });
    }
  });

  // 3. Crear un nuevo ítem en la tienda
  app.post('/api/admin/items', verifyToken, verifyAdmin, async (req, res) => {
    const {
      nombre,
      clase_compatible,
      tipo_equipamiento,
      atributo_mejora,
      valor_mejora,
      precio,
      id_visual
    } = req.body || {};

    const cleanName = (nombre || '').toString().trim();
    const cleanVisual = (id_visual || '').toString().trim();
    const bonus = parseInt(valor_mejora, 10);
    const cost = parseInt(precio, 10);

    if (!cleanName || !cleanVisual) {
      return res.status(400).json({ error: 'El nombre y la clave visual son obligatorios.' });
    }
    if (![...VALID_CLASSES, 'todas'].includes(clase_compatible)) {
      return res.status(400).json({ error: 'Clase compatible inválida.' });
    }
    if (!VALID_SLOTS.includes(tipo_equipamiento)) {
      return res.status(400).json({ error: 'Tipo de equipamiento inválido.' });
    }
    if (!VALID_ATTRS.includes(atributo_mejora)) {
      return res.status(400).json({ error: 'Atributo de mejora inválido.' });
    }
    if (!Number.isFinite(bonus) || bonus <= 0 || !Number.isFinite(cost) || cost < 0) {
      return res.status(400).json({ error: 'Bonificación o precio inválidos.' });
    }

    try {
      const result = await pool.query(
        `INSERT INTO items (nombre, clase_compatible, tipo_equipamiento, atributo_mejora, valor_mejora, precio, id_visual)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [cleanName, clase_compatible, tipo_equipamiento, atributo_mejora, bonus, cost, cleanVisual]
      );

      res.status(201).json({ message: `Ítem "${cleanName}" creado.`, item: result.rows[0] });
    } catch (err) {
      console.error('[ADMIN CREATE ITEM ERROR]', err);
      res.status(500).json({ error: 'Error al crear el ítem.' });
    }
  });

  // 4. Editar precio o bonificación de un ítem existente
  app.put('/api/admin/items/:id', verifyToken, verifyAdmin, async (req, res) => {
    const itemId = parseInt(req.params.id, 10);
    const cleanName = (req.body?.nombre || '').toString().trim();
    const bonus = parseInt(req.body?.valor_mejora, 10);
    const cost = parseInt(req.body?.precio, 10);

    if (!itemId || !cleanName || !Number.isFinite(bonus) || bonus <= 0 || !Number.isFinite(cost) || cost < 0) {
      return res.status(400).json({ error: 'Datos de edición inválidos.' });
    }

    try {
      const result = await pool.query(
        `UPDATE items
         SET nombre = $1, valor_mejora = $2, precio = $3
         WHERE id = $4
         RETURNING *`,
        [cleanName, bonus, cost, itemId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Ítem no encontrado.' });
      }

      res.json({ message: `Ítem "${cleanName}" actualizado.`, item: result.rows[0] });
    } catch (err) {
      console.error('[ADMIN UPDATE ITEM ERROR]', err);
      res.status(500).json({ error: 'Error al actualizar el ítem.' });
    }
  });

  // 5. Eliminar un ítem de la tienda
  app.delete('/api/admin/items/:id', verifyToken, verifyAdmin, async (req, res) => {
    const itemId = parseInt(req.params.id, 10);
    if (!itemId) return res.status(400).json({ error: 'ID inválido.' });

    try {
      await pool.query('DELETE FROM items WHERE id = $1', [itemId]);
      res.json({ message: 'Ítem eliminado correctamente.' });
    } catch (err) {
      console.error('[ADMIN DELETE ITEM ERROR]', err);
      res.status(500).json({ error: 'Error al eliminar el ítem.' });
    }
  });

  // 6. Actualizar monedas, rol, desbloqueo o restablecimiento de contraseña de un usuario
  app.patch('/api/admin/users/:id', verifyToken, verifyAdmin, async (req, res) => {
    const targetUserId = parseInt(req.params.id, 10);
    if (!targetUserId) {
      return res.status(400).json({ error: 'ID de usuario inválido.' });
    }

    const { action } = req.body || {};

    try {
      // Acción A: Desbloquear cuenta y reiniciar contador de intentos
      if (action === 'unlock') {
        const result = await pool.query(
          `UPDATE usuarios
           SET intentos_fallidos = 0, cuenta_bloqueada = FALSE, bloqueado_hasta = NULL
           WHERE id = $1
           RETURNING id, username, email, monedas, rol, intentos_fallidos, cuenta_bloqueada`,
          [targetUserId]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Usuario no encontrado.' });
        }

        return res.json({
          message: `Cuenta de ${result.rows[0].username} desbloqueada.`,
          user: result.rows[0]
        });
      }

      // Acción B: Asignar nueva contraseña provisoria (y desbloquear automáticamente)
      if (action === 'reset_password') {
        const newPassword = (req.body?.newPassword || '').toString().trim();
        if (newPassword.length < 6) {
          return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(newPassword, salt);

        const result = await pool.query(
          `UPDATE usuarios
           SET password_hash = $1, intentos_fallidos = 0, cuenta_bloqueada = FALSE, bloqueado_hasta = NULL
           WHERE id = $2
           RETURNING id, username, email, monedas, rol, intentos_fallidos, cuenta_bloqueada`,
          [passwordHash, targetUserId]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Usuario no encontrado.' });
        }

        return res.json({
          message: `Contraseña actualizada y cuenta desbloqueada para ${result.rows[0].username}.`,
          user: result.rows[0]
        });
      }

      // Acción C: Actualización estándar de monedas y rol
      const monedas = parseInt(req.body?.monedas, 10);
      const rol = req.body?.rol;

      if (!Number.isFinite(monedas) || monedas < 0 || !['jugador', 'admin'].includes(rol)) {
        return res.status(400).json({ error: 'Datos de usuario inválidos.' });
      }

      if (targetUserId === req.user.id && rol !== 'admin') {
        return res.status(400).json({ error: 'No puedes quitarte el rol de administrador a ti mismo.' });
      }

      const result = await pool.query(
        `UPDATE usuarios
         SET monedas = $1, rol = $2
         WHERE id = $3
         RETURNING id, username, email, monedas, rol, intentos_fallidos, cuenta_bloqueada`,
        [monedas, rol, targetUserId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Usuario no encontrado.' });
      }

      res.json({ message: `Usuario ${result.rows[0].username} actualizado.`, user: result.rows[0] });
    } catch (err) {
      console.error('[ADMIN UPDATE USER ERROR]', err);
      res.status(500).json({ error: 'Error al actualizar el usuario.' });
    }
  });
}

module.exports = { registerAdminRoutes };