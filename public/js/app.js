const btnJoinSpecialEvent = document.getElementById('btn-join-special-event');
const specialUsernameInput = document.getElementById('special-event-username');
const seStatusMsg = document.getElementById('special-event-status');


//// --- AUDIO SYSTEM ---
const warriorBeamSFX = new Audio('sonido/soltarCargaGuerrero-cortado.wav');

// Habilidad Especial Mago
const mageBeamSFX = new Audio('sonido/SoltarCargaMago.wav');
mageBeamSFX.volume = 0.6;

// Ataques Básicos
const warriorBasicAttackSFX = new Audio('sonido/espadaso del guerrero.wav');
const mageBasicAttackSFX = new Audio('sonido/AtaquedelMago.wav');

// Defensa (Compartido)
const defenseSFX = new Audio('sonido/ActivaDefensa4-Cortado.wav');

// Música de fondo de batalla
const bgMusic = new Audio('sonido/sonidoJugando.flac');
bgMusic.loop = true;
bgMusic.volume = 0.3;

// UI & CANVAS
const menuScreen = document.getElementById('menu-screen');
const gameScreen = document.getElementById('game-screen');
const usernameInput = document.getElementById('username');
const roomCodeInput = document.getElementById('room-code-input');
const btnCreateRoom = document.getElementById('btn-create-room');
const btnJoinRoom = document.getElementById('btn-join-room');
const menuStatus = document.getElementById('menu-status');
const displayRoomCode = document.getElementById('display-room-code');
let isTournamentMode = false;
const uiWarriorName = document.getElementById('ui-warrior-name');
const uiMageName = document.getElementById('ui-mage-name');

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const keys = {};

let animationFrameId = null; // Guarda la referencia al loop activo

let myRole = null;
let myRoomCode = null;
let gameStarted = false;
let roundActive = false;
let lastNetworkSend = 0;
let scores = { warrior: 0, mage: 0 };
let countdownValue = null;

window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);

// -------------------------------------------------------------
// EVENTOS DE SALA Y SOCKETS (BOTONES E INICIALIZACIÓN DE SALA)
// -------------------------------------------------------------

if (btnCreateRoom) {
  btnCreateRoom.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    if (!username) return menuStatus.textContent = 'Por favor, ingresá tu nombre.';
    socket.emit('createRoom', { username });
  });
}

if (btnJoinRoom) {
  btnJoinRoom.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    const roomCode = roomCodeInput.value.trim();
    if (!username) return menuStatus.textContent = 'Por favor, ingresá tu nombre.';
    if (!roomCode) return menuStatus.textContent = 'Ingresá el código de la sala.';
    socket.emit('joinRoom', { username, roomCode });
  });
}

socket.off('roomCreated');
socket.on('roomCreated', (data) => {
  myRole = data.role;
  myRoomCode = data.roomCode;
  if (menuStatus) menuStatus.textContent = `Sala creada: ${myRoomCode}. Esperando oponente...`;
  loadBackground(data.bgMap);
});

socket.off('roomJoined');
socket.on('roomJoined', (data) => {
  myRole = data.role;
  myRoomCode = data.roomCode;
  if (menuStatus) menuStatus.textContent = '¡Te uniste con éxito! Iniciando...';
  loadBackground(data.bgMap);
});

// -------------------------------------------------------------
// EVENTOS DE COMBATE Y SONIDOS (CON FILTRADO DE SUB-SALA)
// -------------------------------------------------------------

socket.off('basicAttackSound');
socket.on('basicAttackSound', (data) => {
  if (data && data.roomCode && data.roomCode !== myRoomCode) return;
  if (data.role !== myRole) {
    const sfx = data.role === 'warrior' ? warriorBasicAttackSFX : mageBasicAttackSFX;
    sfx.currentTime = 0;
    sfx.play().catch(e => console.log("Audio bloqueado:", e));
  }
});

socket.off('mageSpecialSound');
socket.on('mageSpecialSound', (data) => {
  if (data && data.roomCode && data.roomCode !== myRoomCode) return;
  if (myRole === 'warrior') {
    mageBeamSFX.currentTime = 0;
    mageBeamSFX.play().catch(e => console.log("Audio bloqueado:", e));
  }
});

socket.off('defenseSound');
socket.on('defenseSound', (data) => {
  if (data && data.roomCode && data.roomCode !== myRoomCode) return;
  defenseSFX.currentTime = 0;
  defenseSFX.play().catch(e => console.log("Audio bloqueado:", e));
});

socket.off('errorMsg');
socket.on('errorMsg', (msg) => { if (menuStatus) menuStatus.textContent = msg; });

// Función unificada para iniciar el juego en 1v1 y en Torneos
function initMatchStart(playersData, initialScores) {
  const menuScreen = document.getElementById('menu-screen');
  if (menuScreen) {
    menuScreen.style.display = 'none';
    menuScreen.style.zIndex = '0';
    if (typeof stopAmbientAudio === 'function') stopAmbientAudio();
    if (typeof exitMenu === 'function') exitMenu();
  }

  const gameScreen = document.getElementById('game-screen');
  if (gameScreen) {
    gameScreen.style.display = 'flex';
    gameScreen.style.zIndex = '999';
  }

  const freePlayModal = document.getElementById('free-play-modal');
  if (freePlayModal) freePlayModal.style.display = 'none';

  const tournamentModal = document.getElementById('tournament-modal');
  if (tournamentModal) tournamentModal.style.display = 'none';

  if (canvas) {
    canvas.width = 800;
    canvas.height = 400;
  }

  const storedRole = sessionStorage.getItem('myRole');
  const storedRoom = sessionStorage.getItem('roomCode');
  const storedBg = sessionStorage.getItem('bgMap');

  if (storedRole) myRole = storedRole;
  if (storedRoom) myRoomCode = storedRoom;
  if (storedBg) loadBackground(storedBg);

  if (displayRoomCode && myRoomCode) {
    displayRoomCode.textContent = myRoomCode;
  }

  if (playersData && Array.isArray(playersData)) {
    const warriorPlayer = playersData.find(p => p && p.role === 'warrior');
    const magePlayer = playersData.find(p => p && p.role === 'mage');

    if (warriorPlayer && uiWarriorName) uiWarriorName.textContent = warriorPlayer.name;
    if (magePlayer && uiMageName) uiMageName.textContent = magePlayer.name;
  }

  scores = initialScores || { warrior: 0, mage: 0 };

  gameStarted = true;
  roundActive = true;

  setupTouchControls();
  resetEntities();

  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  animationFrameId = requestAnimationFrame(gameLoop);

  bgMusic.currentTime = 0;
  bgMusic.play().catch(err => console.log('Autoplay bloqueado:', err));
}

