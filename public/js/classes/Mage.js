// public/js/classes/Mage.js

class Mage extends Character {
  constructor(config = {}) {
    super({
      color: '#4488ff',
      ...config
    });
    this.className = 'mage';
    this.projectiles = [];
    this.canAttack = true;
    this.attackCooldown = 500;

    // Dash especial
    this.isDashing = false;
    this.dashSpeed = 22;
    this.dashTargetX = 0;
    this.hoverOffset = 0;
  }

  reset() {
    super.reset();
    this.projectiles = [];
    this.canAttack = true;
    this.isDashing = false;
  }

  spawnProjectile(x, y, dir, visualId = null) {
    this.projectiles.push(new MageProjectile(x, y, dir, this.attack, visualId || this.equipment.arma));
  }

  triggerDash(dir, canvasWidth) {
    this.isDashing = true;
    const dashDistance = (canvasWidth / 2) * dir;
    this.dashTargetX = Math.max(0, Math.min(canvasWidth - this.width, this.x + dashDistance));
  }

  update(opponent, env) {
    const { keys, canvas, roundActive, isLocal = true, callbacks = {} } = env;
    this.regenMana();
    this.updateInvisibility();
    this.hoverOffset = Math.sin(Date.now() / 200) * 4;

    if (isLocal) {
      if (roundActive && this.controls) {
        const pressingDefense = this.isKeyPressed(keys, this.controls.defend);
        if (pressingDefense && !this.isDefending) {
          callbacks.onSound?.('defense');
        }
        this.isDefending = pressingDefense;

        if (!this.isDefending && !this.isDashing) {
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

          // Disparo básico
          if (this.isKeyPressed(keys, this.controls.attack) && this.canAttack) {
            const spawnX = this.direction === 1 ? this.x + this.width : this.x;
            const spawnY = this.y + (this.height * 0.4);
            this.spawnProjectile(spawnX, spawnY, this.direction);
            callbacks.onSound?.('mageBasic');
            callbacks.onShoot?.({ type: 'mageShoot', x: spawnX, y: spawnY, dir: this.direction, visualId: this.equipment.arma });
            this.canAttack = false;
            setTimeout(() => { this.canAttack = true; }, this.attackCooldown);
          }

          // Dash Especial
          if (this.isKeyPressed(keys, this.controls.special) && this.mana >= this.maxMana) {
            this.mana = 0;
            this.updateManaBar();
            this.triggerDash(this.direction, canvas.width);
            callbacks.onSound?.('mageSpecial');
            callbacks.onSpecial?.({ type: 'mageDash', dir: this.direction });
          }
        }

        // Movimiento durante el Dash
        if (this.isDashing) {
          this.x += this.dashSpeed * this.direction;
          this.x = Math.max(0, Math.min(canvas.width - this.width, this.x));

          if (opponent && checkRectCollision(this, opponent)) {
            const dashDamage = Math.round(this.attack * 8); // Con ataque base 15 -> 120 de daño
            opponent.applyDamage(dashDamage);
            callbacks.onDamage?.(dashDamage);
            this.isDashing = false;
          }

          if ((this.direction === 1 && this.x >= this.dashTargetX) ||
              (this.direction === -1 && this.x <= this.dashTargetX) ||
              this.x <= 0 || this.x + this.width >= canvas.width) {
            this.isDashing = false;
          }
        }
      }

      // El mago flota ligeramente sobre el piso (offset 12px)
      this.applyPhysics(canvas.height, 12);
    } else {
      this.interpolatePosition();
    }

    // Proyectiles
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
    ctx.save();
    const drawY = this.onGround ? this.y + this.hoverOffset : this.y;
    const savedY = this.y;
    if (this.onGround) this.y = drawY;

    const visible = this.drawBase(ctx, isEnemyView);
    this.y = savedY;

    if (visible) {
      // 1. SOMBRERO: Sombrero de Merlín reemplaza al sombrero azul estándar
      const isMerlin = this.equipment.sombrero === 'sombrero_merlin';
      ctx.fillStyle = isMerlin ? '#4a148c' : '#0d47a1';
      ctx.fillRect(this.x - 8, drawY - 4, this.width + 16, 6);

      ctx.fillStyle = isMerlin ? '#ffea00' : '#ffd54f';
      ctx.fillRect(this.x + 2, drawY - 10, this.width - 4, 6);

      ctx.fillStyle = isMerlin ? '#7b1fa2' : '#1565c0';
      ctx.beginPath();
      ctx.moveTo(this.x, drawY - 10);
      ctx.lineTo(this.x + this.width, drawY - 10);
      ctx.lineTo(this.x + (this.width / 2), drawY - (isMerlin ? 40 : 32));
      ctx.closePath();
      ctx.fill();

      // 2. ARMA: Orbe Arcano flotante
      if (this.equipment.arma === 'orbe_arcano') {
        const orbX = this.direction === 1 ? this.x + this.width + 10 : this.x - 10;
        ctx.fillStyle = '#e040fb';
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#e040fb';
        ctx.beginPath();
        ctx.arc(orbX, drawY + 25, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // 3. ACCESORIO: Aura Astral alrededor del mago
      if (this.equipment.accesorio === 'aura_astral') {
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 2;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00e5ff';
        ctx.strokeRect(this.x - 5, drawY - 5, this.width + 10, this.height + 10);
        ctx.shadowBlur = 0;
      }

      // 4. ESTELA DEL DASH
      if (this.isDashing) {
        ctx.fillStyle = 'rgba(0, 229, 255, 0.75)';
        ctx.fillRect(this.x - (18 * this.direction), drawY, this.width + 18, this.height);
      }
    }

    ctx.restore();
    this.projectiles.forEach(p => p.draw(ctx));
  }
}