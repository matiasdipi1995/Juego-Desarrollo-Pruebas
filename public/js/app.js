// public/js/app.js
// =============================================================
// CONTROLADOR MULTIJUGADOR ONLINE (1v1, TORNEO, EVENTO ESPECIAL)
// =============================================================

// --- SISTEMA DE AUDIO ---
const ONLINE_SFX = {
  warriorBeam:   new Audio('sonido/soltarCargaGuerrero-cortado.wav'),
  mageSpecial:   new Audio('sonido/SoltarCargaMago.wav'),
  warriorBasic:  new Audio('sonido/espadaso del guerrero.wav'),
  mageBasic:     new Audio('sonido/AtaquedelMago.wav'),
  archerBasic:   new Audio('sonido/AtaquedelMago.wav'),
  archerSpecial: new Audio('sonido/SoltarCargaMago.wav'),
  ninjaBasic:    new Audio('sonido/espadaso del guerrero.wav'),
  ninjaSpecial:  new Audio('sonido/SoltarCargaMago.wav'),
  ninjaVanish:   new Audio('sonido/ActivaDefensa4-Cortado.wav'),
  defense:       new Audio('sonido/ActivaDefensa4-Cortado.wav')
};
ONLINE_SFX.mageSpecial.volume = 0.6;

const bgMusic = new Audio('sonido/sonidoJugando.flac');
bgMusic.loop = true;
bgMusic.volume = 0.3;

function playOnlineSound(name, broadcast = false) {
  const audio = ONLINE_SFX[name];
  if (audio) {
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }
  if (broadcast && myRoomCode) {
    socket.emit('combatSound', { roomCode: myRoomCode, sound: name });
  }
}

// --- REFERENCIAS DOM Y CANVAS ---
const usernameInput = document.getElementById('username');
const freePlayCharSelect = document.getElementById('free-play-char');
const roomCodeInput = document.getElementById('room-code-input');
const btnCreateRoom = document.getElementById('btn-create-room');
const btnJoinRoom = document.getElementById('btn-join-room');
const menuStatus = document.getElementById('menu-status');
const displayRoomCode = document.getElementById('display-room-code');
const p1NameEl = document.getElementById('p1-name');
const p2NameEl = document.getElementById('p2-name');
const seStatusMsg = document.getElementById('special-event-status');

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const keys = {};

window.addEventListener('keydown', e => { keys[e.code] = true; });
window.addEventListener('keyup', e => { keys[e.code] = false; });

// Controles cómodos en online (funciona tanto con WASD como con Flechas)
const ONLINE_CONTROLS = {
  left:      ['KeyA', 'ArrowLeft'],
  right:     ['KeyD', 'ArrowRight'],
  jump:      ['KeyW', 'ArrowUp'],
  defend:    ['KeyS', 'ArrowDown'],
  attack:    ['Space', 'Enter'],
  special:   ['KeyE', 'ShiftRight', 'KeyM'],
  invisible: ['KeyQ', 'KeyN']
};

// --- ESTADO DEL COMBATE ONLINE ---
let animationFrameId = null;
let mySlot = null;         // 'p1' o 'p2'
let myRoomCode = null;
let isTournamentMode = false;
let gameStarted = false;
let roundActive = false;
let lastNetworkSend = 0;
let countdownValue = null;
let scores = { p1: 0, p2: 0 };
let playersMap = { p1: null, p2: null };
let playerNames = { p1: 'Jugador 1', p2: 'Jugador 2' };
let bgImage = new Image();
let bgLoaded = false;

// Pre-cargar stats desde PostgreSQL al iniciar la app
loadCharacterStats();

// --- LIMPIEZA DEL LOOP DE JUEGO ---
window.stopOnlineGameLoop = function() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  gameStarted = false;
  roundActive = false;
  countdownValue = null;
  bgMusic.pause();
  bgMusic.currentTime = 0;
};

window.exitOnlineMatch = function() {
  if (confirm('¿Deseas salir del combate y volver al menú principal?')) {
    socket.emit('leaveAllRooms');
    myRoomCode = null;
    mySlot = null;
    isTournamentMode = false;
    if (typeof returnToMenu === 'function') returnToMenu();
  }
};

function loadBackground(bgMap) {
  if (!bgMap) return;
  bgImage.src = `img/backgrounds/${bgMap}`;
  bgImage.onload = () => { bgLoaded = true; };
  bgImage.onerror = () => { bgLoaded = false; };
}