// Listener para Partida Normal 1v1
socket.on('gameStart', ({ players, scores: initialScores }) => {
  isTournamentMode = false; // 👈 Marca que es 1v1 normal
  initMatchStart(players, initialScores);
});

// Listener para Partida de Torneo
let currentMatchCode = null;

// Listener único de inicio de pelea en torneo
socket.off('launchMatch');
socket.on('launchMatch', (data) => {
  console.log(`[CLIENTE] 🚀 Uniéndose a pelea de torneo | Sala: ${data.roomCode}`);
  isTournamentMode = true;

  // 1. OCULTAMOS TODOS LOS MODALES Y PANTALLAS SEGÚN LOS ID DE TU INDEX.HTML
  const elementsToHide = [
    'special-event-modal',        // 👈 Este es el cuadro que quedaba flotando en pantalla
    'tournament-bracket-screen',  // Pantalla del Árbol del Torneo
    'tournament-modal',           // Modal de Torneo
    'free-play-modal',            // Modal de 1v1
    'menu-screen'                 // Menú Principal
  ];

  elementsToHide.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.style.display = 'none';
    }
  });

  // 2. MOSTRAMOS EL JUEGO (CANVAS Y UI)
  const gameScreen = document.getElementById('game-screen');
  if (gameScreen) {
    gameScreen.style.display = 'flex'; // Muestra la pantalla de pelea limpia
    gameScreen.classList.add('active');
  }

  // 3. ACTUALIZAMOS CÓDIGO DE SALA Y CONFIGURACIÓN
  const roomDisplay = document.getElementById('display-room-code');
  if (roomDisplay) roomDisplay.textContent = data.roomCode;

  myRoomCode = data.roomCode;
  myRole = data.role;
  sessionStorage.setItem('roomCode', data.roomCode);
  sessionStorage.setItem('myRole', data.role);

  // Unir socket a la sub-sala de la pelea
  socket.emit('joinTournamentMatch', { roomCode: data.roomCode });

  if (data.bgMap) {
    sessionStorage.setItem('bgMap', data.bgMap);
    if (typeof loadBackground === 'function') {
      loadBackground(data.bgMap);
    }
  }

  // Arrancar lógica de renderizado e inputs de la pelea
  initMatchStart(data.players, data.scores);
});

socket.off('playerDamaged');
// -------------------------------------------------------------
// RECEPCIÓN DE DAÑO DESDE LA RED
// -------------------------------------------------------------
socket.on('playerDamaged', (data) => {
  // Tomamos el daño enviado (soporta si viene como amount o damage)
  const damageReceived = data.amount || data.damage || 0;
  
  // Determinamos quién es la víctima según el target enviado por la red
  const targetCharacter = (data.target === 'warrior') ? warrior : mage;

  if (targetCharacter) {
    // Si la víctima es el personaje que controla ESTE jugador localmente
    // (quiere decir que el rival nos pegó a nosotros)
    if ((myRole === 'warrior' && data.target === 'warrior') || 
        (myRole === 'mage' && data.target === 'mage')) {
      
      // Aplicamos el daño y FORZAMOS la actualización de la barra en nuestro DOM
      targetCharacter.applyDamage(damageReceived);
    }
  }
});
// Este listener DEBE estar registrado globalmente UNA SOLA VEZ al arrancar app.js

socket.off('countdownTick');
socket.on('countdownTick', (count) => {
  roundActive = false;
  countdownValue = count;
});

socket.off('startNewRound');
socket.on('startNewRound', () => {
  countdownValue = null;
  resetEntities();
  roundActive = true;
});

socket.off('playerLeft');
socket.on('playerLeft', () => {
  alert('El oponente se ha desconectado.');
  location.reload();
});

// FILTRADO DE MOVIMIENTO Y ACCIONES
// FILTRADO DE MOVIMIENTO Y ACCIONES
socket.off('enemyAction');
socket.on('enemyAction', (data) => {
  if (!data) return;
  if (data.roomCode && data.roomCode !== myRoomCode) return;

  if (myRole === 'warrior' && mage) {
    if (typeof data.x === 'number' && !isNaN(data.x)) mage.targetX = data.x;
    if (typeof data.y === 'number' && !isNaN(data.y)) mage.targetY = data.y;
    if (data.direction !== undefined) mage.direction = data.direction;
    
    mage.isDefending = !!data.isDefending;
    mage.isDashing = !!data.isDashing;
    
    if (data.mana !== undefined && typeof mage.updateManaBar === 'function') {
      mage.mana = data.mana;
      mage.updateManaBar();
    }
  } else if (myRole === 'mage' && warrior) {
    if (typeof data.x === 'number' && !isNaN(data.x)) warrior.targetX = data.x;
    if (typeof data.y === 'number' && !isNaN(data.y)) warrior.targetY = data.y;
    if (data.direction !== undefined) warrior.direction = data.direction;
    
    warrior.isDefending = !!data.isDefending;
    warrior.isAttacking = !!data.isAttacking;
    warrior.isCharging = !!data.isCharging;
    
    if (data.mana !== undefined && typeof warrior.updateManaBar === 'function') {
      warrior.mana = data.mana;
      warrior.updateManaBar();
    }
  }
});

socket.off('spawnMageProjectile');
socket.on('spawnMageProjectile', (data) => {
  if (data && data.roomCode && data.roomCode !== myRoomCode) return;
  if (mage) mage.projectiles.push(new Projectile(data.x, data.y, data.dir));
});

