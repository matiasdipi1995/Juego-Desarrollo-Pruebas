// economy.js
const pool = require('./db');

const VALID_CLASSES = ['warrior', 'mage', 'archer', 'ninja'];
const DEFAULT_STATS = {
  warrior: { vida: 700, mana: 100, ataque: 20, defensa: 15 },
  mage:    { vida: 500, mana: 100, ataque: 15, defensa: 5 },
  archer:  { vida: 550, mana: 100, ataque: 35, defensa: 10 },
  ninja:   { vida: 450, mana: 100, ataque: 25, defensa: 5 }
};

// Anti-spam simple para premios de partidas locales/bot (cooldown de 10s por usuario)
const lastMatchRewardByUser = new Map();

/**
 * Calcula las estadísticas finales (base + ítems equipados) y los id_visual
 * de un personaje para un usuario dado.
 */
async function getPlayerLoadout(userId, charClass) {
  const safeClass = VALID_CLASSES.includes(charClass) ? charClass : 'warrior';

  let stats = { ...DEFAULT_STATS[safeClass] };
  const equipment = { arma: null, sombrero: null, armadura: null, accesorio: null };

  try {
    const baseRes = await pool.query(
      'SELECT vida_base, mana_base, ataque_base, defensa_base FROM personajes_stats WHERE clase = $1',
      [safeClass]
    );
    if (baseRes.rows.length > 0) {
      const r = baseRes.rows[0];
      stats = {
        vida: r.vida_base,
        mana: r.mana_base,
        ataque: r.ataque_base,
        defensa: r.defensa_base
      };
    }

    if (userId) {
      const eqRes = await pool.query(
        `SELECT i.tipo_equipamiento, i.atributo_mejora, i.valor_mejora, i.id_visual
         FROM equipamiento e
         JOIN items i ON e.item_id = i.id
         WHERE e.usuario_id = $1 AND e.clase = $2`,
        [userId, safeClass]
      );

      eqRes.rows.forEach(item => {
        if (equipment.hasOwnProperty(item.tipo_equipamiento)) {
          equipment[item.tipo_equipamiento] = item.id_visual;
        }
        if (item.atributo_mejora === 'vida') stats.vida += item.valor_mejora;
        else if (item.atributo_mejora === 'mana') stats.mana += item.valor_mejora;
        else if (item.atributo_mejora === 'ataque') stats.ataque += item.valor_mejora;
        else if (item.atributo_mejora === 'defensa') stats.defensa += item.valor_mejora;
      });
    }
  } catch (err) {
    console.error('[LOADOUT ERROR]', err.message);
  }

  return { stats, equipment };
}

/**
 * Suma monedas de forma segura a la cuenta del usuario en PostgreSQL.
 */
async function awardCoins(userId, amount) {
  if (!userId || !amount || amount <= 0) return null;
  try {
    const res = await pool.query(
      'UPDATE usuarios SET monedas = monedas + $1 WHERE id = $2 RETURNING monedas',
      [Math.round(amount), userId]
    );
    return res.rows[0] ? res.rows[0].monedas : null;
  } catch (err) {
    console.error('[AWARD COINS ERROR]', err.message);
    return null;
  }
}

/**
 * Registra los endpoints REST de Tienda, Inventario, Equipamiento y Premios.
 */