function resetOnlineEntities() {
  if (playersMap.p1) playersMap.p1.reset();
  if (playersMap.p2) playersMap.p2.reset();
}

// --- BOTONES DE SALA PRIVADA 1v1 ---
if (btnCreateRoom) {
  btnCreateRoom.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    const charClass = freePlayCharSelect ? freePlayCharSelect.value : 'warrior';
    if (!username) return (menuStatus.textContent = 'Por favor, ingresá tu nombre.');
    socket.emit('createRoom', { username, charClass });
  });
}

if (btnJoinRoom) {
  btnJoinRoom.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    const roomCode = roomCodeInput.value.trim();
    const charClass = freePlayCharSelect ? freePlayCharSelect.value : 'mage';
    if (!username) return (menuStatus.textContent = 'Por favor, ingresá tu nombre.');
    if (!roomCode) return (menuStatus.textContent = 'Ingresá el código de la sala.');
    socket.emit('joinRoom', { username, roomCode, charClass });
  });
}

// --- EVENTO ESPECIAL (SALA DE ESPERA) ---
window.joinSpecialEventLobby = function() {
  const specInput = document.getElementById('special-event-username');
  const specChar = document.getElementById('special-event-char');
  const username = (specInput?.value || usernameInput?.value || '').trim();
  const charClass = specChar ? specChar.value : 'warrior';

  if (!username) {
    if (seStatusMsg) seStatusMsg.textContent = 'Por favor, ingresá tu nombre.';
    return;
  }
  if (typeof socket === 'undefined' || !socket.connected) {
    if (seStatusMsg) seStatusMsg.textContent = 'Error de conexión con el servidor.';
    return;
  }

  socket.emit('joinSpecialEventLobby', { username, charClass });
};

// =============================================================
// LISTENERS DE SALA Y EMPAREJAMIENTO
// =============================================================
socket.off('roomCreated');
socket.on('roomCreated', (data) => {
  mySlot = data.slot;
  myRoomCode = data.roomCode;
  if (menuStatus) menuStatus.textContent = `Sala creada: ${myRoomCode}. Esperando oponente...`;
  loadBackground(data.bgMap);
});

socket.off('roomJoined');
socket.on('roomJoined', (data) => {
  mySlot = data.slot;
  myRoomCode = data.roomCode;
  if (menuStatus) menuStatus.textContent = '¡Te uniste con éxito! Iniciando...';
  loadBackground(data.bgMap);
});

socket.off('errorMsg');
socket.on('errorMsg', (msg) => {
  if (menuStatus) menuStatus.textContent = msg;
  if (seStatusMsg) seStatusMsg.textContent = msg;
});

socket.off('specialEventLobbyJoined');
socket.on('specialEventLobbyJoined', () => {
  const joinPanel = document.getElementById('special-event-join-panel');
  const lobbyStatus = document.getElementById('special-event-lobby-status');
  if (joinPanel) joinPanel.style.display = 'none';
  if (lobbyStatus) lobbyStatus.style.display = 'block';
  if (seStatusMsg) seStatusMsg.textContent = 'En sala de espera. Esperando al Administrador...';
});

socket.off('updateSpecialEventLobby');
socket.on('updateSpecialEventLobby', (players) => {
  const countEl = document.getElementById('se-player-count');
  const listEl = document.getElementById('se-players-list');
  if (countEl) countEl.textContent = players.length;
  if (listEl) {
    listEl.innerHTML = '';
    players.forEach(p => {
      const li = document.createElement('li');
      const label = CHARACTER_LABELS[p.charClass] ? ` (${CHARACTER_LABELS[p.charClass]})` : '';
      li.textContent = `${p.name}${label}`;
      listEl.appendChild(li);
    });
  }
});