socket.off('spawnWarriorBeam');
socket.on('spawnWarriorBeam', (data) => {
  if (data && data.roomCode && data.roomCode !== myRoomCode) return;
  if (myRole === 'mage' && warrior) {
    warrior.activeBeam = new WarriorBeam(data.x, data.y, data.dir);
    warriorBeamSFX.currentTime = 0;
    warriorBeamSFX.play().catch(e => console.log(e));
  }
});

socket.off('executeMageDash');
socket.on('executeMageDash', (data) => {
  if (data && data.roomCode && data.roomCode !== myRoomCode) return;
  if (mage) mage.triggerDash(data.dir);
});

// FILTRADO DE APLICACIÓN DE DAÑO
socket.off('takeDamageSync');
socket.on('takeDamageSync', (data) => {
  if (data && data.roomCode && data.roomCode !== myRoomCode) {
    console.warn(`[FILTRO DAÑO] Ignorado daño fantasma recibido de la sala: ${data.roomCode}`);
    return;
  }

  if (data.target === 'warrior' && warrior) warrior.applyDamage(data.amount);
  else if (data.target === 'mage' && mage) mage.applyDamage(data.amount);
});

// FIN DE RONDA Y PARTIDA
socket.off('roundResult');
socket.on('roundResult', (data) => {
  if (data && data.roomCode && data.roomCode !== myRoomCode) return;

  scores = data.scores;
  roundActive = false;

  if (data.isGameOver) {
    bgMusic.pause();
    bgMusic.currentTime = 0;

    setTimeout(() => {
      alert(`¡Combate Terminado! Ganador: ${data.winnerRole.toUpperCase()}`);
      
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      
      gameStarted = false;
      currentMatchCode = null;

      // 1. Ocultar la pantalla de juego
      const gameScreen = document.getElementById('game-screen');
      if (gameScreen) {
        gameScreen.style.display = 'none';
        gameScreen.classList.remove('active');
      }

      // 2. Evaluar a dónde volver (¿Torneo o 1v1 Normal?)
      const isTournamentMatch = myRoomCode && myRoomCode.includes('_R'); // Las salas de torneo tienen sub-sala (ej: HA3WE_R1_M2)

      // 2. Evaluar a dónde volver
      if (isTournamentMode) {
        // Si era torneo, vuelve al cuadro
        const bracketScreen = document.getElementById('tournament-bracket-screen');
        if (bracketScreen) bracketScreen.style.display = 'flex';
      } else {
        // Si era 1v1 normal, vuelve al menú principal
        if (typeof returnToMenu === 'function') {
          returnToMenu();
        } else if (typeof enterMenu === 'function') {
          enterMenu();
        } else {
          const menuScreen = document.getElementById('menu-screen');
          if (menuScreen) menuScreen.style.display = 'flex';
        }
      }

      socket.emit('matchFinished', { winnerRole: data.winnerRole, roomCode: myRoomCode });
    }, 500);
  }
});



// Sincronización de la lista de jugadores esperándote en tiempo real
socket.off('updateSpecialEventLobby');
socket.on('updateSpecialEventLobby', (players) => {
  const countEl = document.getElementById('se-player-count');
  const listEl = document.getElementById('se-players-list');

  if (countEl) countEl.textContent = players.length;
  if (listEl) {
    listEl.innerHTML = '';
    players.forEach(p => {
      const li = document.createElement('li');
      li.textContent = p.name;
      listEl.appendChild(li);
    });
  }
});

// =============================================================
// LÓGICA DE EVENTO ESPECIAL (SALAS DE ESPERA Y CONTROL ADMIN)
// =============================================================

let isSpecialEventMode = false;

// Exponer la función globalmente para responder al onclick del HTML
window.joinSpecialEventLobby = function() {
  let username = '';
  const specInput = document.getElementById('special-event-username');
  const mainInput = document.getElementById('username');

  // Obtener el nombre del input del modal o del input principal
  if (specInput && specInput.value.trim() !== '') {
    username = specInput.value.trim();
  } else if (mainInput && mainInput.value.trim() !== '') {
    username = mainInput.value.trim();
  }

  // Validación de campos
  if (!username) {
    const seStatusMsg = document.getElementById('se-status-msg');
    if (seStatusMsg) seStatusMsg.textContent = 'Por favor, ingresá tu nombre.';
    return;
  }

  // Validación de Socket
  if (typeof socket === 'undefined' || !socket.connected) {
    console.error('[CLIENTE] ❌ Socket no disponible o desconectado.');
    const seStatusMsg = document.getElementById('se-status-msg');
    if (seStatusMsg) seStatusMsg.textContent = 'Error de conexión con el servidor.';
    return;
  }
  socket.on('pongTest', (respuesta) => {
  console.log('[CLIENTE] 🟢 El servidor respondió al test:', respuesta);
  });

  console.log('[CLIENTE] 📤 Enviando joinSpecialEventLobby para:', username);
  
  // Emisión limpia al servidor
  socket.emit('joinSpecialEventLobby', { username: username });
};



// Confirmación unificada al unirse a la sala de espera del Evento Especial
socket.off('specialEventLobbyJoined');
socket.on('specialEventLobbyJoined', (data) => {
  console.log('[CLIENTE] ¡Unido a la sala de espera del Evento Especial con éxito!');

  // 1. Ocultar panel de registro y mostrar pantalla de espera principal
  const joinPanel = document.getElementById('special-event-join-panel');
  const lobbyStatus = document.getElementById('special-event-lobby-status');
  if (joinPanel) joinPanel.style.display = 'none';
  if (lobbyStatus) lobbyStatus.style.display = 'block';

  // 2. Abrir modal de espera si existe
  const waitingRoomModal = document.getElementById('special-event-waiting-modal');
  if (waitingRoomModal) waitingRoomModal.style.display = 'flex';

  // 3. Actualizar mensajes de estado
  if (seStatusMsg) {
    seStatusMsg.textContent = 'Te uniste a la sala de espera. Esperando al Administrador...';
  }
  if (menuStatus) {
    const total = (data && data.totalPlayers) ? data.totalPlayers : 1;
    menuStatus.textContent = `En sala de espera para el Evento Especial. Jugadores conectados: ${total}`;
  }
});

