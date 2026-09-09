// --- AUDIO SYSTEM ---
const warriorChargeSFX = new Audio('sonido/cargaPoderGuerrero-cortado.flac');
warriorChargeSFX.loop = true;
const warriorBeamSFX = new Audio('sonido/soltarCargaGuerrero-cortado.wav');
const mageBeamSFX = new Audio('sonido/SoltarCargaMago.wav');
mageBeamSFX.volume = 0.6;
const warriorBasicAttackSFX = new Audio('sonido/espadaso del guerrero.wav');
const mageBasicAttackSFX = new Audio('sonido/AtaquedelMago.wav');
const defenseSFX = new Audio('sonido/ActivaDefensa4-Cortado.wav');
const bgMusic = new Audio('sonido/sonidoJugando.flac');
bgMusic.loop = true;
bgMusic.volume = 0.3;

// --- LEER CONFIGURACIÓN GUARDADA ---
const difficulty = sessionStorage.getItem('botDifficulty') || 'medium';
const playerCharType = sessionStorage.getItem('playerChar') || 'warrior';
const botCharType = sessionStorage.getItem('botChar') || 'mage';

const diffTag = document.getElementById('diff-tag');
if (diffTag) diffTag.innerText = difficulty.toUpperCase();

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const keys = {};

let roundActive = false;
let scores = { player1: 0, bot: 0 };
let countdownValue = null;

window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);

function tryPlayAudio() {
  if (bgMusic.paused) {
    bgMusic.play().catch(e => console.log('Audio esperando interacción', e));
  }
}
window.addEventListener('keydown', tryPlayAudio);
window.addEventListener('mousedown', tryPlayAudio);

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

// --- PROYECTILES Y ATAQUES ESPECIALES ---
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
    ctx.fill(); ctx.closePath();
  }
}

class WarriorBeam {
  constructor(x, y, dir, chargeRatio) {
    this.x = x; this.y = y; this.dir = dir;
    this.chargeRatio = Math.max(0.2, chargeRatio); 
    this.height = 20 + (40 * this.chargeRatio);
    this.damage = Math.round(20 + (80 * this.chargeRatio));
    this.active = true;
    this.hasDealtDamage = false;
    this.duration = 400; 
    this.spawnTime = Date.now();
  }
  update() {
    if (Date.now() - this.spawnTime > this.duration) this.active = false;
  }
  draw() {
    if (!this.active) return;
    ctx.fillStyle = '#ff9900';
    const drawX = this.dir === 1 ? this.x : 0;
    const drawWidth = this.dir === 1 ? (canvas.width - this.x) : this.x;
    ctx.fillRect(drawX, this.y - this.height / 2, drawWidth, this.height);
  }
}

// --- CLASE BASE DE PERSONAJE ---
class Character {
  constructor(x, y, color, hpId, manaId) {
    this.startX = x; this.startY = y;
    this.x = x; this.y = y;
    this.width = 40; this.height = 70;
    this.color = color; this.speed = 4;
    this.direction = 1; 
    this.maxHp = 500; this.hp = 500;
    this.maxMana = 100; this.mana = 100;
    this.hpElement = document.getElementById(hpId);
    this.manaElement = document.getElementById(manaId);
    this.isHit = false; this.isDefending = false;
    this.velocityY = 0; this.gravity = 0.6;
    this.jumpPower = -12; this.onGround = true;
  }

  reset() {
    this.x = this.startX; this.y = this.startY;
    this.hp = this.maxHp; this.mana = this.maxMana;
    this.isHit = false; this.isDefending = false;
    this.velocityY = 0; this.onGround = true;
    this.updateHpBar(); this.updateManaBar();
  }

  updateHpBar() {
    if (this.hpElement) this.hpElement.style.width = `${Math.max(0, (this.hp / this.maxHp) * 100)}%`;
  }

  updateManaBar() {
    if (this.manaElement) this.manaElement.style.width = `${Math.max(0, (this.mana / this.maxMana) * 100)}%`;
  }

