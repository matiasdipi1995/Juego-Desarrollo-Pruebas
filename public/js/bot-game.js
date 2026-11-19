// public/js/bot-game.js
// ==========================================
// MODO DE JUEGO 1 VS MÁQUINA (MODULAR)
// ==========================================

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

// --- CONFIGURACIÓN DE SESIÓN ---
const difficulty = sessionStorage.getItem('botDifficulty') || 'medium';
const playerCharType = sessionStorage.getItem('playerChar') || 'warrior';
const botCharType = sessionStorage.getItem('botChar') || 'mage';

const diffTag = document.getElementById('diff-tag');
if (diffTag) diffTag.innerText = difficulty.toUpperCase();

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

const BOT_CONTROLS = {
  left: 'botLeft', right: 'botRight', jump: 'botJump', defend: 'botDefend',
  attack: 'botAttack', special: 'botSpecial', invisible: 'botInvisible'
};

// --- CONTROLADOR DE IA UNIFICADO PARA LAS 4 CLASES ---
class BotController {
  constructor(diff) {
    this.diff = diff;
    this.moveTimer = 0;
    this.randomMoveDir = 0;
    this.retreating = false;
    this.defendHoldUntil = 0;
  }

  reset() {
    this.moveTimer = 0;
    this.randomMoveDir = 0;
    this.retreating = false;
    this.defendHoldUntil = 0;
  }

  computeKeys(bot, player, active) {
    const botKeys = {};
    if (!active || !bot || !player) return botKeys;

    const now = Date.now();

    // Si el jugador está invisible, el bot se desorienta y camina al azar
    if (player.isInvisible) {
      if (this.moveTimer <= 0) {
        this.randomMoveDir = Math.random() < 0.5 ? -1 : 1;
        this.moveTimer = 30;
      } else {
        this.moveTimer--;
      }
      if (this.randomMoveDir === -1) botKeys.botLeft = true;
      else botKeys.botRight = true;
      return botKeys;
    }

    const dist = player.x - bot.x;
    const absDist = Math.abs(dist);
    const dirToPlayer = dist >= 0 ? 1 : -1;

    // 1. DEFENSA REACTIVA (en dificultad media y difícil)
    if (this.diff !== 'easy') {
      const playerAttackingClose = player.isAttacking && absDist < 95;
      const incomingBeam = player.activeBeam && player.activeBeam.active;
      const incomingProj = player.projectiles && player.projectiles.some(p => Math.abs(p.x - bot.x) < 120);
      const incomingBigArrow = player.specialArrow && Math.abs(player.specialArrow.x - bot.x) < 160;
      const incomingDash = player.isDashing || (player.dashPhase > 0);

      if (playerAttackingClose || incomingBeam || incomingProj || incomingBigArrow || incomingDash) {
        const blockChance = this.diff === 'hard' ? 0.85 : 0.45;
        if (now > this.defendHoldUntil && Math.random() < blockChance) {
          this.defendHoldUntil = now + (this.diff === 'hard' ? 350 : 250);
        }
      }
    }

    if (now < this.defendHoldUntil) {
      botKeys.botDefend = true;
      return botKeys;
    }

    // 2. POSICIONAMIENTO SEGÚN CLASE
    let idealMin = 180;
    let idealMax = 320;

    if (bot.className === 'warrior') {
      idealMin = 40;
      idealMax = 65;
    } else if (bot.className === 'archer') {
      idealMin = 240;
      idealMax = 400;
    } else if (bot.className === 'ninja') {
      idealMin = 130;
      idealMax = 260;
    }

    if (this.retreating) {
      if (dirToPlayer === 1) botKeys.botLeft = true;
      else botKeys.botRight = true;
      if (absDist > idealMax + 80 || bot.x <= 10 || bot.x + bot.width >= canvas.width - 10) {
        this.retreating = false;
      }
    } else if (this.diff === 'easy') {
      if (absDist > idealMax + 40) {
        if (dirToPlayer === 1) botKeys.botRight = true;
        else botKeys.botLeft = true;
      } else if (Math.random() < 0.03) {
        if (Math.random() < 0.5) botKeys.botLeft = true;
        else botKeys.botRight = true;
      }
    } else {
      if (absDist < idealMin) {
        if (dirToPlayer === 1) botKeys.botLeft = true;
        else botKeys.botRight = true;
      } else if (absDist > idealMax) {
        if (dirToPlayer === 1) botKeys.botRight = true;
        else botKeys.botLeft = true;
      } else {
        // Amagues en zona ideal
        if (this.moveTimer <= 0) {
          if (Math.random() < 0.25) {
            this.randomMoveDir = Math.random() < 0.5 ? 1 : -1;
            this.moveTimer = 15 + Math.floor(Math.random() * 20);
          }
        } else {
          if (this.randomMoveDir === 1) botKeys.botRight = true;
          else botKeys.botLeft = true;
          this.moveTimer--;
        }
      }

      // Saltos ocasionales (más frecuentes en Ninja)
      const jumpChance = bot.className === 'ninja' ? 0.025 : 0.008;
      if (bot.onGround && Math.random() < jumpChance) {
        botKeys.botJump = true;
      }
    }

    // Asegurar que el bot mire hacia el jugador antes de atacar (si no está en medio de un dash)
    if (!bot.isDashing && !bot.dashPhase) {
      bot.direction = dirToPlayer;
    }

    // 3. ATAQUE ESPECIAL (con 100% maná)
    if (bot.mana >= bot.maxMana) {
      const specialChance = this.diff === 'hard' ? 0.06 : (this.diff === 'medium' ? 0.025 : 0.008);
      const inSpecialRange = (bot.className === 'mage' || bot.className === 'ninja') ? absDist < 380 : true;
      if (inSpecialRange && Math.random() < specialChance) {
        botKeys.botSpecial = true;
        return botKeys;
      }
    }

    // 4. ATAQUE BÁSICO
    const canHitNow = bot.className === 'warrior' ? absDist <= 75 : true;
    if (canHitNow && bot.canAttack) {
      const attackChance = this.diff === 'hard' ? 0.1 : (this.diff === 'medium' ? 0.045 : 0.018);
      if (Math.random() < attackChance) {
        botKeys.botAttack = true;
        if (bot.className === 'warrior') this.retreating = true;
      }
    }

    return botKeys;
  }
}