// 3. El Admin da la orden de inicio y el servidor envía las llaves (Single Elimination)
socket.off('specialEventStarted');
socket.on('specialEventStarted', (data) => {
  isSpecialEventMode = true;
  isTournamentMode = true; // Activa la bandera para reutilizar la vista de torneo

  const waitingRoomModal = document.getElementById('special-event-waiting-modal');
  if (waitingRoomModal) waitingRoomModal.style.display = 'none';

  // Si existe un bracket screen en la UI, lo mostramos con las llaves recibidas
  const bracketScreen = document.getElementById('tournament-bracket-screen');
  if (bracketScreen) {
    bracketScreen.style.display = 'flex';
    if (typeof renderBracket === 'function') {
      renderBracket(data.bracketData);
    }
  }
});

// Nota: El evento 'launchMatch' existente en tu app.js se encargará automáticamente 
// de arrancar la pelea individual cuando al usuario le toque su turno en la ronda.



// -------------------------------------------------------------
// CONTROLES TÁCTILES
// -------------------------------------------------------------

function setupTouchButton(buttonId, keyCode) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  btn.addEventListener('touchstart', (e) => { e.preventDefault(); keys[keyCode] = true; });
  btn.addEventListener('touchend', (e) => { e.preventDefault(); keys[keyCode] = false; });
}

function setupTouchControls() {
  if (myRole === 'warrior') {
    setupTouchButton('btn-left', 'KeyA');
    setupTouchButton('btn-right', 'KeyD');
    setupTouchButton('btn-jump', 'KeyW');
    setupTouchButton('btn-attack', 'Space');
    setupTouchButton('btn-defend', 'KeyS');
    setupTouchButton('btn-special', 'KeyE');
  } else if (myRole === 'mage') {
    setupTouchButton('btn-left', 'ArrowLeft');
    setupTouchButton('btn-right', 'ArrowRight');
    setupTouchButton('btn-jump', 'ArrowUp');
    setupTouchButton('btn-attack', 'Enter');
    setupTouchButton('btn-defend', 'ArrowDown');
    setupTouchButton('btn-special', 'KeyM');
  }
}

// -------------------------------------------------------------
// ENTIDADES Y CLASES
// -------------------------------------------------------------

function checkRectCollision(r1, r2) {
  return r1.x < r2.x + r2.width && r1.x + r1.width > r2.x &&
         r1.y < r2.y + r2.height && r1.y + r1.height > r2.y;
}

function checkCircleRectCollision(c, r) {
  let cx = Math.max(r.x, Math.min(c.x, r.x + r.width));
  let cy = Math.max(r.y, Math.min(c.y, r.y + r.height));
  let dx = c.x - cx, dy = c.y - cy;
  return (dx * dx + dy * dy) < (c.radius * c.radius);
}

class Projectile {
  constructor(x, y, dir) {
    this.x = x; this.y = y; this.radius = 10;
    this.speed = 8 * dir; this.active = true; this.damage = 15;
  }
  update() {
    this.x += this.speed;
    if (this.x < 0 || this.x > canvas.width) this.active = false;
  }
  draw() {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#00e5ff';
    ctx.shadowBlur = 10; ctx.shadowColor = '#00e5ff';
    ctx.fill(); ctx.closePath(); ctx.shadowBlur = 0;
  }
}

class WarriorBeam {
  constructor(x, y, dir) {
    this.x = x; 
    this.y = y; 
    this.dir = dir;
    this.height = 60; // Altura fija máxima
    this.damage = 100; // Daño máximo directo
    this.active = true;
    this.hasDealtDamage = false;
    this.duration = 400; 
    this.spawnTime = Date.now();
  }

  update() {
    if (Date.now() - this.spawnTime > this.duration) {
      this.active = false;
    }
  }

  draw() {
    if (!this.active) return;
    ctx.fillStyle = '#ff9900';
    ctx.shadowBlur = 20; 
    ctx.shadowColor = '#ff3300';
    
    const drawX = this.dir === 1 ? this.x : 0;
    const drawWidth = this.dir === 1 ? (canvas.width - this.x) : this.x;
    
    ctx.fillRect(drawX, this.y - this.height / 2, drawWidth, this.height);
    ctx.shadowBlur = 0; 
  }
}

class ArrowProjectile {
  constructor(x, y, dir, damage = 35) {
    this.x = x;
    this.y = y;
    this.dir = dir;
    this.speed = 11 * dir; // Más rápido que el disparo normal del mago
    this.damage = damage;
    this.width = 24;
    this.height = 6;
    this.active = true;
  }

  update() {
    this.x += this.speed;
    if (this.x < -50 || this.x > canvas.width + 50) {
      this.active = false;
    }
  }

  draw() {
    if (!this.active) return;
    
    // Cuerpo de la flecha
    ctx.fillStyle = '#8d6e63';
    ctx.fillRect(this.x, this.y - this.height / 2, this.width, this.height);

    // Punta metálica
    ctx.fillStyle = '#cfd8dc';
    const tipX = this.dir === 1 ? this.x + this.width : this.x;
    ctx.beginPath();
    ctx.moveTo(tipX, this.y - this.height);
    ctx.lineTo(tipX + (10 * this.dir), this.y);
    ctx.lineTo(tipX, this.y + this.height);
    ctx.closePath();
    ctx.fill();
  }
}

class ArcherBigArrow {
  constructor(x, y, dir, damage) {
    this.x = x;
    this.y = y;
    this.dir = dir;
    this.speed = 18 * dir; // Desplazamiento horizontal muy rápido
    this.damage = damage;  // Se calcula como el 65% de la vida total del oponente
    this.width = 75;
    this.height = 20;
    this.active = true;
    this.hasDealtDamage = false;
  }

  update() {
    this.x += this.speed;
    if (this.x < -100 || this.x > canvas.width + 100) {
      this.active = false;
    }
  }

