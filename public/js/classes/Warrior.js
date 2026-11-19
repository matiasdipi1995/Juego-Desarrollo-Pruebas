// public/js/classes/Warrior.js

class Warrior extends Character {
  constructor(config = {}) {
    super({
      color: '#ff4444',
      ...config
    });
    this.className = 'warrior';
    this.isAttacking = false;
    this.hasDealtDamage = false;
    this.canAttack = true;
    this.attackCooldown = 500;

    // Ataque especial (Carga 2s -> Rayo)
    this.chargeTime = 0;
    this.isCharging = false;
    this.activeBeam = null;
  }

  reset() {
    super.reset();
    this.isAttacking = false;
    this.hasDealtDamage = false;
    this.canAttack = true;
    this.chargeTime = 0;
    this.isCharging = false;
    this.activeBeam = null;
  }

  spawnBeam(x, y, dir, visualId = null) {
    const beamDamage = Math.round(this.attack * 5); // Con ataque base 20 -> 100 de daño
    this.activeBeam = new WarriorBeam(x, y, dir, beamDamage, visualId || this.equipment.arma);
  }

  update(opponent, env) {
    const { keys, canvas, roundActive, isLocal = true, callbacks = {} } = env;
    this.regenMana();
    this.updateInvisibility();

    if (isLocal) {
      if (roundActive && this.controls) {
        const pressingDefense = this.isKeyPressed(keys, this.controls.defend);
        if (pressingDefense && !this.isDefending) {
          callbacks.onSound?.('defense');
        }
        this.isDefending = pressingDefense;

        if (!this.isDefending) {
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

          // Ataque Especial (Carga de 2 segundos y dispara Rayo)
          if (this.isKeyPressed(keys, this.controls.special) && this.mana >= this.maxMana && !this.isCharging) {
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
              this.spawnBeam(spawnX, spawnY, this.direction);
              callbacks.onSound?.('warriorBeam');
              callbacks.onSpecial?.({ type: 'warriorBeam', x: spawnX, y: spawnY, dir: this.direction, visualId: this.equipment.arma });
              this.isCharging = false;
              this.chargeTime = 0;
            }
          }

          // Ataque Básico (Espadazo)
          if (this.isKeyPressed(keys, this.controls.attack) && !this.isAttacking && this.canAttack) {
            this.isAttacking = true;
            this.hasDealtDamage = false;
            this.canAttack = false;
            callbacks.onSound?.('warriorBasic');
            setTimeout(() => { this.isAttacking = false; }, 200);
            setTimeout(() => { this.canAttack = true; }, this.attackCooldown);
          }
        }

        // Hitbox de la espada
        if (this.isAttacking && !this.hasDealtDamage && opponent) {
          const swordLen = Math.round(this.width * 1.05);
          const swordBox = {
            x: this.direction === 1 ? this.x + this.width : this.x - swordLen,
            y: this.y + (this.height * 0.28),
            width: swordLen,
            height: 18
          };
          if (checkRectCollision(swordBox, opponent)) {
            opponent.applyDamage(this.attack);
            callbacks.onDamage?.(this.attack);
            this.hasDealtDamage = true;
          }
        }
      }

      this.applyPhysics(canvas.height);
    } else {
      this.interpolatePosition();
    }

    // Actualización y colisión del Rayo Especial
    if (this.activeBeam) {
      this.activeBeam.update();
      if (this.activeBeam.active && !this.activeBeam.hasDealtDamage && isLocal && roundActive && opponent) {
        const beamBox = this.activeBeam.getHitbox(canvas.width);
        if (checkRectCollision(beamBox, opponent)) {
          opponent.applyDamage(this.activeBeam.damage);
          callbacks.onDamage?.(this.activeBeam.damage);
          this.activeBeam.hasDealtDamage = true;
        }
      }
      if (!this.activeBeam.active) this.activeBeam = null;
    }
  }

  draw(ctx, canvasWidth, isEnemyView = false) {
    ctx.save();
    const visible = this.drawBase(ctx, isEnemyView);

    if (visible) {
      // 1. ACCESORIO: Capa Carmesí (reemplaza espalda descubierta)
      if (this.equipment.accesorio === 'capa_carmesi') {
        ctx.fillStyle = '#b71c1c';
        const capeX = this.direction === 1 ? this.x - 11 : this.x + this.width;
        ctx.fillRect(capeX, this.y + 6, 11, this.height - 12);
        ctx.fillStyle = '#ffd54f';
        ctx.fillRect(capeX, this.y + 6, 11, 4);
      }

      // 2. SOMBRERO / CASCO: Yelmo Dorado reemplaza al casco gris estándar
      const isGoldenHelm = this.equipment.sombrero === 'yelmo_dorado';
      ctx.fillStyle = isGoldenHelm ? '#ffb300' : '#78909c';
      ctx.fillRect(this.x - 4, this.y - 24, this.width + 8, 28);

      ctx.fillStyle = isGoldenHelm ? '#212121' : '#1a237e';
      const visorX = this.direction === 1 ? this.x + 10 : this.x + 2;
      ctx.fillRect(visorX, this.y - 12, this.width - 12, 8);

      ctx.fillStyle = isGoldenHelm ? '#ff1744' : '#b71c1c';
      ctx.fillRect(this.x + (this.width / 2) - 6, this.y - 36, 12, 12);

      // 3. ARMA: Espada de Fuego reemplaza a la espada estándar
      const isFireSword = this.equipment.arma === 'espada_fuego';
      if (this.isAttacking) {
        const swordLen = Math.round(this.width * 1.05);
        const swordX = this.direction === 1 ? this.x + this.width : this.x - swordLen;
        const swordY = this.y + (this.height * 0.28);

        if (isFireSword) {
          ctx.shadowBlur = 14;
          ctx.shadowColor = '#ff3d00';
          ctx.fillStyle = '#ff5722';
          ctx.fillRect(swordX, swordY, swordLen, 16);
          ctx.fillStyle = '#ffeb3b';
          ctx.fillRect(swordX + 4, swordY + 4, swordLen - 8, 8);
          ctx.shadowBlur = 0;
        } else {
          ctx.fillStyle = '#ffeb3b';
          ctx.fillRect(swordX, swordY, swordLen, 15);
        }
      } else if (isFireSword) {
        // Espada de fuego visible en reposo (también se ve en Tienda/Admin)
        const hiltX = this.direction === 1 ? this.x + this.width + 2 : this.x - 10;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ff3d00';
        ctx.fillStyle = '#ff5722';
        ctx.fillRect(hiltX, this.y + 12, 8, 42);
        ctx.fillStyle = '#ffeb3b';
        ctx.fillRect(hiltX + 2, this.y + 15, 4, 36);
        ctx.shadowBlur = 0;
      }

      // 4. EFECTO DE CARGA DEL RAYO
      if (this.isCharging) {
        ctx.fillStyle = this.chargeTime >= 1.5 ? '#ff1100' : '#ff9900';
        ctx.beginPath();
        ctx.arc(this.x + this.width / 2, this.y + this.height / 2, 18 + Math.random() * 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
    if (this.activeBeam && this.activeBeam.active) {
      this.activeBeam.draw(ctx, canvasWidth);
    }
  }
}