// =============================================================
// INICIO UNIFICADO DE COMBATE (1v1 ONLINE Y TORNEO)
// =============================================================
async function initMatchStart({ roomCode, players, scores: initialScores, bgMap, slot }) {
  stopOnlineGameLoop();
  await loadCharacterStats();

  if (roomCode) myRoomCode = roomCode;
  if (slot) mySlot = slot;
  if (bgMap) loadBackground(bgMap);

  if (typeof exitMenu === 'function') exitMenu();

  ['special-event-modal', 'tournament-bracket-screen', 'tournament-modal', 'free-play-modal', 'menu-screen'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.style.display = 'none';
      el.classList.remove('active');
    }
  });

  const gameScreen = document.getElementById('game-screen');
  if (gameScreen) {
    gameScreen.style.display = 'flex';
    gameScreen.classList.add('active');
    gameScreen.style.zIndex = '999';
  }

  canvas.width = 800;
  canvas.height = 400;

  if (displayRoomCode && myRoomCode) displayRoomCode.textContent = myRoomCode;

  const p1Data = players.find(p => p.slot === 'p1') || { name: 'Jugador 1', charClass: 'warrior' };
  const p2Data = players.find(p => p.slot === 'p2') || { name: 'Jugador 2', charClass: 'mage' };

  // Si no teníamos mySlot aún, inferirlo por socket.id
  if (!mySlot) {
    const me = players.find(p => p.id === socket.id);
    if (me) mySlot = me.slot;
  }

  playerNames.p1 = `${p1Data.name} (${CHARACTER_LABELS[p1Data.charClass] || 'P1'})`;
  playerNames.p2 = `${p2Data.name} (${CHARACTER_LABELS[p2Data.charClass] || 'P2'})`;
  if (p1NameEl) p1NameEl.textContent = playerNames.p1;
  if (p2NameEl) p2NameEl.textContent = playerNames.p2;

  const charHeight = 75;
  const startY = canvas.height - 30 - charHeight;

  playersMap.p1 = createCharacterInstance(p1Data.charClass, {
    x: 100, y: startY, width: 45, height: charHeight,
    jumpPower: -12.5, direction: 1,
    hpId: 'p1-hp', manaId: 'p1-mana',
    stats: p1Data.stats,
    equipment: p1Data.equipment,
    controls: mySlot === 'p1' ? ONLINE_CONTROLS : null
  });

  playersMap.p2 = createCharacterInstance(p2Data.charClass, {
    x: canvas.width - 145, y: startY, width: 45, height: charHeight,
    jumpPower: -12.5, direction: -1,
    hpId: 'p2-hp', manaId: 'p2-mana',
    stats: p2Data.stats,
    equipment: p2Data.equipment,
    controls: mySlot === 'p2' ? ONLINE_CONTROLS : null
  });

  scores = initialScores ? { ...initialScores } : { p1: 0, p2: 0 };
  resetOnlineEntities();

  gameStarted = true;
  roundActive = false; // Esperamos al startNewRound del servidor tras el 3-2-1
  animationFrameId = requestAnimationFrame(gameLoop);

  bgMusic.currentTime = 0;
  bgMusic.play().catch(() => {});
}

socket.off('gameStart');
socket.on('gameStart', (data) => {
  isTournamentMode = false;
  initMatchStart(data);
});

socket.off('launchMatch');
socket.on('launchMatch', (data) => {
  isTournamentMode = true;
  socket.emit('joinTournamentMatch', { roomCode: data.roomCode });
  initMatchStart(data);
});

// =============================================================
// LISTENERS DE COMBATE EN TIEMPO REAL (FILTRADOS POR SALA)
// =============================================================
socket.off('countdownTick');
socket.on('countdownTick', (data) => {
  if (data?.roomCode && data.roomCode !== myRoomCode) return;
  roundActive = false;
  countdownValue = typeof data === 'object' ? data.count : data;
});

socket.off('startNewRound');
socket.on('startNewRound', (data) => {
  if (data?.roomCode && data.roomCode !== myRoomCode) return;
  countdownValue = null;
  resetOnlineEntities();
  roundActive = true;
});

socket.off('enemyAction');
socket.on('enemyAction', (data) => {
  if (!data || data.roomCode !== myRoomCode || data.slot === mySlot) return;
  const remote = playersMap[data.slot];
  if (!remote) return;

  if (typeof data.x === 'number' && !isNaN(data.x)) remote.targetX = data.x;
  if (typeof data.y === 'number' && !isNaN(data.y)) remote.targetY = data.y;
  if (data.direction !== undefined) remote.direction = data.direction;

  remote.isDefending = !!data.isDefending;
  remote.isInvisible = !!data.isInvisible;

  if (data.isAttacking !== undefined) remote.isAttacking = !!data.isAttacking;
  if (data.isCharging !== undefined) remote.isCharging = !!data.isCharging;
  if (data.chargeTime !== undefined) remote.chargeTime = data.chargeTime;
  if (data.isDashing !== undefined) remote.isDashing = !!data.isDashing;
  if (data.dashPhase !== undefined) remote.dashPhase = data.dashPhase;

  if (typeof data.mana === 'number') {
    remote.mana = data.mana;
    remote.updateManaBar();
  }
  if (typeof data.hp === 'number') {
    remote.hp = data.hp;
    remote.updateHpBar();
  }
});