  draw() {
    if (!this.active) return;

    // Gran flecha con efecto de brillo/fuego elemental
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#ff9800';

    ctx.fillStyle = '#ff5722';
    ctx.fillRect(this.x, this.y - this.height / 2, this.width, this.height);

    // Punta gigantesca
    ctx.fillStyle = '#ffe082';
    const tipX = this.dir === 1 ? this.x + this.width : this.x;
    ctx.beginPath();
    ctx.moveTo(tipX, this.y - this.height * 1.5);
    ctx.lineTo(tipX + (22 * this.dir), this.y);
    ctx.lineTo(tipX, this.y + this.height * 1.5);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0; // Limpiar brillo para no ralentizar otros elementos
  }
}


class Character {
  constructor(x, y, color, hpId, manaId) {
    this.startX = x; this.startY = y;
    this.x = x; this.y = y;
    this.targetX = x; this.targetY = y;
    this.width = 40; this.height = 70;
    this.color = color; this.speed = 4;
    this.direction = 1; 
    this.maxHp = 100; this.hp = 100;
    this.maxMana = 100; this.mana = 100;
    this.hpElement = document.getElementById(hpId);
    this.manaElement = document.getElementById(manaId);
    this.isHit = false; this.isDefending = false;
    this.velocityY = 0; this.gravity = 0.6;
    this.jumpPower = -12; this.onGround = true;
  }

  reset() {
    this.x = this.startX; 
    this.y = this.startY;
    this.targetX = this.startX; 
    this.targetY = this.startY;
    this.hp = this.maxHp; 
    this.mana = this.maxMana;
    this.isHit = false; 
    this.isDefending = false;
    this.velocityY = 0; 
    this.onGround = true;
    this.updateHpBar();
    this.updateManaBar();
  }

  updateHpBar() {
    if (this.hpElement) {
      const percentage = Math.max(0, (this.hp / this.maxHp) * 100);
      this.hpElement.style.width = `${percentage}%`;
    }
  }

  updateManaBar() {
    if (this.manaElement) {
      const percentage = Math.max(0, (this.mana / this.maxMana) * 100);
      this.manaElement.style.width = `${percentage}%`;
    }
  }

  applyDamage(amount) {
    const finalDamage = this.isDefending ? amount * 0.2 : amount;
    this.hp = Math.max(0, this.hp - finalDamage);
    this.updateHpBar();

    this.isHit = true;
    setTimeout(() => this.isHit = false, 100);

    if (this.hp <= 0 && roundActive) {
      roundActive = false;
      const winner = (this instanceof Warrior) ? 'mage' : 'warrior';
      if (myRole === winner) {
        socket.emit('roundWon', { winnerRole: winner });
      }
    }
  }

  regenMana() {
    if (this.mana < this.maxMana) {
      this.mana = Math.min(this.maxMana, this.mana + 0.15);
      this.updateManaBar();
    }
  }

  interpolatePosition() {
    // Protección contra valores no numéricos enviados por red
    if (typeof this.targetX === 'number' && !isNaN(this.targetX)) {
      this.x += (this.targetX - this.x) * 0.3;
    }
    if (typeof this.targetY === 'number' && !isNaN(this.targetY)) {
      this.y += (this.targetY - this.y) * 0.3;
    }
  }

  draw() {
    // Si la posición terminó corrupta por algún paquete de red, la corregimos
    if (isNaN(this.x)) this.x = this.startX;
    if (isNaN(this.y)) this.y = this.startY;

    ctx.fillStyle = this.isHit ? '#ffffff' : this.color;
    ctx.fillRect(this.x, this.y, this.width, this.height);

    if (this.isDefending) {
      ctx.strokeStyle = '#ffd700'; 
      ctx.lineWidth = 4;
      ctx.strokeRect(this.x - 2, this.y - 2, this.width + 4, this.height + 4);
    }
  }
}

class Warrior extends Character {
  constructor(x, y) {
    super(x, y, '#ff4444', 'warrior-hp', 'warrior-mana');
    this.isAttacking = false; 
    this.attackDamage = 20; 
    this.hasDealtDamage = false;
    this.canAttack = true;
    this.attackCooldown = 500;
    this.chargeTime = 0;
    this.isCharging = false;
    this.activeBeam = null;
  }

  reset() {
    super.reset();
    this.chargeTime = 0;
    this.isCharging = false;
    this.activeBeam = null;
    this.isAttacking = false;
  }

