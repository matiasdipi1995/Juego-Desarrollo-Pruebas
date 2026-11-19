// public/js/local-game.js
// ==========================================
// MODO DE JUEGO 1 VS 1 (LOCAL / MISMA PC)
// ==========================================

const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
if (isMobile) {
  alert('El modo 1 vs 1 en la misma pantalla solo está disponible para computadoras con teclado.');
  window.location.href = 'index.html';
}

// --- SISTEMA DE AUDIO ---
const SFX = {
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
SFX.mageSpecial.volume = 0.6;

const bgMusic = new Audio('sonido/sonidoJugando.flac');
bgMusic.loop = true;
bgMusic.volume = 0.3;

function playSound(name) {
  const audio = SFX[name];
  if (!audio) return;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

function tryPlayAudio() {
  if (bgMusic.paused) {
    bgMusic.play().then(() => {
      window.removeEventListener('keydown', tryPlayAudio);
      window.removeEventListener('mousedown', tryPlayAudio);
    }).catch(() => {});
  }
}
window.addEventListener('keydown', tryPlayAudio);
window.addEventListener('mousedown', tryPlayAudio);

// --- CANVAS Y CONTROLES ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const keys = {};

window.addEventListener('keydown', e => { keys[e.code] = true; });
window.addEventListener('keyup', e => { keys[e.code] = false; });

const P1_CONTROLS = {
  left: 'KeyA', right: 'KeyD', jump: 'KeyW', defend: 'KeyS',
  attack: 'Space', special: 'KeyE', invisible: 'KeyQ'
};

const P2_CONTROLS = {
  left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', defend: 'ArrowDown',
  attack: 'Enter', special: ['ShiftRight', 'KeyM'], invisible: 'KeyN'
};

// --- FONDOS ALEATORIOS ---
const backgrounds = [
  'img/backgrounds/buenosaires.jpg',
  'img/backgrounds/newyork.jpg',
  'img/backgrounds/tokyo.jpg'
];
const bgImage = new Image();

function changeRandomBackground() {
  bgImage.src = backgrounds[Math.floor(Math.random() * backgrounds.length)];
}

// --- ESTADO DE PARTIDA ---
let player1 = null;
let player2 = null;
let roundActive = false;
let countdownValue = null;
const scores = { p1: 0, p2: 0 };

function getQueryParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    p1: params.get('p1') || 'warrior',
    p2: params.get('p2') || 'mage'
  };
}

function checkVictoryCondition() {
  if (!roundActive || !player1 || !player2) return;

  if (player1.hp <= 0) {
    roundActive = false;
    scores.p2++;
    handleRoundEnd('Jugador 2');
  } else if (player2.hp <= 0) {
    roundActive = false;
    scores.p1++;
    handleRoundEnd('Jugador 1');
  }
}

function handleRoundEnd(winnerName) {
  setTimeout(async () => {
    if (scores.p1 >= 3 || scores.p2 >= 3) {
      const reward = await claimMatchReward('local', 'win');
      const coinMsg = reward && typeof reward.monedas === 'number'
        ? `\n🪙 Ganaste +${reward.earned} monedas (Total: ${reward.monedas})`
        : '';
      alert(`¡Juego Terminado! Ganador final: ${winnerName}${coinMsg}`);
      window.location.href = 'select_character.html?mode=local';
    } else {
      startNewRound();
    }
  }, 500);
}

function startNewRound() {
  let count = 3;
  roundActive = false;
  countdownValue = count;

  changeRandomBackground();
  player1.reset();
  player2.reset();

  const timer = setInterval(() => {
    count--;
    if (count > 0) {
      countdownValue = count;
    } else {
      countdownValue = null;
      roundActive = true;
      clearInterval(timer);
    }
  }, 1000);
}

function drawUI() {
  ctx.fillStyle = '#ffeb3b';
  ctx.font = 'bold 22px Arial';
  ctx.textAlign = 'center';
  const p1Name = CHARACTER_LABELS[player1.className] || 'P1';
  const p2Name = CHARACTER_LABELS[player2.className] || 'P2';
  ctx.fillText(`${p1Name} (P1): ${scores.p1}  VS  ${p2Name} (P2): ${scores.p2}`, canvas.width / 2, 35);

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
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (bgImage.complete && bgImage.naturalWidth !== 0) {
    ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = '#1a1d24';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Piso (siempre 30px de alto en la base del canvas)
  ctx.fillStyle = '#3a3f4d';
  ctx.fillRect(0, canvas.height - 30, canvas.width, 30);

  const env = {
    keys,
    canvas,
    roundActive,
    isLocal: true,
    callbacks: { onSound: playSound }
  };

  player1.update(player2, env);
  player2.update(player1, env);

  player1.draw(ctx, canvas.width, false);
  player2.draw(ctx, canvas.width, false);

  drawUI();
  checkVictoryCondition();

  requestAnimationFrame(gameLoop);
}

// --- ARRANQUE ASÍNCRONO (CARGA STATS DESDE POSTGRESQL) ---
async function initLocalGame() {
  await loadCharacterStats();
  const chosen = getQueryParams();

  const charHeight = 75;
  const startY = canvas.height - 30 - charHeight;

  const p1Loadout = await loadMyLoadout(chosen.p1);
player1 = createCharacterInstance(chosen.p1, {
  x: 100, y: startY, width: 45, height: charHeight,
  jumpPower: -12.5, direction: 1,
  hpId: 'p1-hp', manaId: 'p1-mana',
  stats: p1Loadout.stats,
  equipment: p1Loadout.equipment,
  controls: P1_CONTROLS
});

  player2 = createCharacterInstance(chosen.p2, {
    x: canvas.width - 145, y: startY, width: 45, height: charHeight,
    jumpPower: -12.5, direction: -1,
    hpId: 'p2-hp', manaId: 'p2-mana',
    controls: P2_CONTROLS
  });

  const p1Label = document.getElementById('p1-name');
  const p2Label = document.getElementById('p2-name');
  if (p1Label) p1Label.textContent = `${CHARACTER_LABELS[chosen.p1] || 'Guerrero'} (P1)`;
  if (p2Label) p2Label.textContent = `${CHARACTER_LABELS[chosen.p2] || 'Mago'} (P2)`;

  startNewRound();
  requestAnimationFrame(gameLoop);
}

window.returnToModeSelection = function() {
  if (confirm('¿Deseas salir de la partida y volver al menú principal?')) {
    window.location.href = 'index.html';
  }
};



initLocalGame();