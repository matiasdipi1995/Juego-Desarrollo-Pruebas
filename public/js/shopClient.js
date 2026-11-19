// public/js/shopClient.js
// =============================================================
// TIENDA Y ARMERÍA CON VISTA PREVIA EN CANVAS
// =============================================================

const SHOP_API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:3000'
  : 'https://juego-desarrollo-pruebas.onrender.com';

const SLOT_LABELS = {
  arma: 'Arma',
  armadura: 'Armadura',
  sombrero: 'Sombrero',
  accesorio: 'Accesorio'
};

const STAT_LABELS = {
  vida: '❤️ Vida',
  mana: '💧 Maná',
  ataque: '⚔️ Ataque',
  defensa: '🛡️ Defensa'
};

let shopState = {
  monedas: 0,
  statsByClass: {},
  items: [],
  ownedItemIds: [],
  equippedByClass: { warrior: [], mage: [], archer: [], ninja: [] }
};

let selectedShopClass = 'warrior';
let previewAnimId = null;
let previewCharacter = null;

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}

function setShopFeedback(msg, isError = false) {
  const el = document.getElementById('shop-feedback');
  if (!el) return;
  el.textContent = msg || '';
  el.style.color = isError ? '#ff5252' : '#69f0ae';
}

// --- ABRIR Y CERRAR MODAL ---
window.openShopModal = async function() {
  const modal = document.getElementById('shop-modal');
  if (!modal) return;

  setShopFeedback('Cargando inventario...');
  modal.style.display = 'flex';

  await fetchShopData();
  selectShopClass(selectedShopClass);
  startPreviewLoop();
};

window.closeShopModal = function() {
  stopPreviewLoop();
  const modal = document.getElementById('shop-modal');
  if (modal) modal.style.display = 'none';
  setShopFeedback('');
};

async function fetchShopData() {
  try {
    const res = await fetch(`${SHOP_API_BASE}/api/shop`, {
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (!res.ok) {
      setShopFeedback(data.error || 'Error al cargar la tienda.', true);
      return;
    }

    shopState = data;
    syncDisplayedCoins(data.monedas);
    setShopFeedback('');
  } catch (err) {
    setShopFeedback('No se pudo conectar con el servidor.', true);
  }
}

function syncDisplayedCoins(coins) {
  const shopCoins = document.getElementById('shop-coins');
  const menuCoins = document.getElementById('menu-coins');
  if (shopCoins) shopCoins.textContent = coins;
  if (menuCoins) menuCoins.textContent = coins;
  if (window.currentUser) window.currentUser.monedas = coins;
}

// --- CAMBIAR PERSONAJE EN LA ARMERÍA ---
window.selectShopClass = function(charClass) {
  selectedShopClass = charClass;

  document.querySelectorAll('.shop-tab-btn').forEach(btn => {
    const isActive = btn.dataset.char === charClass;
    btn.style.background = isActive ? '#00e5ff' : 'rgba(255,255,255,0.08)';
    btn.style.color = isActive ? '#111' : '#fff';
    btn.style.borderColor = isActive ? '#00e5ff' : '#444';
  });

  renderCharacterPreviewAndStats();
  renderShopItemsGrid();
};

function getActiveEquipmentVisuals(charClass) {
  const equippedIds = shopState.equippedByClass[charClass] || [];
  const equipment = { arma: null, sombrero: null, armadura: null, accesorio: null };
  const bonuses = { vida: 0, mana: 0, ataque: 0, defensa: 0 };

  equippedIds.forEach(itemId => {
    const item = shopState.items.find(i => i.id === itemId);
    if (!item) return;

    if (equipment.hasOwnProperty(item.tipo_equipamiento)) {
      equipment[item.tipo_equipamiento] = item.id_visual;
    }
    if (bonuses.hasOwnProperty(item.atributo_mejora)) {
      bonuses[item.atributo_mejora] += item.valor_mejora;
    }
  });

  return { equipment, bonuses };
}

function renderCharacterPreviewAndStats() {
  const base = shopState.statsByClass[selectedShopClass] || { vida: 500, mana: 100, ataque: 20, defensa: 10 };
  const { equipment, bonuses } = getActiveEquipmentVisuals(selectedShopClass);

  // Actualizar tabla de estadísticas (Base + Bono = Total)
  const statsContainer = document.getElementById('shop-stats-list');
  if (statsContainer) {
    statsContainer.innerHTML = ['vida', 'mana', 'ataque', 'defensa'].map(stat => {
      const b = base[stat] || 0;
      const bonus = bonuses[stat] || 0;
      const total = b + bonus;
      const bonusTag = bonus > 0 ? `<span style="color: #69f0ae;"> (+${bonus})</span>` : '';
      return `
        <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.08); font-size: 13px;">
          <span>${STAT_LABELS[stat]}</span>
          <span><b>${total}</b>${bonusTag}</span>
        </div>
      `;
    }).join('');
  }

  // Instanciar personaje en el Canvas de vista previa (160x180)
  if (typeof createCharacterInstance === 'function') {
    previewCharacter = createCharacterInstance(selectedShopClass, {
      x: 56,
      y: 62,
      width: 48,
      height: 80,
      direction: 1,
      equipment
    });
  }
}

function renderShopItemsGrid() {
  const grid = document.getElementById('shop-items-grid');
  if (!grid) return;

  const classItems = shopState.items.filter(
    item => item.clase_compatible === selectedShopClass || item.clase_compatible === 'todas'
  );
  const equippedIds = shopState.equippedByClass[selectedShopClass] || [];

  if (classItems.length === 0) {
    grid.innerHTML = '<p style="color: #aaa; text-align: center;">No hay ítems disponibles para esta clase.</p>';
    return;
  }

  grid.innerHTML = classItems.map(item => {
    const isOwned = shopState.ownedItemIds.includes(item.id);
    const isEquipped = equippedIds.includes(item.id);
    const canAfford = shopState.monedas >= item.precio;

    const specialNote = item.id_visual === 'capa_invisible'
      ? '<div style="font-size: 11px; color: #ea80fc; margin-top: 3px;">✨ Tecla [Q / N]: Invisibilidad 10s</div>'
      : '';

    let actionBtn = '';
    if (!isOwned) {
      actionBtn = `
        <button onclick="buyShopItem(${item.id})"
          ${canAfford ? '' : 'disabled'}
          style="width: 100%; padding: 7px; border: none; border-radius: 5px; font-weight: bold; cursor: ${canAfford ? 'pointer' : 'not-allowed'}; background: ${canAfford ? '#ffca28' : '#444'}; color: ${canAfford ? '#111' : '#888'};">
          Comprar (🪙 ${item.precio})
        </button>
      `;
    } else if (isEquipped) {
      actionBtn = `
        <button onclick="toggleEquipItem(${item.id}, true)"
          style="width: 100%; padding: 7px; border: 1px solid #69f0ae; border-radius: 5px; font-weight: bold; cursor: pointer; background: rgba(105, 240, 174, 0.2); color: #69f0ae;">
          ✔ Equipado (Quitar)
        </button>
      `;
    } else {
      actionBtn = `
        <button onclick="toggleEquipItem(${item.id}, false)"
          style="width: 100%; padding: 7px; border: none; border-radius: 5px; font-weight: bold; cursor: pointer; background: #00e5ff; color: #111;">
          Equipar
        </button>
      `;
    }

    return `
      <div style="background: rgba(0,0,0,0.45); border: 1px solid ${isEquipped ? '#69f0ae' : '#333'}; border-radius: 8px; padding: 10px; display: flex; flex-direction: column; justify-content: space-between; gap: 6px;">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="font-size: 10px; text-transform: uppercase; background: #263238; color: #80deea; padding: 2px 6px; border-radius: 4px;">
              ${SLOT_LABELS[item.tipo_equipamiento] || item.tipo_equipamiento}
            </span>
            ${isOwned ? '<span style="font-size: 11px; color: #69f0ae;">Adquirido</span>' : ''}
          </div>
          <div style="font-weight: bold; font-size: 14px; color: #fff;">${item.nombre}</div>
          <div style="font-size: 12px; color: #ffd54f; margin-top: 2px;">
            +${item.valor_mejora} ${STAT_LABELS[item.atributo_mejora] || item.atributo_mejora}
          </div>
          ${specialNote}
        </div>
        <div style="margin-top: 6px;">
          ${actionBtn}
        </div>
      </div>
    `;
  }).join('');
}

// --- COMPRAR Y EQUIPAR ---
window.buyShopItem = async function(itemId) {
  setShopFeedback('Procesando compra...');
  try {
    const res = await fetch(`${SHOP_API_BASE}/api/shop/buy`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ itemId })
    });
    const data = await res.json();

    if (!res.ok) {
      setShopFeedback(data.error || 'No se pudo completar la compra.', true);
      return;
    }

    shopState.monedas = data.monedas;
    if (!shopState.ownedItemIds.includes(itemId)) {
      shopState.ownedItemIds.push(itemId);
    }
    syncDisplayedCoins(data.monedas);
    setShopFeedback(data.message || '¡Compra exitosa!');
    renderShopItemsGrid();
  } catch (err) {
    setShopFeedback('Error de conexión al comprar.', true);
  }
};