  update(opponent) {
    this.regenMana();

    if (myRole === 'warrior') {
      if (roundActive) {
        const pressingDefense = keys['KeyS'] || false;
        if (pressingDefense && !this.isDefending) {
          defenseSFX.currentTime = 0;
          defenseSFX.play().catch(e => console.log(e));
          socket.emit('defenseSound', { roomCode: myRoomCode });
        }
        this.isDefending = pressingDefense;
        
        if (!this.isDefending) {
          if (keys['KeyA'] && this.x > 0) { this.x -= this.speed; this.direction = -1; }
          if (keys['KeyD'] && this.x + this.width < canvas.width) { this.x += this.speed; this.direction = 1; }
          if (keys['KeyW'] && this.onGround) { this.velocityY = this.jumpPower; this.onGround = false; }

          if (keys['KeyE'] && this.mana >= 100 && !this.isCharging) {
            this.isCharging = true;
            this.chargeTime = 0;
            this.mana = 0; 
            this.updateManaBar();
          }

          if (this.isCharging) {
            this.chargeTime += 0.016;

            if (this.chargeTime >= 2.0) {
              const spawnX = this.direction === 1 ? this.x + this.width : this.x;
              const spawnY = this.y + (this.height / 2);
              this.activeBeam = new WarriorBeam(spawnX, spawnY, this.direction);
            
              warriorBeamSFX.currentTime = 0;
              warriorBeamSFX.play().catch(e => console.log(e));
              socket.emit('warriorBeam', { x: spawnX, y: spawnY, dir: this.direction, roomCode: myRoomCode });

              this.isCharging = false;
              this.chargeTime = 0;
            }
          }

          if (keys['Space'] && !this.isAttacking && this.canAttack) {
            this.isAttacking = true;
            this.hasDealtDamage = false;
            this.canAttack = false;

            warriorBasicAttackSFX.currentTime = 0;
            warriorBasicAttackSFX.play().catch(e => console.log(e));
            socket.emit('basicAttackSound', { role: 'warrior', roomCode: myRoomCode });

            setTimeout(() => this.isAttacking = false, 200);
            setTimeout(() => this.canAttack = true, this.attackCooldown);
          }
        }

        this.velocityY += this.gravity;
        this.y += this.velocityY;
        if (this.y >= 300) { this.y = 300; this.velocityY = 0; this.onGround = true; }

        if (this.isAttacking && !this.hasDealtDamage) {
          const swordBox = {
            x: this.direction === 1 ? this.x + this.width : this.x - 45,
            y: this.y + 20, width: 45, height: 15
          };
          if (checkRectCollision(swordBox, opponent)) {
            opponent.applyDamage(this.attackDamage);
            socket.emit('sendDamage', { target: 'mage', amount: this.attackDamage, roomCode: myRoomCode });
            this.hasDealtDamage = true;
          }
        }
      }

      const now = Date.now();
      if (now - lastNetworkSend > 40) {
        socket.emit('playerAction', {
          x: this.x, y: this.y, direction: this.direction,
          isDefending: this.isDefending, isAttacking: this.isAttacking,
          isCharging: this.isCharging, mana: this.mana, roomCode: myRoomCode
        });
        lastNetworkSend = now;
      }
    } else {
      this.interpolatePosition();
    }

    if (this.activeBeam) {
      this.activeBeam.update();
      if (this.activeBeam.active && !this.activeBeam.hasDealtDamage && myRole === 'warrior' && roundActive) {
        const beamBox = {
          x: this.direction === 1 ? this.activeBeam.x : 0,
          y: this.activeBeam.y - this.activeBeam.height / 2,
          width: this.direction === 1 ? (canvas.width - this.activeBeam.x) : this.activeBeam.x,
          height: this.activeBeam.height
        };
        if (checkRectCollision(beamBox, opponent)) {
          opponent.applyDamage(this.activeBeam.damage);
          socket.emit('sendDamage', { target: 'mage', amount: this.activeBeam.damage, roomCode: myRoomCode });
          this.activeBeam.hasDealtDamage = true;
        }
      }
    }
  }

  draw() {
    super.draw();
    ctx.fillStyle = '#78909c';
    ctx.fillRect(this.x - 4, this.y - 24, this.width + 8, 28);
    ctx.fillStyle = '#1a237e';
    const visorX = this.direction === 1 ? this.x + 10 : this.x + 2;
    ctx.fillRect(visorX, this.y - 12, this.width - 12, 8);
    ctx.fillStyle = '#b71c1c';
    ctx.fillRect(this.x + (this.width / 2) - 6, this.y - 36, 12, 12);

    if (this.isAttacking) {
      ctx.fillStyle = '#ffeb3b';
      const swordX = this.direction === 1 ? this.x + this.width : this.x - 45;
      ctx.fillRect(swordX, this.y + 20, 45, 15);
    }
    if (this.isCharging) {
      // Pasa progresivamente de amarillo a rojo durante los 2 segundos (cerca de 2.0 pasa a rojo)
      ctx.fillStyle = this.chargeTime >= 1.5 ? '#ff1100' : '#ff9900';
      ctx.beginPath();
      ctx.arc(this.x + this.width / 2, this.y + this.height / 2, 18 + Math.random() * 6, 0, Math.PI * 2);
      ctx.fill();
    }
    if (this.activeBeam && this.activeBeam.active) {
      this.activeBeam.draw();
    }
  }
}

class Mage extends Character {
  constructor(x, y) {
    super(x, y, '#4488ff', 'mage-hp', 'mage-mana');
    this.direction = -1; 
    this.projectiles = []; 
    this.canAttack = true;
    this.attackCooldown = 600;
    this.isDashing = false;
    this.dashSpeed = 22;
    this.dashTargetX = 0;
    this.hoverOffset = 0;
  }

  shootProjectile() {
    const spawnX = this.direction === 1 ? this.x + this.width : this.x;
    socket.emit('mageShoot', { x: spawnX, y: this.y + 30, dir: this.direction });
  }

  triggerDash(dir) {
    this.isDashing = true;
    const dashDistance = (canvas.width / 2) * dir;
    this.dashTargetX = Math.max(0, Math.min(canvas.width - this.width, this.x + dashDistance));
  }

