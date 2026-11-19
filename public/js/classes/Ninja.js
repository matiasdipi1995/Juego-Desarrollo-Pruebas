// public/js/classes/Ninja.js

class Ninja extends Character {
  constructor(config = {}) {
    super({
      color: '#263238',
      speed: 5.5,      // Más ágil que el resto
      jumpPower: -13.5,
      ...config
    });
    this.className = 'ninja';
    this.projectiles = [];
    this.canAttack = true;
    this.attackCooldown = 420;

    // Estocada Especial Ida y Vuelta
    this.dashPhase = 0; // 0: normal, 1: ida, 2: vuelta
    this.dashSpeedGo = 28;
    this.dashSpeedBack = 30;
    this.dashOriginX = 0;
    this.dashTargetX = 0;
    this.dashDir = 1;
    this.hitOnGo = false;
    this.hitOnReturn = false;
    this.afterimages = []; // Estelas visuales de velocidad
  }

  reset() {
    super.reset();
    this.projectiles = [];
    this.canAttack = true;
    this.dashPhase = 0;
    this.hitOnGo = false;
    this.hitOnReturn = false;
    this.afterimages = [];
  }

  spawnShuriken(x, y, dir, visualId = null) {
    this.projectiles.push(new ShurikenProjectile(x, y, dir, this.attack, visualId || this.equipment.arma));
  }

  triggerDoubleDash(dir, canvasWidth) {
    this.dashPhase = 1;
    this.dashDir = dir;
    this.dashOriginX = this.x;
    const distance = (canvasWidth * 0.48) * dir;
    this.dashTargetX = Math.max(0, Math.min(canvasWidth - this.width, this.x + distance));
    this.hitOnGo = false;
    this.hitOnReturn = false;
    this.afterimages = [];
  }

  update(opponent, env) {
    const { keys, canvas, roundActive, isLocal = true, callbacks = {} } = env;
    this.regenMana(0.18); // Regenera maná ligeramente más rápido
    this.updateInvisibility();

    // Desvanecer estelas de velocidad
    if (this.afterimages.length > 0) {
      this.afterimages.forEach(img => { img.alpha -= 0.08; });
      this.afterimages = this.afterimages.filter(img => img.alpha > 0);
    }

    if (isLocal) {
      if (roundActive && this.controls) {
        const pressingDefense = this.isKeyPressed(keys, this.controls.defend);
        if (pressingDefense && !this.isDefending && this.dashPhase === 0) {
          callbacks.onSound?.('defense');
        }
        this.isDefending = this.dashPhase === 0 && pressingDefense;

        // Activar Invisibilidad de 10 segundos si tiene la Capa de las Sombras equipada
        if (this.equipment.accesorio === 'capa_invisible' &&
            this.isKeyPressed(keys, this.controls.invisible)) {
          const activated = this.activateInvisibility(10000, 20000);
          if (activated) {
            callbacks.onSound?.('ninjaVanish');
            callbacks.onSpecial?.({ type: 'ninjaInvisible', duration: 10000 });
          }
        }

        if (!this.isDefending && this.dashPhase === 0) {
          if (this.isKeyPressed(keys, this.controls.left) && this.x > 0) {
            this.x -= this.speed;
            this.direction = -1;
          }
          if (this.isKeyPressed(keys, this.controls.right) && this.x + this.width < canvas.width) {
            this.x += this.speed;
            this.direction = 1;
          }
          if (this.isKeyPressed(keys, this.controls.jump) && this.onGround) {
            this.velocityY = this.jumpPower;
            this.onGround = false;
          }

          // Ataque Básico (Shuriken)
          if (this.isKeyPressed(keys, this.controls.attack) && this.canAttack) {
            const spawnX = this.direction === 1 ? this.x + this.width : this.x;
            const spawnY = this.y + (this.height * 0.4);
            this.spawnShuriken(spawnX, spawnY, this.direction);
            callbacks.onSound?.('ninjaBasic');
            callbacks.onShoot?.({ type: 'ninjaShoot', x: spawnX, y: spawnY, dir: this.direction, visualId: this.equipment.arma });
            this.canAttack = false;
            setTimeout(() => { this.canAttack = true; }, this.attackCooldown);
          }

          // Ataque Especial: Estocada Ida y Vuelta (2 cortes)
          if (this.isKeyPressed(keys, this.controls.special) && this.mana >= this.maxMana) {
            this.mana = 0;
            this.updateManaBar();
            this.triggerDoubleDash(this.direction, canvas.width);
            callbacks.onSound?.('ninjaSpecial');
            callbacks.onSpecial?.({ type: 'ninjaDash', dir: this.direction });
          }
        }

        // --- EJECUCIÓN DE LA ESTOCADA IDA Y VUELTA ---
        if (this.dashPhase > 0) {
          this.afterimages.push({ x: this.x, y: this.y, alpha: 0.65 });
          const slashDamage = Math.round(this.attack * 2.5); // Cada corte hace 2.5x ataque (5x total si conecta ida y vuelta)

          if (this.dashPhase === 1) {
            // FASE 1: IDA
            this.x += this.dashSpeedGo * this.dashDir;

            if (opponent && !this.hitOnGo && checkRectCollision(this, opponent)) {
              opponent.applyDamage(slashDamage);
              callbacks.onDamage?.(slashDamage);
              this.hitOnGo = true;
            }

            const reachedTarget = (this.dashDir === 1 && this.x >= this.dashTargetX) ||
                                  (this.dashDir === -1 && this.x <= this.dashTargetX);
            if (reachedTarget) {
              this.x = this.dashTargetX;
              this.dashPhase = 2; // Inicia la vuelta inmediata
            }
          } else if (this.dashPhase === 2) {
            // FASE 2: VUELTA AL ORIGEN
            this.x -= this.dashSpeedBack * this.dashDir;

            if (opponent && !this.hitOnReturn && checkRectCollision(this, opponent)) {
              opponent.applyDamage(slashDamage);
              callbacks.onDamage?.(slashDamage);
              this.hitOnReturn = true;
            }

            const returnedOrigin = (this.dashDir === 1 && this.x <= this.dashOriginX) ||
                                   (this.dashDir === -1 && this.x >= this.dashOriginX);
            if (returnedOrigin) {
              this.x = this.dashOriginX;
              this.dashPhase = 0; // Fin de la estocada
            }
          }
        }
      }

      // Durante el dash vuela recto; fuera del dash aplica gravedad normal
      if (this.dashPhase === 0) {
        this.applyPhysics(canvas.height);
      }
    } else {
      this.interpolatePosition();
      if (this.dashPhase > 0) {
        this.afterimages.push({ x: this.x, y: this.y, alpha: 0.65 });
      }
    }

    // Proyectiles Shuriken
    this.projectiles.forEach(p => {
      p.update(canvas.width);
      if (p.active && opponent && checkCircleRectCollision(p, opponent)) {
        if (isLocal && roundActive) {
          opponent.applyDamage(p.damage);
          callbacks.onDamage?.(p.damage);
        }
        p.active = false;
      }
    });
    this.projectiles = this.projectiles.filter(p => p.active);
  }

