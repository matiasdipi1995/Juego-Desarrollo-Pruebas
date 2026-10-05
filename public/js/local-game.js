//ESTE ES EL MODO DE JUEGO 1 VS 1 (PERSONA VS PERSONA)



// --- BLOQUEO DE DISPOSITIVOS MÓVILES ---
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
if (isMobile) {
  alert("El modo 1 vs 1 en la misma pantalla solo está disponible para computadoras con teclado.");
  window.location.href = "index.html";
}

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

// --- VARIABLES GLOBALES ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const keys = {};

let roundActive = false;
//let scores = { warrior: 0, mage: 0 }; COMENTO ESTA VARIABLE PORQUE LA DECLARO MÁS ABAJO, EN LUGAR DE DECLARAR WARRIOR O MAGE DECLARO PLAYER 1 O 2 PARA MÁS FLEXIBILIDAD
let countdownValue = null;

window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);

// --- REPRODUCCIÓN DE MÚSICA DE FONDO (Interacción del usuario) ---
function tryPlayAudio() {
  if (bgMusic.paused) {
    bgMusic.play().then(() => {
      window.removeEventListener('keydown', tryPlayAudio);
      window.removeEventListener('mousedown', tryPlayAudio);
    }).catch(e => console.log('Esperando interacción para reprodución:', e));
  }
}

window.addEventListener('keydown', tryPlayAudio);
window.addEventListener('mousedown', tryPlayAudio);

// --- COLISIONES ---
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

// --- PROYECTILES Y HABILIDADES ---
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
    ctx.shadowBlur = 20; ctx.shadowColor = '#ff3300';
    const drawX = this.dir === 1 ? this.x : 0;
    const drawWidth = this.dir === 1 ? (canvas.width - this.x) : this.x;
    ctx.fillRect(drawX, this.y - this.height / 2, drawWidth, this.height);
    ctx.shadowBlur = 0; 
  }
}