  update(opponent) {
    this.regenMana();
    this.hoverOffset = Math.sin(Date.now() / 200) * 4;

    if (myRole === 'mage') {
      if (roundActive) {
        const pressingDefense = keys['ArrowDown'] || false;
        if (pressingDefense && !this.isDefending) {
          defenseSFX.currentTime = 0;
          defenseSFX.play().catch(e => console.log(e));
          socket.emit('defenseSound', { roomCode: myRoomCode });
        }
        this.isDefending = pressingDefense;

        if (!this.isDefending && !this.isDashing) {
          if (keys['ArrowLeft'] && this.x > 0) { this.x -= this.speed; this.direction = -1; }
          if (keys['ArrowRight'] && this.x + this.width < canvas.width) { this.x += this.speed; this.direction = 1; }
          if (keys['ArrowUp'] && this.onGround) {
            this.velocityY = this.jumpPower; 
            this.onGround = false;
          }

          if (keys['Enter'] && this.canAttack) {
            this.shootProjectile();
            mageBasicAttackSFX.currentTime = 0;
            mageBasicAttackSFX.play().catch(e => console.log(e));
            socket.emit('basicAttackSound', { role: 'mage', roomCode: myRoomCode });
            this.canAttack = false;
            setTimeout(() => this.canAttack = true, this.attackCooldown);
          }

          if ((keys['ShiftRight'] || keys['KeyM']) && this.mana >= 100) {
            this.mana = 0;
            this.updateManaBar();
            this.triggerDash(this.direction);
            mageBeamSFX.currentTime = 0;
            mageBeamSFX.play().catch(e => console.log(e));
            socket.emit('mageDash', { dir: this.direction, roomCode: myRoomCode });
            socket.emit('mageSpecialSound', { roomCode: myRoomCode }); 
          }
        }

        this.velocityY += this.gravity;
        this.y += this.velocityY;
        const groundY = 288; 
        if (this.y >= groundY) { 
          this.y = groundY; 
          this.velocityY = 0; 
          this.onGround = true; 
        }

        if (this.isDashing) {
          this.x += this.dashSpeed * this.direction;
          if (checkRectCollision(this, opponent)) {
            const dashDamage = 120;
            opponent.applyDamage(dashDamage);
            socket.emit('sendDamage', { target: 'warrior', amount: dashDamage, roomCode: myRoomCode });
            this.isDashing = false;
          }

          if ((this.direction === 1 && this.x >= this.dashTargetX) || 
              (this.direction === -1 && this.x <= this.dashTargetX) ||
              this.x <= 0 || this.x + this.width >= canvas.width) {
            this.isDashing = false;
          }
        }
      }

      const now = Date.now();
      if (now - lastNetworkSend > 40) {
        socket.emit('playerAction', {
          x: this.x, y: this.y, direction: this.direction,
          isDefending: this.isDefending, isDashing: this.isDashing,
          mana: this.mana, roomCode: myRoomCode
        });
        lastNetworkSend = now;
      }
    } else {
      this.interpolatePosition();
    }

    this.projectiles.forEach(p => {
      p.update();
      if (p.active && checkCircleRectCollision(p, opponent)) {
        if (myRole === 'mage' && roundActive) {
          opponent.applyDamage(p.damage);
          socket.emit('sendDamage', { target: 'warrior', amount: p.damage, roomCode: myRoomCode });
        }
        p.active = false;
      }
    });
    this.projectiles = this.projectiles.filter(p => p.active);
  }

  draw() {
    const drawY = this.onGround ? this.y + this.hoverOffset : this.y;
    const savedY = this.y;
    if (this.onGround) this.y += this.hoverOffset;

    super.draw();
    this.y = savedY;

    ctx.fillStyle = '#0d47a1';
    ctx.fillRect(this.x - 8, drawY - 4, this.width + 16, 6);
    ctx.fillStyle = '#ffd54f';
    ctx.fillRect(this.x + 2, drawY - 10, this.width - 4, 6);
    ctx.fillStyle = '#1565c0';
    ctx.beginPath();
    ctx.moveTo(this.x, drawY - 10);
    ctx.lineTo(this.x + this.width, drawY - 10);
    ctx.lineTo(this.x + (this.width / 2), drawY - 32);
    ctx.closePath();
    ctx.fill();

    if (this.isDashing) {
      ctx.fillStyle = '#00e5ff';
      const trailY = this.onGround ? this.y + this.hoverOffset : this.y;
      ctx.fillRect(this.x - (15 * this.direction), trailY, this.width + 15, this.height);
    }
    this.projectiles.forEach(p => p.draw());
  }
}

class Archer extends Character {
  constructor(x, y) {
    // Registramos la clase vinculada a barras de UI propias 'archer-hp' y 'archer-mana'
    super(x, y, '#2e7d32', 'archer-hp', 'archer-mana');
    this.projectiles = []; 
    this.specialArrow = null;
    this.canAttack = true;
    this.attackCooldown = 750; // Ataque más lento que el del Mago (600ms)
    this.basicDamage = 35;      // Más daño que el ataque del Guerrero (20) y Mago (15)
  }

  reset() {
    super.reset();
    this.projectiles = [];
    this.specialArrow = null;
    this.canAttack = true;
  }

  shootBasicProjectile() {
    const spawnX = this.direction === 1 ? this.x + this.width : this.x;
    const spawnY = this.y + 25;
    socket.emit('archerShoot', { x: spawnX, y: spawnY, dir: this.direction, roomCode: myRoomCode });
  }

  shootSpecialArrow(opponent) {
    const spawnX = this.direction === 1 ? this.x + this.width : this.x;
    const spawnY = this.y + (this.height / 2);
    // Inflinge un 65% del daño respecto a la vida total
    const specialDamage = opponent ? opponent.maxHealth * 0.65 : 65; 

    this.specialArrow = new ArcherBigArrow(spawnX, spawnY, this.direction, specialDamage);

    socket.emit('archerSpecial', { 
      x: spawnX, 
      y: spawnY, 
      dir: this.direction, 
      damage: specialDamage, 
      roomCode: myRoomCode 
    });
  }