  draw(ctx, canvasWidth, isEnemyView = false) {
    if (!(this.isInvisible && isEnemyView)) {
      this.afterimages.forEach(img => {
        ctx.save();
        ctx.globalAlpha = img.alpha;
        ctx.fillStyle = '#ab47bc';
        ctx.fillRect(img.x, img.y, this.width, this.height);
        ctx.restore();
      });
    }

    ctx.save();
    const visible = this.drawBase(ctx, isEnemyView);

    if (visible) {
      // 1. ACCESORIO: Capa de las Sombras reemplaza a la bufanda roja estándar
      const hasShadowCape = this.equipment.accesorio === 'capa_invisible';
      ctx.fillStyle = hasShadowCape ? '#4a148c' : '#d32f2f';
      const tailX = this.direction === 1 ? this.x - 12 : this.x + this.width;
      ctx.fillRect(tailX, this.y + 6, 12, hasShadowCape ? this.height - 10 : 8);

      // 2. SOMBRERO: Banda del Maestro reemplaza a la banda roja estándar
      const isMasterBand = this.equipment.sombrero === 'banda_maestro';
      ctx.fillStyle = '#1c2529';
      ctx.fillRect(this.x - 2, this.y - 20, this.width + 4, 22);

      ctx.fillStyle = isMasterBand ? '#ffd600' : '#e53935';
      ctx.fillRect(this.x - 2, this.y - 16, this.width + 4, 6);

      ctx.fillStyle = '#00e5ff';
      const eyeX = this.direction === 1 ? this.x + this.width - 14 : this.x + 6;
      ctx.fillRect(eyeX, this.y - 9, 8, 3);

      // 3. ARMA: Katana de Sombras reemplaza a la katana plateada estándar
      const isShadowKatana = this.equipment.arma === 'katana_sombra';
      ctx.strokeStyle = isShadowKatana ? '#e040fb' : '#eceff1';
      ctx.lineWidth = 4;
      if (isShadowKatana) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#e040fb';
      }
      ctx.beginPath();
      ctx.moveTo(this.x + (this.direction === 1 ? 4 : this.width - 4), this.y - 10);
      ctx.lineTo(this.x + (this.direction === 1 ? this.width - 4 : 4), this.y + this.height - 10);
      ctx.stroke();
      ctx.shadowBlur = 0;

      if (this.dashPhase > 0) {
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 5;
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00e5ff';
        ctx.beginPath();
        ctx.moveTo(this.x - 15, this.y + this.height / 2);
        ctx.lineTo(this.x + this.width + 15, this.y + this.height / 2 - 12);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }

    ctx.restore();
    this.projectiles.forEach(p => p.draw(ctx));
  }
}