  applyDamage(amount) {
    const finalDamage = this.isDefending ? amount * 0.2 : amount;
    this.hp = Math.max(0, this.hp - finalDamage);
    this.updateHpBar();
    this.isHit = true;
    setTimeout(() => this.isHit = false, 100);

    if (this.hp <= 0 && roundActive) {
      roundActive = false;
      const isPlayer1Dead = (this === player1);
      if (isPlayer1Dead) scores.bot++;
      else scores.player1++;

      const winnerName = isPlayer1Dead ? "IA" : "Jugador 1";

      setTimeout(() => {
        if (scores.player1 >= 3 || scores.bot >= 3) {
          alert(`¡Juego Terminado! Ganador final: ${winnerName.toUpperCase()}`);
          location.href = 'select_difficulty.html';
        } else {
          startNewRound();
        }
      }, 500);
    }
  }

  regenMana() {
    if (this.mana < this.maxMana) {
      this.mana = Math.min(this.maxMana, this.mana + 0.15);
      this.updateManaBar();
    }
  }

  draw() {
    ctx.fillStyle = this.isHit ? '#ffffff' : this.color;
    ctx.fillRect(this.x, this.y, this.width, this.height);
    if (this.isDefending) {
      ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 4;
      ctx.strokeRect(this.x - 2, this.y - 2, this.width + 4, this.height + 4);
    }
  }
}