  update(opponent) {
    this.regenMana();

    if (myRole === 'archer') {
      if (roundActive) {
        // Defensa/Bloqueo (Tecla S o Flecha Abajo)
        const pressingDefense = keys['KeyS'] || keys['ArrowDown'] || false;
        if (pressingDefense && !this.isDefending) {
          defenseSFX.currentTime = 0;
          defenseSFX.play().catch(e => console.log(e));
          socket.emit('defenseSound', { roomCode: myRoomCode });
        }
        this.isDefending = pressingDefense;

        if (!this.isDefending) {
          // Movimiento horizontal y salto
          if ((keys['KeyA'] || keys['ArrowLeft']) && this.x > 0) { 
            this.x -= this.speed; 
            this.direction = -1; 
          }
          if ((keys['KeyD'] || keys['ArrowRight']) && this.x + this.width < canvas.width) { 
            this.x += this.speed; 
            this.direction = 1; 
          }
          if ((keys['KeyW'] || keys['ArrowUp']) && this.onGround) { 
            this.velocityY = this.jumpPower; 
            this.onGround = false; 
          }

          // Ataque básico (Espacio o Enter)
          if ((keys['Space'] || keys['Enter']) && this.canAttack) {
            this.shootBasicProjectile();

            if (typeof archerBasicAttackSFX !== 'undefined') {
              archerBasicAttackSFX.currentTime = 0;
              archerBasicAttackSFX.play().catch(e => console.log(e));
            }
            socket.emit('basicAttackSound', { role: 'archer', roomCode: myRoomCode });

            this.canAttack = false;
            setTimeout(() => this.canAttack = true, this.attackCooldown);
          }

          // Ataque Especial (Tecla E o ShiftRight/M) -> Requiere 100 Mana
          if ((keys['KeyE'] || keys['ShiftRight'] || keys['KeyM']) && this.mana >= 100) {
            this.mana = 0;
            this.updateManaBar();

            this.shootSpecialArrow(opponent);

            if (typeof archerSpecialSFX !== 'undefined') {
              archerSpecialSFX.currentTime = 0;
              archerSpecialSFX.play().catch(e => console.log(e));
            }
            socket.emit('specialAttackSound', { role: 'archer', roomCode: myRoomCode });
          }
        }

        // Gravedad y plataforma
        this.velocityY += this.gravity;
        this.y += this.velocityY;
        if (this.y >= 300) { 
          this.y = 300; 
          this.velocityY = 0; 
          this.onGround = true; 
        }
      }

      // Sincronización Socket de red
      const now = Date.now();
      if (now - lastNetworkSend > 40) {
        socket.emit('playerAction', {
          x: this.x, y: this.y, direction: this.direction,
          isDefending: this.isDefending, mana: this.mana, roomCode: myRoomCode
        });
        lastNetworkSend = now;
      }
    } else {
      this.interpolatePosition();
    }

    // 1. Colisiones de Proyectiles Básico (Flechas)
    this.projectiles.forEach(p => {
      p.update();
      const pBox = { x: p.x, y: p.y - p.height / 2, width: p.width, height: p.height };

      if (p.active && checkRectCollision(pBox, opponent)) {
        if (myRole === 'archer' && roundActive) {
          opponent.applyDamage(p.damage);
          socket.emit('sendDamage', { target: opponent.role || 'opponent', amount: p.damage, roomCode: myRoomCode });
        }
        p.active = false;
      }
    });
    this.projectiles = this.projectiles.filter(p => p.active);

    // 2. Colisión del Ataque Especial (Flecha Grande)
    if (this.specialArrow) {
      this.specialArrow.update();
      const specialBox = { 
        x: this.specialArrow.x, 
        y: this.specialArrow.y - this.specialArrow.height / 2, 
        width: this.specialArrow.width, 
        height: this.specialArrow.height 
      };

      if (this.specialArrow.active && !this.specialArrow.hasDealtDamage) {
        if (checkRectCollision(specialBox, opponent)) {
          if (myRole === 'archer' && roundActive) {
            opponent.applyDamage(this.specialArrow.damage);
            socket.emit('sendDamage', { target: opponent.role || 'opponent', amount: this.specialArrow.damage, roomCode: myRoomCode });
            this.specialArrow.hasDealtDamage = true;
          }
        }
      }

      if (!this.specialArrow.active) {
        this.specialArrow = null;
      }
    }
  }

  draw() {
    super.draw();

    // Visual del personaje (Sombrero de arquero)
    ctx.fillStyle = '#1b5e20';
    ctx.fillRect(this.x - 2, this.y - 12, this.width + 4, 10);
    ctx.fillStyle = '#b71c1c'; // Pluma roja
    const featherX = this.direction === 1 ? this.x + 4 : this.x + this.width - 8;
    ctx.fillRect(featherX, this.y - 22, 4, 10);

    // Renderizar flechas activas y especial
    this.projectiles.forEach(p => p.draw());
    if (this.specialArrow) {
      this.specialArrow.draw();
    }
  }
}

// -------------------------------------------------------------
// BUCLE DE JUEGO E INICIALIZACIÓN
// -------------------------------------------------------------
const warrior = new Warrior(100, 300);
const mage = new Mage(660, 300);
let bgImage = new Image();
let bgLoaded = false;


// Acá mejoré la función para reiniciar las entidades así si es que se sale de la pantalla o termina la partida se borran los proyectiles que se hayan lanzado en el momento
function resetEntities() {
  if (typeof warrior !== 'undefined') warrior.reset();
  if (typeof mage !== 'undefined') {
    mage.reset();
    mage.projectiles = [];
  }
  if (typeof archer !== 'undefined') {
    archer.reset();
    archer.projectiles = [];
    archer.specialArrow = null;
  }
}

// Carga del fondo asegurando el redraw
function loadBackground(bgMap) {
  if (bgMap) {
    bgImage.src = `img/backgrounds/${bgMap}`;
    bgImage.onload = () => { 
      bgLoaded = true; 
    };
    bgImage.onerror = () => {
      console.warn("No se pudo cargar la imagen:", bgMap);
      bgLoaded = false;
    };
  }
}

function drawUI() {
  ctx.fillStyle = '#ffeb3b';
  ctx.font = 'bold 22px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`Guerrero: ${scores.warrior}  VS  Mago: ${scores.mage}`, canvas.width / 2, 35);

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

  // 0. Forzar dimensiones de dibujo para evitar que colapse
  if (canvas.width !== 800) canvas.width = 800;
  if (canvas.height !== 400) canvas.height = 400;

  // 1. Limpiar pantalla
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 2. Dibujar fondo o color base
  if (bgLoaded && bgImage.complete && bgImage.naturalWidth !== 0) {
    ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
  } else {
    // Fondo de contingencia (Oscuro)
    ctx.fillStyle = '#1a1d24';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // 3. Dibujar Suelo / Plataforma
  ctx.fillStyle = '#3a3f4d'; 
  ctx.fillRect(0, 370, canvas.width, 30);

  // 4. Actualizar física y estados (con chequeo cruzado)
  if (warrior && mage) {
    warrior.update(mage);
    mage.update(warrior);
  }

  // 5. Renderizar personajes
  if (warrior) warrior.draw();
  if (mage) mage.draw();

  // 6. Renderizar UI de texto y contadores sobre el canvas
  drawUI();

  // 💡 CAMBIO AQUÍ: En lugar de llamar requestAnimationFrame suelto, guardamos el ID en la variable
  animationFrameId = requestAnimationFrame(gameLoop);
}

// Mensaje por consola para confirmar la carga limpia del script piloto
// console.log("🔥 [PILOTO] app.js cargado correctamente sin errores de ReferenceError.");