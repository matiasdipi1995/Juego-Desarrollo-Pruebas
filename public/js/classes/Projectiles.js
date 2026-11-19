// public/js/classes/Projectiles.js

function checkRectCollision(r1, r2) {
  return r1.x < r2.x + r2.width && r1.x + r1.width > r2.x &&
         r1.y < r2.y + r2.height && r1.y + r1.height > r2.y;
}

function checkCircleRectCollision(c, r) {
  const cx = Math.max(r.x, Math.min(c.x, r.x + r.width));
  const cy = Math.max(r.y, Math.min(c.y, r.y + r.height));
  const dx = c.x - cx;
  const dy = c.y - cy;
  return (dx * dx + dy * dy) < (c.radius * c.radius);
}

// 1. Proyectil básico del Mago
class MageProjectile {
  constructor(x, y, dir, damage = 15, visualId = null) {
    this.x = x;
    this.y = y;
    this.dir = dir;
    this.radius = 10;
    this.speed = 8 * dir;
    this.damage = damage;
    this.visualId = visualId;
    this.active = true;
  }

  update(canvasWidth) {
    this.x += this.speed;
    if (this.x < -20 || this.x > canvasWidth + 20) this.active = false;
  }

  draw(ctx) {
    if (!this.active) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    const color = this.visualId === 'orbe_arcano' ? '#e040fb' : '#00e5ff';
    ctx.fillStyle = color;
    ctx.shadowBlur = 12;
    ctx.shadowColor = color;
    ctx.fill();
    ctx.closePath();
    ctx.restore();
  }
}

// 2. Rayo Especial del Guerrero
class WarriorBeam {
  constructor(x, y, dir, damage = 100, visualId = null) {
    this.x = x;
    this.y = y;
    this.dir = dir;
    this.height = 60;
    this.damage = damage;
    this.visualId = visualId;
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

  getHitbox(canvasWidth) {
    return {
      x: this.dir === 1 ? this.x : 0,
      y: this.y - this.height / 2,
      width: this.dir === 1 ? (canvasWidth - this.x) : this.x,
      height: this.height
    };
  }

  draw(ctx, canvasWidth) {
    if (!this.active) return;
    ctx.save();
    const isFire = this.visualId === 'espada_fuego';
    ctx.fillStyle = isFire ? '#ff3d00' : '#ff9900';
    ctx.shadowBlur = 20;
    ctx.shadowColor = isFire ? '#ffea00' : '#ff3300';

    const box = this.getHitbox(canvasWidth);
    ctx.fillRect(box.x, box.y, box.width, box.height);
    ctx.restore();
  }
}

// 3. Flecha Básica del Arquero
class ArrowProjectile {
  constructor(x, y, dir, damage = 35, visualId = null) {
    this.x = x;
    this.y = y;
    this.dir = dir;
    this.speed = 11 * dir;
    this.damage = damage;
    this.visualId = visualId;
    this.width = 26;
    this.height = 6;
    this.active = true;
  }

  update(canvasWidth) {
    this.x += this.speed;
    if (this.x < -50 || this.x > canvasWidth + 50) this.active = false;
  }

  getHitbox() {
    return { x: this.x, y: this.y - this.height / 2, width: this.width, height: this.height };
  }

  draw(ctx) {
    if (!this.active) return;
    ctx.save();
    ctx.fillStyle = this.visualId === 'arco_elfico' ? '#a5d6a7' : '#8d6e63';
    ctx.fillRect(this.x, this.y - this.height / 2, this.width, this.height);

    ctx.fillStyle = this.visualId === 'arco_elfico' ? '#00e676' : '#cfd8dc';
    const tipX = this.dir === 1 ? this.x + this.width : this.x;
    ctx.beginPath();
    ctx.moveTo(tipX, this.y - this.height);
    ctx.lineTo(tipX + (10 * this.dir), this.y);
    ctx.lineTo(tipX, this.y + this.height);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

// 4. Flecha Gigante Especial del Arquero
class ArcherBigArrow {
  constructor(x, y, dir, damage = 150, visualId = null) {
    this.x = x;
    this.y = y;
    this.dir = dir;
    this.speed = 16 * dir;
    this.damage = damage;
    this.visualId = visualId;
    this.width = 75;
    this.height = 20;
    this.active = true;
    this.hasDealtDamage = false;
  }

  update(canvasWidth) {
    this.x += this.speed;
    if (this.x < -100 || this.x > canvasWidth + 100) this.active = false;
  }

  getHitbox() {
    return { x: this.x, y: this.y - this.height / 2, width: this.width, height: this.height };
  }

  draw(ctx) {
    if (!this.active) return;
    ctx.save();
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#ff9800';
    ctx.fillStyle = '#ff5722';
    ctx.fillRect(this.x, this.y - this.height / 2, this.width, this.height);

    ctx.fillStyle = '#ffe082';
    const tipX = this.dir === 1 ? this.x + this.width : this.x;
    ctx.beginPath();
    ctx.moveTo(tipX, this.y - this.height * 1.4);
    ctx.lineTo(tipX + (22 * this.dir), this.y);
    ctx.lineTo(tipX, this.y + this.height * 1.4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

// 5. Shuriken Básico del Ninja
class ShurikenProjectile {
  constructor(x, y, dir, damage = 25, visualId = null) {
    this.x = x;
    this.y = y;
    this.dir = dir;
    this.radius = 9;
    this.speed = 13 * dir;
    this.damage = damage;
    this.visualId = visualId;
    this.angle = 0;
    this.active = true;
  }

  update(canvasWidth) {
    this.x += this.speed;
    this.angle += 0.45 * this.dir; // Gira en el aire
    if (this.x < -30 || this.x > canvasWidth + 30) this.active = false;
  }

  draw(ctx) {
    if (!this.active) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    ctx.fillStyle = this.visualId === 'katana_sombra' ? '#9c27b0' : '#cfd8dc';
    // Estrella ninja de 4 puntas
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      ctx.lineTo(Math.cos(a) * this.radius, Math.sin(a) * this.radius);
      ctx.lineTo(Math.cos(a + Math.PI / 4) * 3, Math.sin(a + Math.PI / 4) * 3);
    }
    ctx.closePath();
    ctx.fill();

    // Agujero central
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}