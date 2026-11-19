// public/js/classes/Character.js

class Character {
  /**
   * @param {Object} config
   * {
   *   x, y, width, height, color, direction,
   *   hpId, manaId,
   *   stats: { vida, mana, ataque, defensa },
   *   equipment: { arma, sombrero, armadura, accesorio },
   *   controls: { left, right, jump, defend, attack, special, invisible }
   * }
   */
  constructor(config = {}) {
    this.startX = config.x ?? 100;
    this.startY = config.y ?? 300;
    this.x = this.startX;
    this.y = this.startY;
    this.targetX = this.startX;
    this.targetY = this.startY;

    this.width = config.width ?? 45;
    this.height = config.height ?? 75;
    this.color = config.color ?? '#cccccc';
    this.speed = config.speed ?? 4.5;
    this.direction = config.direction ?? 1;

    // Estadísticas dinámicas (BD + Ítems)
    const stats = config.stats || {};
    this.maxHp = stats.vida ?? 500;
    this.hp = this.maxHp;
    this.maxMana = stats.mana ?? 100;
    this.mana = this.maxMana;
    this.attack = stats.ataque ?? 20;
    this.defense = stats.defensa ?? 10;

    // Ítems visuales equipados (claves id_visual de PostgreSQL)
    this.equipment = config.equipment || {
      arma: null,
      sombrero: null,
      armadura: null,
      accesorio: null
    };

    // Controles configurables por modo (P1, P2, Online o null si es Bot)
    this.controls = config.controls || null;

    // Elementos del DOM para barras de vida/maná
    this.hpElement = config.hpId ? document.getElementById(config.hpId) : null;
    this.manaElement = config.manaId ? document.getElementById(config.manaId) : null;

    // Física y estados de combate
    this.velocityY = 0;
    this.gravity = 0.6;
    this.jumpPower = -12.5;
    this.onGround = true;
    this.isHit = false;
    this.isDefending = false;

    // Estado de invisibilidad (para ítem Capa de las Sombras / habilidades)
    this.isInvisible = false;
    this.invisibleUntil = 0;
    this.invisibleCooldownUntil = 0;
  }

  reset() {
    this.x = this.startX;
    this.y = this.startY;
    this.targetX = this.startX;
    this.targetY = this.startY;
    this.hp = this.maxHp;
    this.mana = this.maxMana;
    this.velocityY = 0;
    this.onGround = true;
    this.isHit = false;
    this.isDefending = false;
    this.isInvisible = false;
    this.invisibleUntil = 0;
    this.invisibleCooldownUntil = 0;
    this.updateHpBar();
    this.updateManaBar();
  }

  updateHpBar() {
    if (this.hpElement) {
      const pct = Math.max(0, Math.min(100, (this.hp / this.maxHp) * 100));
      this.hpElement.style.width = `${pct}%`;
    }
  }

  updateManaBar() {
    if (this.manaElement) {
      const pct = Math.max(0, Math.min(100, (this.mana / this.maxMana) * 100));
      this.manaElement.style.width = `${pct}%`;
    }
  }

  regenMana(rate = 0.15) {
    if (this.mana < this.maxMana) {
      this.mana = Math.min(this.maxMana, this.mana + rate);
      this.updateManaBar();
    }
  }

  applyDamage(rawAmount) {
    // Reducción por atributo de defensa (escalable, nunca anula al 100%)
    const defenseMultiplier = 100 / (100 + Math.max(0, this.defense));
    let finalDamage = rawAmount * defenseMultiplier;

    // Reducción adicional si está cubriéndose con escudo/defensa
    if (this.isDefending) {
      finalDamage *= 0.25;
    }

    finalDamage = Math.max(1, Math.round(finalDamage));
    this.hp = Math.max(0, this.hp - finalDamage);
    this.updateHpBar();

    this.isHit = true;
    setTimeout(() => { this.isHit = false; }, 100);

    return finalDamage;
  }

  activateInvisibility(durationMs = 10000, cooldownMs = 20000) {
    const now = Date.now();
    if (now < this.invisibleCooldownUntil) return false;
    this.isInvisible = true;
    this.invisibleUntil = now + durationMs;
    this.invisibleCooldownUntil = now + durationMs + cooldownMs;
    return true;
  }