// --- CLASE BASE ENTIDADES ---
class Character {
  constructor(x, y, color, hpId, manaId) {
    this.startX = x; this.startY = y;
    this.x = x; this.y = y;
    this.width = 40; this.height = 70;
    this.color = color; this.speed = 4;
    this.direction = 1; 
    this.maxHp = 300; this.hp = 300;
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

    // DENTRO DE LA CLASE Character -> método applyDamage(amount):

        if (this.hp <= 0 && roundActive) {
          roundActive = false;
          const winner = (this instanceof Warrior) ? 'Mago' : 'Guerrero';
          if (winner === 'Guerrero') scores.warrior++;
          else scores.mage++;
        
          setTimeout(() => {
            // CAMBIO AQUÍ: Evaluamos a >= 3 en lugar de >= 2
            if (scores.warrior >= 3 || scores.mage >= 3) {
              alert(`¡Juego Terminado! Ganador final: ${winner.toUpperCase()}`);
              location.reload();
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

// --- GUERRERO  ---
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
      const pressingDefense = keys['KeyS'] || false;
      if (pressingDefense && !this.isDefending) {
        defenseSFX.currentTime = 0;
        defenseSFX.play().catch(e => console.log(e));
      }
      this.isDefending = pressingDefense;

      if (!this.isDefending) {
        if (keys['KeyA'] && this.x > 0) { this.x -= this.speed; this.direction = -1; }
        if (keys['KeyD'] && this.x + this.width < canvas.width) { this.x += this.speed; this.direction = 1; }
        if (keys['KeyW'] && this.onGround) { this.velocityY = this.jumpPower; this.onGround = false; }

        // --- Habilidad Especial E (Carga automática de 2s) ---
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
            this.activeBeam = new WarriorBeam(spawnX, spawnY, this.direction, 1);
            
            warriorBeamSFX.currentTime = 0;
            warriorBeamSFX.play().catch(e => console.log(e));

            this.isCharging = false;
            this.chargeTime = 0;
          }
        }

        // --- Ataque Básico Espacio ---
        if (keys['Space'] && !this.isAttacking && this.canAttack) {
          this.isAttacking = true;
          this.hasDealtDamage = false;
          this.canAttack = false;
          warriorBasicAttackSFX.currentTime = 0;
          warriorBasicAttackSFX.play().catch(e => console.log(e));
          setTimeout(() => this.isAttacking = false, 200);
          setTimeout(() => this.canAttack = true, this.attackCooldown);
        }
      }

      // Física
      this.velocityY += this.gravity;
      this.y += this.velocityY;
      if (this.y >= 300) { this.y = 300; this.velocityY = 0; this.onGround = true; }

      // Colisión de Ataque
      if (this.isAttacking && !this.hasDealtDamage) {
        const swordBox = {
          x: this.direction === 1 ? this.x + this.width : this.x - 45,
          y: this.y + 20, width: 45, height: 15
        };
        if (checkRectCollision(swordBox, opponent)) {
          opponent.applyDamage(this.attackDamage);
          this.hasDealtDamage = true;
        }
      }
    }

    // Rayo Láser
    if (this.activeBeam) {
      this.activeBeam.update();
      if (this.activeBeam.active && !this.activeBeam.hasDealtDamage && roundActive) {
        const beamBox = {
          x: this.direction === 1 ? this.activeBeam.x : 0,
          y: this.activeBeam.y - this.activeBeam.height / 2,
          width: this.direction === 1 ? (canvas.width - this.activeBeam.x) : this.activeBeam.x,
          height: this.activeBeam.height
        };
        if (checkRectCollision(beamBox, opponent)) {
          opponent.applyDamage(this.activeBeam.damage);
          this.activeBeam.hasDealtDamage = true;
        }
      }
    }
  }

  draw() {
    super.draw();
    // Casco
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

// --- MAGO  ---
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
    this.projectiles.push(new Projectile(spawnX, this.y + 30, this.direction));
  }

  triggerDash(dir) {
    this.isDashing = true;
    const dashDistance = (canvas.width / 2) * dir;
    this.dashTargetX = Math.max(0, Math.min(canvas.width - this.width, this.x + dashDistance));
  }

  update(opponent) {
    this.regenMana();
    this.hoverOffset = Math.sin(Date.now() / 200) * 4;

    if (roundActive) {
      const pressingDefense = keys['ArrowDown'] || false;
      if (pressingDefense && !this.isDefending) {
        defenseSFX.currentTime = 0;
        defenseSFX.play().catch(e => console.log(e));
      }
      this.isDefending = pressingDefense;

      if (!this.isDefending && !this.isDashing) {
        if (keys['ArrowLeft'] && this.x > 0) { this.x -= this.speed; this.direction = -1; }
        if (keys['ArrowRight'] && this.x + this.width < canvas.width) { this.x += this.speed; this.direction = 1; }
        if (keys['ArrowUp'] && this.onGround) { this.velocityY = this.jumpPower; this.onGround = false; }

        // Ataque Básico Enter
        if (keys['Enter'] && this.canAttack) {
          this.shootProjectile();
          mageBasicAttackSFX.currentTime = 0;
          mageBasicAttackSFX.play().catch(e => console.log(e));
          this.canAttack = false;
          setTimeout(() => this.canAttack = true, this.attackCooldown);
        }

        // Habilidad Especial M / ShiftRight
        if ((keys['ShiftRight'] || keys['KeyM']) && this.mana >= 100) {
          this.mana = 0;
          this.updateManaBar();
          this.triggerDash(this.direction);
          mageBeamSFX.currentTime = 0;
          mageBeamSFX.play().catch(e => console.log(e));
        }
      }

      // Física
      this.velocityY += this.gravity;
      this.y += this.velocityY;
      if (this.y >= 288) { this.y = 288; this.velocityY = 0; this.onGround = true; }

      // Dash
      if (this.isDashing) {
        this.x += this.dashSpeed * this.direction;
        if (checkRectCollision(this, opponent)) {
          opponent.applyDamage(120);
          this.isDashing = false;
        }
        if ((this.direction === 1 && this.x >= this.dashTargetX) || 
            (this.direction === -1 && this.x <= this.dashTargetX) ||
            this.x <= 0 || this.x + this.width >= canvas.width) {
          this.isDashing = false;
        }
      }
    }

    // Proyectiles
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

    // Sombrero
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

// ARQUERO - NUEVA CLASE

// --- PROYECTILES Y HABILIDADES DEL ARQUERO ---
class ArrowProjectile {
  constructor(x, y, dir, damage = 35) {
    this.x = x; this.y = y; this.dir = dir;
    this.speed = 11 * dir;
    this.damage = damage;
    this.width = 24; this.height = 6;
    this.active = true;
  }

  update() {
    this.x += this.speed;
    if (this.x < -50 || this.x > canvas.width + 50) this.active = false;
  }

  draw() {
    if (!this.active) return;
    ctx.fillStyle = '#8d6e63';
    ctx.fillRect(this.x, this.y - this.height / 2, this.width, this.height);
    
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
    this.x = x; this.y = y; this.dir = dir;
    this.speed = 18 * dir; // Desplazamiento horizontal rápido
    this.damage = damage;  // 65% del HP max del rival
    this.width = 75; this.height = 20;
    this.active = true;
    this.hasDealtDamage = false;
  }

  update() {
    this.x += this.speed;
    if (this.x < -100 || this.x > canvas.width + 100) this.active = false;
  }

  draw() {
    if (!this.active) return;
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#ff9800';

    ctx.fillStyle = '#ff5722';
    ctx.fillRect(this.x, this.y - this.height / 2, this.width, this.height);

    ctx.fillStyle = '#ffe082';
    const tipX = this.dir === 1 ? this.x + this.width : this.x;
    ctx.beginPath();
    ctx.moveTo(tipX, this.y - this.height * 1.5);
    ctx.lineTo(tipX + (22 * this.dir), this.y);
    ctx.lineTo(tipX, this.y + this.height * 1.5);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;
  }
}

// --- ARQUERO ---
class Archer extends Character {
  constructor(x, y, hpId = 'p1-hp', manaId = 'p1-mana') {
    super(x, y, '#2e7d32', hpId, manaId);
    this.projectiles = [];
    this.specialArrow = null;
    this.canAttack = true;
    this.attackCooldown = 750; // Más lento que el Mago (600ms)
    this.basicDamage = 35;      // Más daño base que el Mago/Guerrero
  }

  reset() {
    super.reset();
    this.projectiles = [];
    this.specialArrow = null;
    this.canAttack = true;
  }

  shootArrow() {
    const spawnX = this.direction === 1 ? this.x + this.width : this.x;
    this.projectiles.push(new ArrowProjectile(spawnX, this.y + 30, this.direction, this.basicDamage));
  }

  shootSpecial(opponent) {
    const spawnX = this.direction === 1 ? this.x + this.width : this.x;
    const damage = opponent ? Math.round(opponent.maxHp * 0.65) : 195; // 65% de 300 HP
    this.specialArrow = new ArcherBigArrow(spawnX, this.y + 35, this.direction, damage);
  }

  update(opponent) {
    this.regenMana();

    if (roundActive) {
      // Soporta controles de P1 (WASD) o P2 (Flechas) según el lado
      const isP1 = this.startX < 400;
      const pressingDefense = isP1 ? keys['KeyS'] : keys['ArrowDown'];
      
      if (pressingDefense && !this.isDefending) {
        if (typeof defenseSFX !== 'undefined') {
          defenseSFX.currentTime = 0;
          defenseSFX.play().catch(e => console.log(e));
        }
      }
      this.isDefending = pressingDefense || false;

      if (!this.isDefending) {
        const leftKey = isP1 ? keys['KeyA'] : keys['ArrowLeft'];
        const rightKey = isP1 ? keys['KeyD'] : keys['ArrowRight'];
        const jumpKey = isP1 ? keys['KeyW'] : keys['ArrowUp'];
        const attackKey = isP1 ? keys['Space'] : keys['Enter'];
        const specialKey = isP1 ? keys['KeyE'] : (keys['ShiftRight'] || keys['KeyM']);

        if (leftKey && this.x > 0) { this.x -= this.speed; this.direction = -1; }
        if (rightKey && this.x + this.width < canvas.width) { this.x += this.speed; this.direction = 1; }
        if (jumpKey && this.onGround) { this.velocityY = this.jumpPower; this.onGround = false; }

        // Ataque básico
        if (attackKey && this.canAttack) {
          this.shootArrow();
          if (typeof archerBasicAttackSFX !== 'undefined') {
            archerBasicAttackSFX.currentTime = 0;
            archerBasicAttackSFX.play().catch(e => console.log(e));
          }
          this.canAttack = false;
          setTimeout(() => this.canAttack = true, this.attackCooldown);
        }

        // Especial (Flecha Grande - 65% HP)
        if (specialKey && this.mana >= 100) {
          this.mana = 0;
          this.updateManaBar();
          this.shootSpecial(opponent);
          if (typeof archerSpecialSFX !== 'undefined') {
            archerSpecialSFX.currentTime = 0;
            archerSpecialSFX.play().catch(e => console.log(e));
          }
        }
      }

      // Física
      this.velocityY += this.gravity;
      this.y += this.velocityY;
      if (this.y >= 300) { this.y = 300; this.velocityY = 0; this.onGround = true; }
    }

    // Impactos Flecha BÁSICA
    this.projectiles.forEach(p => {
      p.update();
      const pBox = { x: p.x, y: p.y - p.height / 2, width: p.width, height: p.height };
      if (p.active && checkRectCollision(pBox, opponent)) {
        if (roundActive) opponent.applyDamage(p.damage);
        p.active = false;
      }
    });
    this.projectiles = this.projectiles.filter(p => p.active);

    // Impactos Flecha ESPECIAL
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
          if (roundActive) {
            opponent.applyDamage(this.specialArrow.damage);
            this.specialArrow.hasDealtDamage = true;
          }
        }
      }
      if (!this.specialArrow.active) this.specialArrow = null;
    }
  }

