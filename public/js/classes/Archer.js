// public/js/classes/Archer.js

class Archer extends Character {
  constructor(config = {}) {
    super({
      color: '#2e7d32',
      ...config
    });
    this.className = 'archer';
    this.projectiles = [];
    this.specialArrow = null;
    this.canAttack = true;
    this.attackCooldown = 650;
  }

  reset() {
    super.reset();
    this.projectiles = [];
    this.specialArrow = null;
    this.canAttack = true;
  }

  spawnArrow(x, y, dir, visualId = null) {
    this.projectiles.push(new ArrowProjectile(x, y, dir, this.attack, visualId || this.equipment.arma));
  }

  spawnSpecialArrow(x, y, dir, damage, visualId = null) {
    this.specialArrow = new ArcherBigArrow(x, y, dir, damage, visualId || this.equipment.arma);
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

          // Flecha básica
          if (this.isKeyPressed(keys, this.controls.attack) && this.canAttack) {
            const spawnX = this.direction === 1 ? this.x + this.width : this.x;
            const spawnY = this.y + (this.height * 0.42);
            this.spawnArrow(spawnX, spawnY, this.direction);
            callbacks.onSound?.('archerBasic');
            callbacks.onShoot?.({ type: 'archerShoot', x: spawnX, y: spawnY, dir: this.direction, visualId: this.equipment.arma });
            this.canAttack = false;
            setTimeout(() => { this.canAttack = true; }, this.attackCooldown);
          }

          // Flecha Gigante Especial
          if (this.isKeyPressed(keys, this.controls.special) && this.mana >= this.maxMana) {
            this.mana = 0;
            this.updateManaBar();
            const spawnX = this.direction === 1 ? this.x + this.width : this.x;
            const spawnY = this.y + (this.height / 2);
            const specialDamage = Math.round((opponent ? opponent.maxHp * 0.35 : 175) + (this.attack * 2));
            this.spawnSpecialArrow(spawnX, spawnY, this.direction, specialDamage);
            callbacks.onSound?.('archerSpecial');
            callbacks.onSpecial?.({ type: 'archerSpecial', x: spawnX, y: spawnY, dir: this.direction, damage: specialDamage, visualId: this.equipment.arma });
          }
        }
      }

      this.applyPhysics(canvas.height);
    } else {
      this.interpolatePosition();
    }

    // Colisión flechas básicas
    this.projectiles.forEach(p => {
      p.update(canvas.width);
      if (p.active && opponent && checkRectCollision(p.getHitbox(), opponent)) {
        if (isLocal && roundActive) {
          opponent.applyDamage(p.damage);
          callbacks.onDamage?.(p.damage);
        }
        p.active = false;
      }
    });
    this.projectiles = this.projectiles.filter(p => p.active);

    // Colisión flecha gigante
    if (this.specialArrow) {
      this.specialArrow.update(canvas.width);
      if (this.specialArrow.active && !this.specialArrow.hasDealtDamage && opponent) {
        if (checkRectCollision(this.specialArrow.getHitbox(), opponent)) {
          if (isLocal && roundActive) {
            opponent.applyDamage(this.specialArrow.damage);
            callbacks.onDamage?.(this.specialArrow.damage);
            this.specialArrow.hasDealtDamage = true;
          }
          this.specialArrow.active = false;
        }
      }
      if (!this.specialArrow.active) this.specialArrow = null;
    }
  }

  draw(ctx, canvasWidth, isEnemyView = false) {
    ctx.save();
    const visible = this.drawBase(ctx, isEnemyView);

    if (visible) {
      // 1. ACCESORIO: Carcaj Dorado en la espalda
      if (this.equipment.accesorio === 'carcaj_dorado') {
        const quiverX = this.direction === 1 ? this.x - 9 : this.x + this.width;
        ctx.fillStyle = '#ffb300';
        ctx.fillRect(quiverX, this.y + 12, 9, 34);
        ctx.fillStyle = '#fff59d';
        ctx.fillRect(quiverX + 1, this.y + 6, 7, 6);
      }

      // 2. SOMBRERO: Sombrero del Cazador reemplaza al gorro verde común
      const isHunterHat = this.equipment.sombrero === 'sombrero_cazador';
      ctx.fillStyle = isHunterHat ? '#004d40' : '#1b5e20';
      ctx.fillRect(this.x - 4, this.y - 8, this.width + 8, 8);

      ctx.beginPath();
      ctx.moveTo(this.x - 4, this.y - 8);
      ctx.lineTo(this.x + this.width + 4, this.y - 8);
      ctx.lineTo(this.x + (this.width / 2), this.y - (isHunterHat ? 27 : 24));
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = isHunterHat ? '#ffd600' : '#b71c1c';
      const featherX = this.direction === 1 ? this.x + 4 : this.x + this.width - 8;
      ctx.beginPath();
      ctx.moveTo(featherX, this.y - 8);
      ctx.lineTo(featherX - (this.direction * 6), this.y - 26);
      ctx.lineTo(featherX + (this.direction * 4), this.y - 8);
      ctx.closePath();
      ctx.fill();

      // 3. ARMA: Arco Élfico reemplaza al arco de madera marrón
      const isElvenBow = this.equipment.arma === 'arco_elfico';
      ctx.strokeStyle = isElvenBow ? '#00e676' : '#8b5a2b';
      ctx.lineWidth = isElvenBow ? 4 : 3;
      if (isElvenBow) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00e676';
      }
      ctx.beginPath();
      const bowX = this.direction === 1 ? this.x + this.width + 5 : this.x - 5;
      ctx.arc(bowX, this.y + (this.height / 2), 22, -Math.PI / 2, Math.PI / 2, this.direction === -1);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    ctx.restore();
    this.projectiles.forEach(p => p.draw(ctx));
    if (this.specialArrow) this.specialArrow.draw(ctx);
  }
}