function registerEconomyRoutes(app, verifyToken) {
  // 1. Obtener estado completo de tienda + inventario + equipamiento del usuario
  app.get('/api/shop', verifyToken, async (req, res) => {
    try {
      const [userRes, statsRes, itemsRes, invRes, eqRes] = await Promise.all([
        pool.query('SELECT monedas FROM usuarios WHERE id = $1', [req.user.id]),
        pool.query('SELECT * FROM personajes_stats ORDER BY id ASC'),
        pool.query('SELECT * FROM items ORDER BY clase_compatible, id ASC'),
        pool.query('SELECT item_id FROM inventario WHERE usuario_id = $1', [req.user.id]),
        pool.query('SELECT clase, item_id FROM equipamiento WHERE usuario_id = $1', [req.user.id])
      ]);

      const statsByClass = {};
      statsRes.rows.forEach(r => {
        statsByClass[r.clase] = {
          vida: r.vida_base,
          mana: r.mana_base,
          ataque: r.ataque_base,
          defensa: r.defensa_base
        };
      });

      const equippedByClass = { warrior: [], mage: [], archer: [], ninja: [] };
      eqRes.rows.forEach(r => {
        if (!equippedByClass[r.clase]) equippedByClass[r.clase] = [];
        equippedByClass[r.clase].push(r.item_id);
      });

      res.json({
        monedas: userRes.rows[0]?.monedas ?? 0,
        statsByClass,
        items: itemsRes.rows,
        ownedItemIds: invRes.rows.map(r => r.item_id),
        equippedByClass
      });
    } catch (err) {
      console.error('[SHOP GET ERROR]', err);
      res.status(500).json({ error: 'Error al cargar la tienda.' });
    }
  });

  // 2. Comprar un ítem (con transacción SQL para evitar saldos negativos)
  app.post('/api/shop/buy', verifyToken, async (req, res) => {
    const itemId = parseInt(req.body?.itemId, 10);
    if (!itemId) return res.status(400).json({ error: 'Ítem inválido.' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const itemRes = await client.query('SELECT * FROM items WHERE id = $1', [itemId]);
      if (itemRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'El ítem no existe.' });
      }
      const item = itemRes.rows[0];

      const ownedRes = await client.query(
        'SELECT 1 FROM inventario WHERE usuario_id = $1 AND item_id = $2',
        [req.user.id, itemId]
      );
      if (ownedRes.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Ya posees este ítem.' });
      }

      const userRes = await client.query(
        'SELECT monedas FROM usuarios WHERE id = $1 FOR UPDATE',
        [req.user.id]
      );
      const currentCoins = userRes.rows[0]?.monedas ?? 0;

      if (currentCoins < item.precio) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'No tienes suficientes monedas.' });
      }

      const updatedUser = await client.query(
        'UPDATE usuarios SET monedas = monedas - $1 WHERE id = $2 RETURNING monedas',
        [item.precio, req.user.id]
      );

      await client.query(
        'INSERT INTO inventario (usuario_id, item_id) VALUES ($1, $2)',
        [req.user.id, itemId]
      );

      await client.query('COMMIT');
      res.json({
        message: `¡Compraste ${item.nombre}!`,
        monedas: updatedUser.rows[0].monedas,
        itemId
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[BUY ERROR]', err);
      res.status(500).json({ error: 'Error al procesar la compra.' });
    } finally {
      client.release();
    }
  });

  // 3. Equipar un ítem en un personaje (reemplaza el ítem previo del mismo slot)
  app.post('/api/equipment/equip', verifyToken, async (req, res) => {
    const clase = req.body?.clase;
    const itemId = parseInt(req.body?.itemId, 10);

    if (!VALID_CLASSES.includes(clase) || !itemId) {
      return res.status(400).json({ error: 'Datos de equipamiento inválidos.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const ownedRes = await client.query(
        `SELECT i.* FROM inventario inv
         JOIN items i ON inv.item_id = i.id
         WHERE inv.usuario_id = $1 AND inv.item_id = $2`,
        [req.user.id, itemId]
      );
      if (ownedRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Debes comprar este ítem antes de equiparlo.' });
      }

      const item = ownedRes.rows[0];
      if (item.clase_compatible !== 'todas' && item.clase_compatible !== clase) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Este ítem no es compatible con ese personaje.' });
      }

      // Quitar cualquier ítem previo en el mismo slot (arma/sombrero/armadura/accesorio)
      await client.query(
        `DELETE FROM equipamiento
         WHERE usuario_id = $1 AND clase = $2
         AND item_id IN (SELECT id FROM items WHERE tipo_equipamiento = $3)`,
        [req.user.id, clase, item.tipo_equipamiento]
      );

      await client.query(
        'INSERT INTO equipamiento (usuario_id, clase, item_id) VALUES ($1, $2, $3)',
        [req.user.id, clase, itemId]
      );

      await client.query('COMMIT');
      const loadout = await getPlayerLoadout(req.user.id, clase);
      res.json({ message: `${item.nombre} equipado.`, loadout });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[EQUIP ERROR]', err);
      res.status(500).json({ error: 'Error al equipar el ítem.' });
    } finally {
      client.release();
    }
  });

  // 4. Desequipar un ítem de un personaje
  app.post('/api/equipment/unequip', verifyToken, async (req, res) => {
    const clase = req.body?.clase;
    const itemId = parseInt(req.body?.itemId, 10);

    if (!VALID_CLASSES.includes(clase) || !itemId) {
      return res.status(400).json({ error: 'Datos inválidos.' });
    }

    try {
      await pool.query(
        'DELETE FROM equipamiento WHERE usuario_id = $1 AND clase = $2 AND item_id = $3',
        [req.user.id, clase, itemId]
      );
      const loadout = await getPlayerLoadout(req.user.id, clase);
      res.json({ message: 'Ítem desequipado.', loadout });
    } catch (err) {
      console.error('[UNEQUIP ERROR]', err);
      res.status(500).json({ error: 'Error al desequipar el ítem.' });
    }
  });

  // 5. Obtener loadout (stats + visuales) para Local y Bot
  app.get('/api/loadout/:charClass', verifyToken, async (req, res) => {
    const loadout = await getPlayerLoadout(req.user.id, req.params.charClass);
    res.json(loadout);
  });

  // 6. Premio en monedas al terminar una partida Local o vs Bot
  app.post('/api/rewards/match', verifyToken, async (req, res) => {
    const { mode, result } = req.body || {};
    const now = Date.now();
    const lastTime = lastMatchRewardByUser.get(req.user.id) || 0;

    if (now - lastTime < 10000) {
      return res.status(429).json({ error: 'Espera unos segundos antes de reclamar otro premio.' });
    }

    let earned = 30;
    if (mode === 'bot') {
      earned = result === 'win' ? 80 : 30;
    } else if (mode === 'local') {
      earned = 50;
    }

    lastMatchRewardByUser.set(req.user.id, now);
    const totalCoins = await awardCoins(req.user.id, earned);
    res.json({ earned, monedas: totalCoins });
  });
}

module.exports = { getPlayerLoadout, awardCoins, registerEconomyRoutes };