// --- CLASES JUGADOR 1 ---
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
    if (roundActive) {
      this.isDefending = keys['KeyS'] || false;
      if (!this.isDefending) {
        if (keys['KeyA'] && this.x > 0) { this.x -= this.speed; this.direction = -1; }
        if (keys['KeyD'] && this.x + this.width < canvas.width) { this.x += this.speed; this.direction = 1; }
        if (keys['KeyW'] && this.onGround) { this.velocityY = this.jumpPower; this.onGround = false; }

        // --- PODER ESPECIAL (Tecla E - Disparo automático a los 2s) ---
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
            // Se restaura el cuarto parámetro (1) que usaba el WarriorBeam en bot-game.js
            this.activeBeam = new WarriorBeam(spawnX, this.y + (this.height / 2), this.direction, 1);
            
            warriorBeamSFX.currentTime = 0;
            warriorBeamSFX.play().catch(e => e);

            this.isCharging = false;
            this.chargeTime = 0;
          }
        }

        // --- ATAQUE BÁSICO (Espacio) ---
        if (keys['Space'] && !this.isAttacking && this.canAttack) {
          this.isAttacking = true; 
          this.hasDealtDamage = false; 
          this.canAttack = false;
          warriorBasicAttackSFX.currentTime = 0; 
          warriorBasicAttackSFX.play().catch(e => e);
          setTimeout(() => this.isAttacking = false, 200);
          setTimeout(() => this.canAttack = true, this.attackCooldown);
        }
      }

      this.velocityY += this.gravity;
      this.y += this.velocityY;
      if (this.y >= 300) { this.y = 300; this.velocityY = 0; this.onGround = true; }

      if (this.isAttacking && !this.hasDealtDamage) {
        const swordBox = { x: this.direction === 1 ? this.x + this.width : this.x - 45, y: this.y + 20, width: 45, height: 15 };
        if (checkRectCollision(swordBox, opponent)) { opponent.applyDamage(this.attackDamage); this.hasDealtDamage = true; }
      }
    }

    if (this.activeBeam) {
      this.activeBeam.update();
      if (this.activeBeam.active && !this.activeBeam.hasDealtDamage && roundActive) {
        const beamBox = { x: this.direction === 1 ? this.activeBeam.x : 0, y: this.activeBeam.y - this.activeBeam.height / 2, width: this.direction === 1 ? (canvas.width - this.activeBeam.x) : this.activeBeam.x, height: this.activeBeam.height };
        if (checkRectCollision(beamBox, opponent)) { opponent.applyDamage(this.activeBeam.damage); this.activeBeam.hasDealtDamage = true; }
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

class MagePlayer extends Character {
  constructor(x, y) {
    super(x, y, '#4488ff', 'warrior-hp', 'warrior-mana');
    this.projectiles = [];
    this.canAttack = true;
    this.attackCooldown = 400;
    this.isDashing = false;
    this.dashSpeed = 22;
    this.dashTargetX = 0;
    this.hoverOffset = 0;
    this.hoverAngle = 0;
  }

  reset() {
    super.reset();
    this.projectiles = [];
    this.isDashing = false;
  }

  shootProjectile() {
    const spawnX = this.direction === 1 ? this.x + this.width : this.x;
    this.projectiles.push(new Projectile(spawnX, this.y + 30, this.direction));
  }

  triggerDash(dir) {
    this.isDashing = true;
    const dashDistance = (canvas.width / 2) * dir;
    this.dashTargetX = Math.max(0, Math.min(canvas.width - this.width, this.x + dashDistance));
  }

  update(opponent) {
    this.regenMana();
    this.hoverAngle += 0.05;
    this.hoverOffset = Math.sin(this.hoverAngle) * 4;

    if (roundActive) {
      this.isDefending = keys['KeyS'] || false;
      if (!this.isDefending && !this.isDashing) {
        if (keys['KeyA'] && this.x > 0) { this.x -= this.speed; this.direction = -1; }
        if (keys['KeyD'] && this.x + this.width < canvas.width) { this.x += this.speed; this.direction = 1; }
        if (keys['KeyW'] && this.onGround) { this.velocityY = this.jumpPower; this.onGround = false; }

        if (keys['KeyE'] && this.mana >= 100) {
          this.mana = 0; this.updateManaBar();
          this.triggerDash(this.direction);
          mageBeamSFX.currentTime = 0; mageBeamSFX.play().catch(e=>e);
        }

        if (keys['Space'] && this.canAttack) {
          this.shootProjectile();
          mageBasicAttackSFX.currentTime = 0; mageBasicAttackSFX.play().catch(e=>e);
          this.canAttack = false;
          setTimeout(() => this.canAttack = true, this.attackCooldown);
        }
      }

      this.velocityY += this.gravity;
      this.y += this.velocityY;
      if (this.y >= 288) { this.y = 288; this.velocityY = 0; this.onGround = true; }

      if (this.isDashing) {
        this.x += this.dashSpeed * this.direction;
        this.x = Math.max(0, Math.min(canvas.width - this.width, this.x));
        if (checkRectCollision(this, opponent)) { opponent.applyDamage(120); this.isDashing = false; }
        if ((this.direction === 1 && this.x >= this.dashTargetX) || 
            (this.direction === -1 && this.x <= this.dashTargetX) ||
            this.x <= 0 || this.x + this.width >= canvas.width) {
          this.isDashing = false;
        }
      }

      this.projectiles.forEach(p => {
        p.update();
        if (p.active && checkCircleRectCollision(p, opponent)) {
          if (roundActive) opponent.applyDamage(p.damage);
          p.active = false;
        }
      });
      this.projectiles = this.projectiles.filter(p => p.active);
    }
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

// --- CLASES BOT (IA) ---
class MageBot extends Character {
  constructor(x, y, diff) {
    super(x, y, '#4488ff', 'mage-hp', 'mage-mana');
    this.direction = -1; 
    this.projectiles = []; 
    this.canAttack = true;
    this.attackCooldown = diff === 'hard' ? 400 : (diff === 'medium' ? 600 : 900);
    this.diff = diff;
    this.isDashing = false;
    this.dashSpeed = 22;
    this.dashTargetX = 0;
    this.hoverOffset = 0;
    this.hoverAngle = 0;
    this.moveTimer = 0;
    this.randomMoveDir = 0;
  }

  reset() {
    super.reset();
    this.projectiles = [];
    this.isDashing = false;
    this.moveTimer = 0;
  }

  shootProjectile() {
    const spawnX = this.direction === 1 ? this.x + this.width : this.x;
    this.projectiles.push(new Projectile(spawnX, this.y + 30, this.direction));
  }

  triggerDash(dir) {
    this.isDashing = true;
    const dashDistance = (canvas.width / 2) * dir;
    this.dashTargetX = Math.max(0, Math.min(canvas.width - this.width, this.x + dashDistance));
  }

  updateAI(opponent) {
    if (!roundActive) return;

    const dist = opponent.x - this.x;
    const absDist = Math.abs(dist);
    this.direction = dist > 0 ? 1 : -1;

    if (this.diff !== 'easy') {
      const isPlayerAttackingNear = opponent.isAttacking && absDist < 100;
      const isBeamActive = opponent.activeBeam && opponent.activeBeam.active;
      this.isDefending = (isPlayerAttackingNear || isBeamActive) && Math.random() < (this.diff === 'hard' ? 0.9 : 0.6);
    }

    if (this.isDefending || this.isDashing) return;

    if (this.mana >= 100 && absDist < 350) {
      if (this.diff === 'hard' || (this.diff === 'medium' && Math.random() < 0.02)) {
        this.mana = 0; this.updateManaBar();
        this.triggerDash(this.direction);
        mageBeamSFX.currentTime = 0; mageBeamSFX.play().catch(e=>e);
        return;
      }
    }

    if (this.diff === 'easy') {
      if (Math.random() < 0.03) this.x += (Math.random() > 0.5 ? 1 : -1) * this.speed;
    } else {
      // Mantenimiento de distancia
      if (absDist < 200) this.x -= this.direction * this.speed;
      else if (absDist > 320) this.x += this.direction * this.speed;

      // Movimientos aleatorios de reposicionamiento
      if (this.moveTimer <= 0) {
        if (Math.random() < 0.3) {
          this.randomMoveDir = Math.random() < 0.5 ? 1 : -1;
          this.moveTimer = 20 + Math.floor(Math.random() * 25);
        }
      } else {
        this.x += this.randomMoveDir * (this.speed * 0.8);
        this.moveTimer--;
      }
    }

    // Delimitar dentro del canvas
    this.x = Math.max(0, Math.min(canvas.width - this.width, this.x));

    if (this.canAttack) {
      const attackChance = this.diff === 'hard' ? 0.08 : (this.diff === 'medium' ? 0.04 : 0.015);
      if (Math.random() < attackChance) {
        this.shootProjectile();
        mageBasicAttackSFX.currentTime = 0; mageBasicAttackSFX.play().catch(e=>e);
        this.canAttack = false;
        setTimeout(() => this.canAttack = true, this.attackCooldown);
      }
    }
  }

  update(opponent) {
    this.regenMana();
    this.hoverAngle += 0.05;
    this.hoverOffset = Math.sin(this.hoverAngle) * 4;
    this.updateAI(opponent);

    this.velocityY += this.gravity;
    this.y += this.velocityY;
    if (this.y >= 288) { this.y = 288; this.velocityY = 0; this.onGround = true; }

    if (this.isDashing) {
      this.x += this.dashSpeed * this.direction;
      this.x = Math.max(0, Math.min(canvas.width - this.width, this.x));
      if (checkRectCollision(this, opponent)) { opponent.applyDamage(120); this.isDashing = false; }
      if ((this.direction === 1 && this.x >= this.dashTargetX) || 
          (this.direction === -1 && this.x <= this.dashTargetX) ||
          this.x <= 0 || this.x + this.width >= canvas.width) {
        this.isDashing = false;
      }
    }

    this.projectiles.forEach(p => {
      p.update();
      if (p.active && checkCircleRectCollision(p, opponent)) {
        if (roundActive) opponent.applyDamage(p.damage);
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

class WarriorBot extends Character {
  constructor(x, y, diff) {
    super(x, y, '#ff4444', 'mage-hp', 'mage-mana');
    this.direction = -1;
    this.isAttacking = false;
    this.attackDamage = 20;
    this.hasDealtDamage = false;
    this.canAttack = true;
    this.attackCooldown = diff === 'hard' ? 350 : (diff === 'medium' ? 500 : 800);
    this.diff = diff;
    this.chargeTime = 0;
    this.isCharging = false;
    this.activeBeam = null;
    this.retreating = false;
    this.moveTimer = 0;
    this.randomMoveDir = 0;
  }

  reset() {
    super.reset();
    this.activeBeam = null;
    this.isAttacking = false;
    this.isCharging = false;
    this.chargeTime = 0;
    this.retreating = false;
    this.moveTimer = 0;
  }

  updateAI(opponent) {
    if (!roundActive) return;

    const dist = opponent.x - this.x;
    const absDist = Math.abs(dist);
    this.direction = dist > 0 ? 1 : -1;

    if (this.diff !== 'easy') {
      const isPlayerAttackingNear = opponent.isAttacking && absDist < 80;
      const hasIncomingProjectile = opponent.projectiles && opponent.projectiles.some(p => Math.abs(p.x - this.x) < 120);
      this.isDefending = (isPlayerAttackingNear || hasIncomingProjectile) && Math.random() < (this.diff === 'hard' ? 0.85 : 0.5);
    }

    if (this.isDefending) return;

    // --- MANEJO DE MOVIMIENTO Y DISTANCIAMIENTO ---
    if (this.diff === 'easy') {
      if (this.retreating) {
        this.x -= this.direction * this.speed;
        if (absDist > 180) this.retreating = false;
      } else if (absDist > 50) {
        this.x += this.direction * this.speed;
      }
    } else {
      // Modos Medio y Difícil
      if (this.retreating) {
        this.x -= this.direction * this.speed;
        if (absDist > (this.diff === 'hard' ? 140 : 200)) this.retreating = false;
      } else if (!this.isCharging) {
        if (absDist > 60) {
          this.x += this.direction * this.speed;
        }

        // Micro-desplazamientos de amague
        if (this.moveTimer <= 0) {
          if (Math.random() < 0.25) {
            this.randomMoveDir = Math.random() < 0.5 ? 1 : -1;
            this.moveTimer = 15 + Math.floor(Math.random() * 20);
          }
        } else {
          this.x += this.randomMoveDir * this.speed;
          this.moveTimer--;
        }
      }
    }

    // Delimitar dentro del canvas
    this.x = Math.max(0, Math.min(canvas.width - this.width, this.x));

    // Ejecución de Ataques
    if (absDist <= 65 && this.canAttack && !this.isCharging) {
      const attackChance = this.diff === 'hard' ? 0.12 : (this.diff === 'medium' ? 0.06 : 0.03);
      if (Math.random() < attackChance) {
        this.isAttacking = true;
        this.hasDealtDamage = false;
        this.canAttack = false;
        warriorBasicAttackSFX.currentTime = 0; 
        warriorBasicAttackSFX.play().catch(e=>e);

        // Hace que retroceda tras golpear para evitar quedarse pegado
        this.retreating = true;

        setTimeout(() => this.isAttacking = false, 200);
        setTimeout(() => this.canAttack = true, this.attackCooldown);
      }
    }

    // Canalización de Especial (Rayo)
    if (this.mana >= 100 && this.diff !== 'easy') {
      const shouldStartCharge = (opponent.isDashing || Math.random() < 0.01);
      if (shouldStartCharge || this.isCharging) {
        if (!this.isCharging) {
          warriorChargeSFX.currentTime = 0;
          warriorChargeSFX.play().catch(e=>e);
        }
        this.isCharging = true;
        this.chargeTime += 0.016;

        if (this.chargeTime >= 5.0) {
          warriorChargeSFX.pause();
          warriorChargeSFX.currentTime = 0;
          this.mana = 0;
          this.updateManaBar();
          const spawnX = this.direction === 1 ? this.x + this.width : this.x;
          this.activeBeam = new WarriorBeam(spawnX, this.y + (this.height / 2), this.direction, 1);
          warriorBeamSFX.currentTime = 0;
          warriorBeamSFX.play().catch(e=>e);
          this.isCharging = false;
          this.chargeTime = 0;
        }
      }
    }
  }

  update(opponent) {
    this.regenMana();
    this.updateAI(opponent);

    this.velocityY += this.gravity;
    this.y += this.velocityY;
    if (this.y >= 300) { this.y = 300; this.velocityY = 0; this.onGround = true; }

    if (this.isAttacking && !this.hasDealtDamage) {
      const swordBox = { x: this.direction === 1 ? this.x + this.width : this.x - 45, y: this.y + 20, width: 45, height: 15 };
      if (checkRectCollision(swordBox, opponent)) { opponent.applyDamage(this.attackDamage); this.hasDealtDamage = true; }
    }

    if (this.activeBeam) {
      this.activeBeam.update();
      if (this.activeBeam.active && !this.activeBeam.hasDealtDamage && roundActive) {
        const beamBox = { x: this.direction === 1 ? this.activeBeam.x : 0, y: this.activeBeam.y - this.activeBeam.height / 2, width: this.direction === 1 ? (canvas.width - this.activeBeam.x) : this.activeBeam.x, height: this.activeBeam.height };
        if (checkRectCollision(beamBox, opponent)) { opponent.applyDamage(this.activeBeam.damage); this.activeBeam.hasDealtDamage = true; }
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
      ctx.fillStyle = this.chargeTime >= 5.0 ? '#ff1100' : '#ff9900';
      ctx.beginPath();
      ctx.arc(this.x + this.width / 2, this.y + this.height / 2, 18 + Math.random() * 6, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.activeBeam && this.activeBeam.active) {
      this.activeBeam.draw();
    }
  }
}

// --- INSTANCIACIÓN ---
let player1, botPlayer;

if (playerCharType === 'warrior') {
  player1 = new Warrior(100, 300);
  const el = document.getElementById('ui-warrior-name');
  if (el) el.innerText = "Guerrero (P1)";
} else {
  player1 = new MagePlayer(100, 300);
  const el = document.getElementById('ui-warrior-name');
  if (el) el.innerText = "Mago (P1)";
}

if (botCharType === 'mage') {
  botPlayer = new MageBot(660, 300, difficulty);
  const el = document.getElementById('ui-mage-name');
  if (el) el.innerText = "Mago (IA)";
} else {
  botPlayer = new WarriorBot(660, 300, difficulty);
  const el = document.getElementById('ui-mage-name');
  if (el) el.innerText = "Guerrero (IA)";
}

const bgImage = new Image();
bgImage.src = 'img/backgrounds/tokyo.jpg';

function startNewRound() {
  let count = 3;
  roundActive = false;
  countdownValue = count;
  player1.reset();
  botPlayer.reset();

  const timer = setInterval(() => {
    count--;
    if (count > 0) countdownValue = count;
    else {
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
  
  const p1Name = playerCharType === 'warrior' ? 'Guerrero' : 'Mago';
  const botName = botCharType === 'mage' ? 'Mago (IA)' : 'Guerrero (IA)';
  
  ctx.fillText(`${p1Name}: ${scores.player1}  VS  ${botName}: ${scores.bot}`, canvas.width / 2, 35);

  if (countdownValue !== null) {
    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 80px Arial';
    ctx.fillText(countdownValue, canvas.width / 2, canvas.height / 2);
  }
}

function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (bgImage.complete) ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
  else { ctx.fillStyle = '#222'; ctx.fillRect(0, 0, canvas.width, canvas.height); }

  ctx.fillStyle = '#444'; 
  ctx.fillRect(0, 370, canvas.width, 30);

  player1.update(botPlayer);
  botPlayer.update(player1);

  player1.draw();
  botPlayer.draw();

  drawUI();
  requestAnimationFrame(gameLoop);
}



// --- SOPORTE PARA CONTROLES TÁCTILES EN MÓVILES ---
function setupTouchEvents() {
  const bindTouch = (elementId, code) => {
    const btn = document.getElementById(elementId);
    if (!btn) return;

    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      keys[code] = true;
      tryPlayAudio();
    });

    btn.addEventListener('touchend', (e) => {
      e.preventDefault();
      keys[code] = false;
    });

    btn.addEventListener('mousedown', () => {
      keys[code] = true;
      tryPlayAudio();
    });

    btn.addEventListener('mouseup', () => {
      keys[code] = false;
    });
  };

  bindTouch('btn-left', 'KeyA');
  bindTouch('btn-right', 'KeyD');
  bindTouch('btn-jump', 'KeyW');
  bindTouch('btn-defend', 'KeyS');
  bindTouch('btn-attack', 'Space');
  bindTouch('btn-special', 'KeyE');
}

// Inicializar listener de botones táctiles
setupTouchEvents();












startNewRound();
requestAnimationFrame(gameLoop);