  draw() {
    super.draw();
    // Sombrero de arquero y pluma
    ctx.fillStyle = '#1b5e20';
    ctx.fillRect(this.x - 2, this.y - 12, this.width + 4, 10);
    ctx.fillStyle = '#b71c1c';
    const featherX = this.direction === 1 ? this.x + 4 : this.x + this.width - 8;
    ctx.fillRect(featherX, this.y - 22, 4, 10);

    this.projectiles.forEach(p => p.draw());
    if (this.specialArrow) this.specialArrow.draw();
  }
}

// BORRÉ LA INSTANCIACIÓN DE MAGO O GUERRERO PORQUE NO ME DABA OPCIONES FUERA DE ESOS DOS, AHORA SERÁ MÁS DINÁMICO ACEPTANDO A LA NUEVA CLASE DE ARQUERO, ESPERO QUE NO SEA UNA CAGADA TODAVÍA NO LA PROBÉ XD


// --- INICIALIZACIÓN DINÁMICA DE JUGADORES ---
// En lugar de instanciar warrior y mage directamente, creamos player1 y player2
let player1 = new Warrior(100, 300);
let player2 = new Mage(660, 300);

let scores = { p1: 0, p2: 0 };

// Modificación dentro del método applyDamage en Character o chequeo general
function checkVictoryCondition() {
  if (player1.hp <= 0 && roundActive) {
    roundActive = false;
    scores.p2++;
    handleRoundEnd("Jugador 2");
  } else if (player2.hp <= 0 && roundActive) {
    roundActive = false;
    scores.p1++;
    handleRoundEnd("Jugador 1");
  }
}

function handleRoundEnd(winnerName) {
  setTimeout(() => {
    if (scores.p1 >= 3 || scores.p2 >= 3) {
      alert(`¡Juego Terminado! Ganador final: ${winnerName}`);
      location.reload();
    } else {
      startNewRound();
    }
  }, 500);
}

function resetEntities() {
  player1.reset();
  player2.reset();
}

function startNewRound() {
  let count = 3;
  roundActive = false;
  countdownValue = count;
        
  changeRandomBackground();
  resetEntities();

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
  ctx.fillText(`P1: ${scores.p1}  VS  P2: ${scores.p2}`, canvas.width / 2, 35);

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
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.fillStyle = '#444'; 
  ctx.fillRect(0, 370, canvas.width, 30);

  // Actualizar e Intercambiar oponentes
  player1.update(player2);
  player2.update(player1);

  // Chequear victorias de ronda
  checkVictoryCondition();

  // Renderizar
  player1.draw();
  player2.draw();

  drawUI();
  requestAnimationFrame(gameLoop);
}

// Inicializar primera ronda y game loop
startNewRound();
requestAnimationFrame(gameLoop);