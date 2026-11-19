// public/js/adminClient.js
// =============================================================
// PANEL DE ADMINISTRACIÓN PROTEGIDO POR JWT
// =============================================================

const ADMIN_API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:3000'
  : 'https://juego-desarrollo-pruebas.onrender.com';

const adminSocket = io(ADMIN_API_BASE, {
  transports: ['websocket', 'polling'],
  auth: { token: localStorage.getItem('token') }
});

let adminData = { stats: [], items: [], users: [] };
let adminPreviewChar = null;
let adminPreviewAnimId = null;

function getAdminHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  };
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showAdminBanner(msg, isError = false) {
  const el = document.getElementById('admin-toast');
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? '#ff5252' : '#69f0ae';
  el.style.borderColor = isError ? '#ff5252' : '#69f0ae';
  el.style.display = 'block';
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => { el.style.display = 'none'; }, 4000);
}

// --- VERIFICACIÓN DE ACCESO AL CARGAR ---
document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = 'index.html';
    return;
  }

  const ok = await loadAdminOverview();
  if (!ok) return;

  adminSocket.emit('registerAdmin');
  switchAdminTab('event');
  updateNewItemPreview();
  startAdminPreviewLoop();
});

async function loadAdminOverview() {
  try {
    const res = await fetch(`${ADMIN_API_BASE}/api/admin/overview`, {
      headers: getAdminHeaders()
    });

    if (res.status === 401 || res.status === 403) {
      alert('Acceso restringido: solo administradores.');
      window.location.href = 'index.html';
      return false;
    }

    const data = await res.json();
    if (!res.ok) {
      showAdminBanner(data.error || 'Error cargando panel.', true);
      return false;
    }

    adminData = data;
    renderStatsTable();
    renderItemsTable();
    renderUsersTable();
    return true;
  } catch (err) {
    showAdminBanner('Error de conexión con el servidor.', true);
    return false;
  }
}

// --- NAVEGACIÓN POR PESTAÑAS ---
window.switchAdminTab = function(tabName) {
  document.querySelectorAll('.admin-section').forEach(sec => {
    sec.style.display = sec.dataset.tab === tabName ? 'block' : 'none';
  });

  document.querySelectorAll('.admin-tab-btn').forEach(btn => {
    const active = btn.dataset.tab === tabName;
    btn.style.background = active ? '#ffca28' : 'rgba(255,255,255,0.08)';
    btn.style.color = active ? '#111' : '#fff';
    btn.style.borderColor = active ? '#ffca28' : '#444';
  });
};

// =============================================================
// 1. EVENTO ESPECIAL EN VIVO
// =============================================================
adminSocket.on('updateSpecialEventLobby', (players) => {
  const countEl = document.getElementById('admin-se-count');
  const listEl = document.getElementById('admin-se-list');
  if (countEl) countEl.textContent = players.length;
  if (!listEl) return;

  if (players.length === 0) {
    listEl.innerHTML = '<li style="color: #888;">No hay jugadores en sala de espera todavía.</li>';
    return;
  }

  listEl.innerHTML = players.map((p, idx) => {
    const cls = CHARACTER_LABELS[p.charClass] || p.charClass || 'Guerrero';
    return `<li style="padding: 4px 0; border-bottom: 1px solid #333;">${idx + 1}. <b>${escapeHtml(p.name)}</b> — <span style="color: #00e5ff;">${escapeHtml(cls)}</span></li>`;
  }).join('');
});

adminSocket.on('adminError', (msg) => showAdminBanner(msg, true));

adminSocket.on('specialEventStartedSuccess', ({ tCode }) => {
  showAdminBanner(`¡Evento Especial iniciado! Código de torneo: ${tCode}`);
});

window.triggerSpecialEventStart = function() {
  adminSocket.emit('adminStartSpecialEvent');
};