// --- ESTADO DE PARTIDA ---
const botAI = new BotController(difficulty);
let player1 = null;
let botPlayer = null;
let roundActive = false;
let countdownValue = null;
const scores = { player1: 0, bot: 0 };

const backgrounds = [
  'img/backgrounds/tokyo.jpg',
  'img/backgrounds/buenosaires.jpg',
  'img/backgrounds/newyork.jpg'
];
const bgImage = new Image();

function changeRandomBackground() {
  bgImage.src = backgrounds[Math.floor(Math.random() * backgrounds.length)];
}

function checkVictoryCondition() {
  if (!roundActive || !player1 || !botPlayer) return;

  if (player1.hp <= 0) {
    roundActive = false;
    scores.bot++;
    handleRoundEnd('IA');
  } else if (botPlayer.hp <= 0) {
    roundActive = false;
    scores.player1++;
    handleRoundEnd('Jugador 1');
  }
}

function handleRoundEnd(winnerName) {
  setTimeout(async () => {
    if (scores.player1 >= 3 || scores.bot >= 3) {
      const won = scores.player1 >= 3;
      const reward = await claimMatchReward('bot', won ? 'win' : 'lose');
      const coinMsg = reward && typeof reward.monedas === 'number'
        ? `\n🪙 Ganaste +${reward.earned} monedas (Total: ${reward.monedas})`
        : '';
      alert(`¡Juego Terminado! Ganador final: ${winnerName.toUpperCase()}${coinMsg}`);
      location.href = 'select_difficulty.html';
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
  botPlayer.reset();
  botAI.reset();

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

  const p1Name = CHARACTER_LABELS[player1.className] || 'Jugador 1';
  const botName = `${CHARACTER_LABELS[botPlayer.className] || 'IA'} (IA)`;
  ctx.fillText(`${p1Name}: ${scores.player1}  VS  ${botName}: ${scores.bot}`, canvas.width / 2, 35);

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

  // Piso
  ctx.fillStyle = '#3a3f4d';
  ctx.fillRect(0, canvas.height - 30, canvas.width, 30);

  const playerEnv = {
    keys,
    canvas,
    roundActive,
    isLocal: true,
    callbacks: { onSound: playSound }
  };

  const botKeys = botAI.computeKeys(botPlayer, player1, roundActive);
  const botEnv = {
    keys: botKeys,
    canvas,
    roundActive,
    isLocal: true,
    callbacks: { onSound: playSound }
  };

  player1.update(botPlayer, playerEnv);
  botPlayer.update(player1, botEnv);

  player1.draw(ctx, canvas.width, false);
  botPlayer.draw(ctx, canvas.width, true); // Si el Bot fuera invisible, el jugador no lo vería

  drawUI();
  checkVictoryCondition();

  requestAnimationFrame(gameLoop);
}

// --- SOPORTE TÁCTIL MÓVILES ---
function setupTouchEvents() {
  const bindTouch = (elementId, code) => {
    const btn = document.getElementById(elementId);
    if (!btn) return;

    btn.addEventListener('touchstart', (e) => { e.preventDefault(); keys[code] = true; tryPlayAudio(); });
    btn.addEventListener('touchend', (e) => { e.preventDefault(); keys[code] = false; });
    btn.addEventListener('mousedown', () => { keys[code] = true; tryPlayAudio(); });
    btn.addEventListener('mouseup', () => { keys[code] = false; });
  };

  bindTouch('btn-left', 'KeyA');
  bindTouch('btn-right', 'KeyD');
  bindTouch('btn-jump', 'KeyW');
  bindTouch('btn-defend', 'KeyS');
  bindTouch('btn-attack', 'Space');
  bindTouch('btn-special', 'KeyE');
}

// --- INICIALIZACIÓN ASÍNCRONA ---
async function initBotGame() {
  await loadCharacterStats();

  const charHeight = 75;
  const startY = canvas.height - 30 - charHeight;

  const myLoadout = await loadMyLoadout(playerCharType);
player1 = createCharacterInstance(playerCharType, {
  x: 100, y: startY, width: 45, height: charHeight,
  jumpPower: -12.5, direction: 1,
  hpId: 'p1-hp', manaId: 'p1-mana',
  stats: myLoadout.stats,
  equipment: myLoadout.equipment,
  controls: P1_CONTROLS
});

  botPlayer = createCharacterInstance(botCharType, {
    x: canvas.width - 145, y: startY, width: 45, height: charHeight,
    jumpPower: -12.5, direction: -1,
    hpId: 'p2-hp', manaId: 'p2-mana',
    controls: BOT_CONTROLS
  });

  // Ajustar cooldown de ataque del Bot según dificultad
  if (difficulty === 'easy') botPlayer.attackCooldown = Math.round(botPlayer.attackCooldown * 1.6);
  else if (difficulty === 'hard') botPlayer.attackCooldown = Math.round(botPlayer.attackCooldown * 0.75);

  const p1Label = document.getElementById('p1-name');
  const p2Label = document.getElementById('p2-name');
  if (p1Label) p1Label.textContent = `${CHARACTER_LABELS[playerCharType] || 'Jugador'} (P1)`;
  if (p2Label) p2Label.textContent = `${CHARACTER_LABELS[botCharType] || 'Bot'} (IA)`;

  setupTouchEvents();
  startNewRound();
  requestAnimationFrame(gameLoop);
}


window.returnToModeSelection = function() {
  if (confirm('¿Deseas salir de la partida y volver al menú principal?')) {
    window.location.href = 'index.html';
  }
};



initBotGame();