window.toggleEquipItem = async function(itemId, isCurrentlyEquipped) {
  const endpoint = isCurrentlyEquipped ? '/api/equipment/unequip' : '/api/equipment/equip';
  try {
    const res = await fetch(`${SHOP_API_BASE}${endpoint}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ clase: selectedShopClass, itemId })
    });
    const data = await res.json();

    if (!res.ok) {
      setShopFeedback(data.error || 'No se pudo actualizar el equipamiento.', true);
      return;
    }

    // Refrescar estado completo desde el servidor para mantener slots sincronizados
    await fetchShopData();
    setShopFeedback(data.message);
    renderCharacterPreviewAndStats();
    renderShopItemsGrid();
  } catch (err) {
    setShopFeedback('Error de conexión al equipar.', true);
  }
};

// --- LOOP DE RENDER DE VISTA PREVIA ---
function startPreviewLoop() {
  stopPreviewLoop();
  const canvas = document.getElementById('shop-preview-canvas');
  if (!canvas) return;
  const pCtx = canvas.getContext('2d');

  function renderPreview() {
    pCtx.clearRect(0, 0, canvas.width, canvas.height);

    // Fondo de pedestal de armería
    pCtx.fillStyle = '#141820';
    pCtx.fillRect(0, 0, canvas.width, canvas.height);

    pCtx.fillStyle = '#2c3342';
    pCtx.fillRect(15, 142, canvas.width - 30, 12);

    if (previewCharacter) {
      if (previewCharacter.className === 'mage') {
        previewCharacter.hoverOffset = Math.sin(Date.now() / 220) * 3.5;
      }
      previewCharacter.draw(pCtx, canvas.width, false);
    }

    previewAnimId = requestAnimationFrame(renderPreview);
  }

  previewAnimId = requestAnimationFrame(renderPreview);
}

function stopPreviewLoop() {
  if (previewAnimId) {
    cancelAnimationFrame(previewAnimId);
    previewAnimId = null;
  }
}