socket.off('playerDamaged');
socket.on('playerDamaged', (data) => {
  if (!data || data.roomCode !== myRoomCode || data.targetSlot !== mySlot) return;
  const me = playersMap[mySlot];
  if (!me) return;

  me.applyDamage(data.amount);

  if (me.hp <= 0 && roundActive) {
    roundActive = false;
    const winnerSlot = mySlot === 'p1' ? 'p2' : 'p1';
    socket.emit('roundWon', { roomCode: myRoomCode, winnerSlot });
  }
});

socket.off('spawnProjectile');
socket.on('spawnProjectile', (data) => {
  if (!data || data.roomCode !== myRoomCode || data.slot === mySlot) return;
  const remote = playersMap[data.slot];
  if (!remote) return;

  if (data.type === 'mageShoot' && typeof remote.spawnProjectile === 'function') {
    remote.spawnProjectile(data.x, data.y, data.dir, data.visualId);
  } else if (data.type === 'archerShoot' && typeof remote.spawnArrow === 'function') {
    remote.spawnArrow(data.x, data.y, data.dir, data.visualId);
  } else if (data.type === 'ninjaShoot' && typeof remote.spawnShuriken === 'function') {
    remote.spawnShuriken(data.x, data.y, data.dir, data.visualId);
  }
});

socket.off('triggerSpecial');
socket.on('triggerSpecial', (data) => {
  if (!data || data.roomCode !== myRoomCode || data.slot === mySlot) return;
  const remote = playersMap[data.slot];
  if (!remote) return;

  if (data.type === 'warriorBeam' && typeof remote.spawnBeam === 'function') {
    remote.spawnBeam(data.x, data.y, data.dir, data.visualId);
  } else if (data.type === 'mageDash' && typeof remote.triggerDash === 'function') {
    remote.triggerDash(data.dir, canvas.width);
  } else if (data.type === 'archerSpecial' && typeof remote.spawnSpecialArrow === 'function') {
    remote.spawnSpecialArrow(data.x, data.y, data.dir, data.damage, data.visualId);
  } else if (data.type === 'ninjaDash' && typeof remote.triggerDoubleDash === 'function') {
    remote.triggerDoubleDash(data.dir, canvas.width);
  } else if (data.type === 'ninjaInvisible' && typeof remote.activateInvisibility === 'function') {
    remote.activateInvisibility(data.duration || 10000);
  }
});

socket.off('playRemoteSound');
socket.on('playRemoteSound', (data) => {
  if (!data || data.roomCode !== myRoomCode || data.slot === mySlot) return;
  playOnlineSound(data.sound, false);
});

socket.off('roundResult');
socket.on('roundResult', (data) => {
  if (!data || data.roomCode !== myRoomCode) return;

  scores = data.scores || scores;
  roundActive = false;

  if (data.isGameOver) {
    stopOnlineGameLoop();

    setTimeout(() => {
      const myReward = data.rewards?.[mySlot];
      if (myReward && typeof myReward.total === 'number') {
        if (window.currentUser) window.currentUser.monedas = myReward.total;
        const coinsEl = document.getElementById('menu-coins');
        if (coinsEl) coinsEl.textContent = myReward.total;
      }

      const extra = data.byDisconnect ? ' (por abandono del rival)' : '';
      const coinMsg = myReward && typeof myReward.total === 'number'
        ? `\n🪙 Ganaste +${myReward.earned} monedas (Total: ${myReward.total})`
        : '';
      alert(`¡Combate Terminado! Ganador: ${(data.winnerName || data.winnerSlot).toUpperCase()}${extra}${coinMsg}`);

      myRoomCode = null;
      mySlot = null;

      const gameScreen = document.getElementById('game-screen');
      if (gameScreen) {
        gameScreen.style.display = 'none';
        gameScreen.classList.remove('active');
      }

      if (isTournamentMode) {
        const bracketScreen = document.getElementById('tournament-bracket-screen');
        if (bracketScreen) bracketScreen.style.display = 'flex';
      } else if (typeof returnToMenu === 'function') {
        returnToMenu();
      }
    }, 450);
  }
});
socket.off('playerLeft');
socket.on('playerLeft', (data) => {
  if (data?.roomCode && data.roomCode !== myRoomCode) return;
  stopOnlineGameLoop();
  myRoomCode = null;
  mySlot = null;
  alert('El oponente se ha desconectado de la sala.');
  if (typeof returnToMenu === 'function') returnToMenu();
});