// =============================================================
// 2. BALANCE DE PERSONAJES
// =============================================================
function renderStatsTable() {
  const tbody = document.getElementById('admin-stats-tbody');
  if (!tbody) return;

  tbody.innerHTML = adminData.stats.map(s => {
    const label = CHARACTER_LABELS[s.clase] || s.clase;
    return `
      <tr>
        <td style="font-weight: bold; color: #00e5ff;">${escapeHtml(label)}</td>
        <td><input type="number" id="stat-vida-${s.clase}" value="${s.vida_base}" min="50" max="5000" class="admin-num-input"></td>
        <td><input type="number" id="stat-mana-${s.clase}" value="${s.mana_base}" min="20" max="1000" class="admin-num-input"></td>
        <td><input type="number" id="stat-ataque-${s.clase}" value="${s.ataque_base}" min="1" max="1000" class="admin-num-input"></td>
        <td><input type="number" id="stat-defensa-${s.clase}" value="${s.defensa_base}" min="0" max="1000" class="admin-num-input"></td>
        <td>
          <button onclick="saveCharacterStats('${s.clase}')" class="admin-btn-save">Guardar</button>
        </td>
      </tr>
    `;
  }).join('');
}

window.saveCharacterStats = async function(clase) {
  const payload = {
    vida_base: document.getElementById(`stat-vida-${clase}`).value,
    mana_base: document.getElementById(`stat-mana-${clase}`).value,
    ataque_base: document.getElementById(`stat-ataque-${clase}`).value,
    defensa_base: document.getElementById(`stat-defensa-${clase}`).value
  };

  try {
    const res = await fetch(`${ADMIN_API_BASE}/api/admin/stats/${clase}`, {
      method: 'PUT',
      headers: getAdminHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) return showAdminBanner(data.error || 'Error guardando.', true);

    showAdminBanner(data.message);
    await loadAdminOverview();
  } catch (err) {
    showAdminBanner('Error de red al guardar.', true);
  }
};

// =============================================================
// 3. GESTIÓN DE TIENDA E ÍTEMS + VISTA PREVIA CANVAS
// =============================================================
window.updateNewItemPreview = function() {
  const claseSelect = document.getElementById('new-item-class')?.value || 'warrior';
  const targetClass = claseSelect === 'todas' ? 'warrior' : claseSelect;
  const slot = document.getElementById('new-item-slot')?.value || 'arma';
  const visualId = document.getElementById('new-item-visual')?.value || null;

  const equipment = { arma: null, armadura: null, sombrero: null, accesorio: null };
  equipment[slot] = visualId;

  if (typeof createCharacterInstance === 'function') {
    adminPreviewChar = createCharacterInstance(targetClass, {
      x: 56,
      y: 62,
      width: 48,
      height: 80,
      direction: 1,
      equipment
    });
  }
};

function startAdminPreviewLoop() {
  if (adminPreviewAnimId) cancelAnimationFrame(adminPreviewAnimId);
  const canvas = document.getElementById('admin-item-canvas');
  if (!canvas) return;
  const pCtx = canvas.getContext('2d');

  function loop() {
    pCtx.clearRect(0, 0, canvas.width, canvas.height);
    pCtx.fillStyle = '#141820';
    pCtx.fillRect(0, 0, canvas.width, canvas.height);
    pCtx.fillStyle = '#2c3342';
    pCtx.fillRect(15, 142, canvas.width - 30, 12);

    if (adminPreviewChar) {
      if (adminPreviewChar.className === 'mage') {
        adminPreviewChar.hoverOffset = Math.sin(Date.now() / 220) * 3.5;
      }
      adminPreviewChar.draw(pCtx, canvas.width, false);
    }
    adminPreviewAnimId = requestAnimationFrame(loop);
  }
  adminPreviewAnimId = requestAnimationFrame(loop);
}

window.createNewShopItem = async function(e) {
  e.preventDefault();
  const payload = {
    nombre: document.getElementById('new-item-name').value.trim(),
    clase_compatible: document.getElementById('new-item-class').value,
    tipo_equipamiento: document.getElementById('new-item-slot').value,
    atributo_mejora: document.getElementById('new-item-attr').value,
    valor_mejora: document.getElementById('new-item-bonus').value,
    precio: document.getElementById('new-item-price').value,
    id_visual: document.getElementById('new-item-visual').value
  };

  try {
    const res = await fetch(`${ADMIN_API_BASE}/api/admin/items`, {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) return showAdminBanner(data.error || 'Error al crear ítem.', true);

    document.getElementById('new-item-name').value = '';
    showAdminBanner(data.message);
    await loadAdminOverview();
  } catch (err) {
    showAdminBanner('Error de red al crear ítem.', true);
  }
};

function renderItemsTable() {
  const tbody = document.getElementById('admin-items-tbody');
  if (!tbody) return;

  tbody.innerHTML = adminData.items.map(item => `
    <tr>
      <td>${item.id}</td>
      <td><input type="text" id="item-name-${item.id}" value="${escapeHtml(item.nombre)}" class="admin-text-input"></td>
      <td style="color: #80deea;">${escapeHtml(CHARACTER_LABELS[item.clase_compatible] || item.clase_compatible)}</td>
      <td>${escapeHtml(item.tipo_equipamiento)}</td>
      <td>${escapeHtml(item.atributo_mejora)}</td>
      <td><input type="number" id="item-bonus-${item.id}" value="${item.valor_mejora}" min="1" class="admin-num-input"></td>
      <td><input type="number" id="item-price-${item.id}" value="${item.precio}" min="0" class="admin-num-input"></td>
      <td style="font-size: 11px; color: #aaa;">${escapeHtml(item.id_visual)}</td>
      <td style="display: flex; gap: 5px;">
        <button onclick="updateShopItem(${item.id})" class="admin-btn-save">Guardar</button>
        <button onclick="deleteShopItem(${item.id}, '${escapeHtml(item.nombre)}')" class="admin-btn-del">X</button>
      </td>
    </tr>
  `).join('');
}

window.updateShopItem = async function(id) {
  const payload = {
    nombre: document.getElementById(`item-name-${id}`).value.trim(),
    valor_mejora: document.getElementById(`item-bonus-${id}`).value,
    precio: document.getElementById(`item-price-${id}`).value
  };

  try {
    const res = await fetch(`${ADMIN_API_BASE}/api/admin/items/${id}`, {
      method: 'PUT',
      headers: getAdminHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) return showAdminBanner(data.error || 'Error al actualizar.', true);

    showAdminBanner(data.message);
    await loadAdminOverview();
  } catch (err) {
    showAdminBanner('Error de red.', true);
  }
};

window.deleteShopItem = async function(id, name) {
  if (!confirm(`¿Seguro que deseas eliminar "${name}"? Se quitará también de los inventarios.`)) return;
  try {
    const res = await fetch(`${ADMIN_API_BASE}/api/admin/items/${id}`, {
      method: 'DELETE',
      headers: getAdminHeaders()
    });
    const data = await res.json();
    if (!res.ok) return showAdminBanner(data.error || 'Error al eliminar.', true);

    showAdminBanner(data.message);
    await loadAdminOverview();
  } catch (err) {
    showAdminBanner('Error de red.', true);
  }
};

// =============================================================
// 4. USUARIOS Y MONEDAS
// =============================================================
function renderUsersTable() {
  const tbody = document.getElementById('admin-users-tbody');
  if (!tbody) return;

  tbody.innerHTML = adminData.users.map(u => `
    <tr>
      <td>${u.id}</td>
      <td><b>${escapeHtml(u.username)}</b></td>
      <td style="font-size: 12px; color: #bbb;">${escapeHtml(u.email)}</td>
      <td><input type="number" id="user-coins-${u.id}" value="${u.monedas}" min="0" class="admin-num-input" style="width: 90px;"></td>
      <td>
        <select id="user-rol-${u.id}" class="admin-select-input">
          <option value="jugador" ${u.rol === 'jugador' ? 'selected' : ''}>jugador</option>
          <option value="admin" ${u.rol === 'admin' ? 'selected' : ''}>admin</option>
        </select>
      </td>
      <td>
        <button onclick="saveUserAdmin(${u.id})" class="admin-btn-save">Aplicar</button>
      </td>
    </tr>
  `).join('');
}

window.saveUserAdmin = async function(userId) {
  const payload = {
    monedas: document.getElementById(`user-coins-${userId}`).value,
    rol: document.getElementById(`user-rol-${userId}`).value
  };

  try {
    const res = await fetch(`${ADMIN_API_BASE}/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: getAdminHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) return showAdminBanner(data.error || 'Error al actualizar usuario.', true);

    showAdminBanner(data.message);
    await loadAdminOverview();
  } catch (err) {
    showAdminBanner('Error de red.', true);
  }
};