  updateInvisibility() {
    if (this.isInvisible && Date.now() >= this.invisibleUntil) {
      this.isInvisible = false;
    }
  }

  applyPhysics(canvasHeight, groundOffset = 0) {
    this.velocityY += this.gravity;
    this.y += this.velocityY;
    const floorY = canvasHeight - 30 - this.height - groundOffset;

    if (this.y >= floorY) {
      this.y = floorY;
      this.velocityY = 0;
      this.onGround = true;
    }
  }

  interpolatePosition() {
    if (typeof this.targetX === 'number' && !isNaN(this.targetX)) {
      this.x += (this.targetX - this.x) * 0.3;
    }
    if (typeof this.targetY === 'number' && !isNaN(this.targetY)) {
      this.y += (this.targetY - this.y) * 0.3;
    }
  }

  // Helper para que las teclas soporten un string o un array de teclas (ej: ['ShiftRight', 'KeyM'])
  isKeyPressed(keys, binding) {
    if (!binding || !keys) return false;
    if (Array.isArray(binding)) return binding.some(code => !!keys[code]);
    return !!keys[binding];
  }

  /**
   * Dibuja el cuerpo base (armadura visual + aura de defensa).
   * @param {CanvasRenderingContext2D} ctx
   * @param {boolean} isEnemyView - true si quien mira es el oponente (para ocultar al invisible)
   */
  drawBase(ctx, isEnemyView = false) {
    if (isNaN(this.x)) this.x = this.startX;
    if (isNaN(this.y)) this.y = this.startY;

    // Si es invisible: el rival no ve nada, el dueño se ve translúcido
    if (this.isInvisible) {
      if (isEnemyView) return false;
      ctx.globalAlpha = 0.3;
    }

    // Cuerpo principal
    ctx.fillStyle = this.isHit ? '#ffffff' : this.color;
    ctx.fillRect(this.x, this.y, this.width, this.height);

    // Armaduras equipadas (reemplazan el torso liso según el id_visual)
    const armor = this.equipment.armadura;
    if (armor === 'coraza_acero') {
      // Pechera metálica plateada con remaches
      ctx.fillStyle = '#b0bec5';
      ctx.fillRect(this.x + 3, this.y + 8, this.width - 6, this.height * 0.48);
      ctx.strokeStyle = '#eceff1';
      ctx.lineWidth = 2;
      ctx.strokeRect(this.x + 3, this.y + 8, this.width - 6, this.height * 0.48);
    } else if (armor === 'tunica_runica') {
      // Franja rúnica dorada y rombo arcano en la túnica
      ctx.fillStyle = '#311b92';
      ctx.fillRect(this.x + 6, this.y + 6, this.width - 12, this.height - 12);
      ctx.strokeStyle = '#ffd54f';
      ctx.lineWidth = 2;
      ctx.strokeRect(this.x + 6, this.y + 6, this.width - 12, this.height - 12);
    } else if (armor === 'pechera_bosque') {
      // Chaleco de cuero reforzado con correa cruzada
      ctx.fillStyle = '#5d4037';
      ctx.fillRect(this.x + 3, this.y + 10, this.width - 6, this.height * 0.45);
      ctx.strokeStyle = '#a5d6a7';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(this.x + 4, this.y + 10);
      ctx.lineTo(this.x + this.width - 4, this.y + 10 + this.height * 0.45);
      ctx.stroke();
    } else if (armor === 'traje_shinobi') {
      // Placas tácticas oscuras con cinturón púrpura
      ctx.fillStyle = '#102027';
      ctx.fillRect(this.x + 3, this.y + 8, this.width - 6, this.height * 0.46);
      ctx.fillStyle = '#ab47bc';
      ctx.fillRect(this.x, this.y + this.height * 0.52, this.width, 6);
    } else if (armor) {
      // Respaldo para futuras armaduras que agregues desde el Admin
      ctx.strokeStyle = '#ffd54f';
      ctx.lineWidth = 2;
      ctx.strokeRect(this.x + 4, this.y + 10, this.width - 8, this.height - 25);
    }

    // Aura de defensa activa
    if (this.isDefending) {
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 4;
      ctx.strokeRect(this.x - 2, this.y - 2, this.width + 4, this.height + 4);
    }

    return true;
  }
}