// =============================================================
// CONTROLES TÁCTILES (SE VINCULAN UNA SOLA VEZ)
// =============================================================
function initTouchControlsOnce() {
  const bind = (id, keyCode) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); keys[keyCode] = true; });
    btn.addEventListener('touchend', (e) => { e.preventDefault(); keys[keyCode] = false; });
    btn.addEventListener('mousedown', () => { keys[keyCode] = true; });
    btn.addEventListener('mouseup', () => { keys[keyCode] = false; });
  };

  bind('btn-left', 'KeyA');
  bind('btn-right', 'KeyD');
  bind('btn-jump', 'KeyW');
  bind('btn-defend', 'KeyS');
  bind('btn-attack', 'Space');
  bind('btn-special', 'KeyE');
}
initTouchControlsOnce();

// =============================================================
// BUCLE PRINCIPAL DE RENDER Y RED
// =============================================================
function drawUI() {
  ctx.fillStyle = '#ffeb3b';
  ctx.font = 'bold 20px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`P1: ${scores.p1 || 0}  VS  P2: ${scores.p2 || 0}`, canvas.width / 2, 32);

  if (countdownValue !== null) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.font = 'bold 85px Arial';
    ctx.fillText(countdownValue, canvas.width / 2 + 3, canvas.height / 2 + 3);

    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 80px Arial';
    ctx.fillText(countdownValue, canvas.width / 2, canvas.height / 2);
  }
}

function gameLoop() {
  if (!gameStarted) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (bgLoaded && bgImage.complete && bgImage.naturalWidth !== 0) {
    ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = '#1a1d24';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Piso
  ctx.fillStyle = '#3a3f4d';
  ctx.fillRect(0, canvas.height - 30, canvas.width, 30);

  const myChar = playersMap[mySlot];
  const enemySlot = mySlot === 'p1' ? 'p2' : 'p1';
  const enemyChar = playersMap[enemySlot];

  if (myChar && enemyChar) {
    // 1. Actualizar mi personaje (local)
    myChar.update(enemyChar, {
      keys,
      canvas,
      roundActive,
      isLocal: true,
      callbacks: {
        onSound: (sound) => playOnlineSound(sound, true),
        onDamage: (amount) => {
          socket.emit('sendDamage', { roomCode: myRoomCode, amount });
          if (enemyChar.hp <= 0 && roundActive) {
            roundActive = false;
            socket.emit('roundWon', { roomCode: myRoomCode, winnerSlot: mySlot });
          }
        },
        onShoot: (payload) => socket.emit('combatShoot', { ...payload, roomCode: myRoomCode }),
        onSpecial: (payload) => socket.emit('combatSpecial', { ...payload, roomCode: myRoomCode })
      }
    });

    // 2. Actualizar rival (interpolación y proyectiles remotos)
    enemyChar.update(myChar, {
      keys: {},
      canvas,
      roundActive,
      isLocal: false,
      callbacks: {}
    });

    // 3. Enviar estado por red cada ~40ms (25 paquetes/seg, sin saturar)
    const now = Date.now();
    if (now - lastNetworkSend > 40 && myRoomCode) {
      socket.emit('playerAction', {
        roomCode: myRoomCode,
        x: myChar.x,
        y: myChar.y,
        direction: myChar.direction,
        hp: myChar.hp,
        mana: myChar.mana,
        isDefending: myChar.isDefending,
        isInvisible: myChar.isInvisible,
        isAttacking: myChar.isAttacking || false,
        isCharging: myChar.isCharging || false,
        chargeTime: myChar.chargeTime || 0,
        isDashing: myChar.isDashing || false,
        dashPhase: myChar.dashPhase || 0
      });
      lastNetworkSend = now;
    }

    // 4. Dibujar (con vista enemiga activada para el rival, respetando invisibilidad)
    playersMap.p1.draw(ctx, canvas.width, mySlot !== 'p1');
    playersMap.p2.draw(ctx, canvas.width, mySlot !== 'p2');
  }

  drawUI();
  animationFrameId = requestAnimationFrame(gameLoop);
}