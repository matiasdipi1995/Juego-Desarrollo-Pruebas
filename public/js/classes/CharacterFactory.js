// public/js/classes/CharacterFactory.js

const FACTORY_API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:3000'
  : 'https://juego-en-desarrollo.onrender.com';

// Valores de respaldo por si el servidor no responde
const DEFAULT_CHARACTER_STATS = {
  warrior: { vida: 700, mana: 100, ataque: 20, defensa: 15 },
  mage:    { vida: 500, mana: 100, ataque: 15, defensa: 5 },
  archer:  { vida: 550, mana: 100, ataque: 35, defensa: 10 },
  ninja:   { vida: 450, mana: 100, ataque: 25, defensa: 5 }
};

const CHARACTER_LABELS = {
  warrior: 'Guerrero',
  mage: 'Mago',
  archer: 'Arquero',
  ninja: 'Ninja'
};

let cachedStats = null;

async function loadCharacterStats(forceRefresh = false) {
  if (cachedStats && !forceRefresh) return cachedStats;

  try {
    const res = await fetch(`${FACTORY_API_BASE}/api/stats`);
    if (!res.ok) throw new Error('Error consultando /api/stats');
    const data = await res.json();
    cachedStats = { ...DEFAULT_CHARACTER_STATS, ...data };
  } catch (err) {
    console.warn('[FACTORY] Usando stats por defecto:', err.message);
    cachedStats = { ...DEFAULT_CHARACTER_STATS };
  }
  return cachedStats;
}

function createCharacterInstance(type, config = {}) {
  const statsMap = cachedStats || DEFAULT_CHARACTER_STATS;
  const baseStats = statsMap[type] || DEFAULT_CHARACTER_STATS.warrior;

  const finalConfig = {
    ...config,
    stats: config.stats || baseStats
  };

  switch (type) {
    case 'warrior': return new Warrior(finalConfig);
    case 'mage':    return new Mage(finalConfig);
    case 'archer':  return new Archer(finalConfig);
    case 'ninja':   return new Ninja(finalConfig);
    default:        return new Warrior(finalConfig);
  }
}

async function loadMyLoadout(charClass) {
  await loadCharacterStats();
  const baseStats = (cachedStats && cachedStats[charClass]) || DEFAULT_CHARACTER_STATS[charClass] || DEFAULT_CHARACTER_STATS.warrior;
  const fallback = {
    stats: { ...baseStats },
    equipment: { arma: null, sombrero: null, armadura: null, accesorio: null }
  };

  const token = localStorage.getItem('token');
  if (!token) return fallback;

  try {
    const res = await fetch(`${FACTORY_API_BASE}/api/loadout/${charClass}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return fallback;
    return await res.json();
  } catch (err) {
    console.warn('[FACTORY] No se pudo cargar el equipamiento:', err.message);
    return fallback;
  }
}

async function claimMatchReward(mode, result = 'win') {
  const token = localStorage.getItem('token');
  if (!token) return null;

  try {
    const res = await fetch(`${FACTORY_API_BASE}/api/rewards/match`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ mode, result })
    });
    if (!res.ok) return null;
    const data = await res.json();

    if (window.currentUser && typeof data.monedas === 'number') {
      window.currentUser.monedas = data.monedas;
      const coinsEl = document.getElementById('menu-coins');
      if (coinsEl) coinsEl.textContent = data.monedas;
    }
    return data;
  } catch (err) {
    return null;
  }
}