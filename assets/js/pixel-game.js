/**
 * Pixel Art Academic Office — Interactive Homepage
 *
 * Follows Star-Office-UI's asset pipeline:
 *   1. Pre-made pixel-art images (generated via Gemini, stored as PNG)
 *   2. Loaded in Phaser preload() with progress bar
 *   3. Layout config defines positions / depths / scales
 *   4. Phaser animation system for avatar & ambient FX
 *   5. Interactive click-to-navigate objects + click-to-cycle decorations
 *   6. Mobile fallback to static card grid
 */
(function () {
  'use strict';

  // ============================================================
  //  LAYOUT CONFIG  (mirrors Star-Office-UI layout.js)
  // ============================================================
  var W = 640, H = 360;
  var FONT = '"Press Start 2P", monospace';
  var SPRITE_PATH = '/assets/sprites/';

  // Room landmarks: wall/floor line ~y=135, pillar ~x=205,
  // right wall ~x=395, counter bottom-right ~x=455 y=235+.
  // Floor items origin=(0.5,1) so y = bottom edge. Keep y>=200 to be grounded.
  var NAV_ITEMS = [
    { id: 'bookshelf',  label: 'Publications', url: '/publications/',
      x: 50,  y: 240, scale: 0.75, floor: true },      // left wall, grounded on floor
    { id: 'chalkboard', label: 'Teaching',      url: '/teaching/',
      x: 360, y: 90,  scale: 0.55, floor: false },     // upper wall, right of window
    { id: 'podium',     label: 'Talks',         url: '/talks/',
      x: 140, y: 280, scale: 0.65, floor: true },      // left room open floor
    { id: 'desk',       label: 'Blog',          url: '/year-archive/',
      x: 390, y: 290, scale: 0.55, floor: true },      // right room floor, clear of counter
    { id: 'easel',      label: 'Portfolio',      url: '/portfolio/',
      x: 300, y: 240, scale: 0.7,  floor: true },      // center floor, right of pillar
    { id: 'cabinet',    label: 'CV',             url: '/cv/',
      x: 545, y: 235, scale: 0.7,  floor: true },      // right side, grounded on floor
  ];

  var DECOS = {
    plant1: { x: 105, y: 250, scale: 0.5,  depth: 250 },  // left floor near bookshelf
    plant2: { x: 480, y: 205, scale: 0.38, depth: 50 },    // right floor area
    cat:    { x: 220, y: 315, scale: 0.6,  depth: 315 },   // center-left floor
  };

  var THOUGHTS = [
    'Hmm, interesting...', 'Need more coffee...', 'Almost done!',
    'Where are my notes?', 'Great idea!', 'Time for a break?',
    'One more experiment...', 'Deadline approaching...',
    'I should read that paper...', 'Office hours soon...',
  ];

  var DEPTH = { bg: 0, wall: 10, furniture: 100, character: 200, ui: 500, overlay: 900 };

  // ============================================================
  //  PHASER SCENE
  // ============================================================
  var PixelOffice = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function () { Phaser.Scene.call(this, { key: 'PixelOffice' }); },

    // ---------- PRELOAD (Star-Office-UI pipeline: real assets) ----------
    preload: function () {
      // Progress bar
      var pw = 180, ph = 10;
      var bx = W / 2 - pw / 2, by = H / 2 + 6;
      var bg = this.add.rectangle(W / 2, by + ph / 2, pw + 4, ph + 4, 0x222233)
        .setStrokeStyle(1, 0x5b6ee1);
      var bar = this.add.rectangle(bx, by, 0, ph, 0xffd700).setOrigin(0, 0);
      var label = this.add.text(W / 2, H / 2 - 14, 'Loading Office...', {
        fontFamily: FONT, fontSize: '8px', fill: '#ccc',
      }).setOrigin(0.5);

      this.load.on('progress', function (v) { bar.width = pw * v; });
      this.load.on('complete', function () { bg.destroy(); bar.destroy(); label.destroy(); });

      // Room background
      this.load.image('room_bg', SPRITE_PATH + 'room_bg.png');
      // Nav-object sprites
      NAV_ITEMS.forEach(function (it) {
        this.load.image(it.id, SPRITE_PATH + it.id + '.png');
      }, this);
      // Decorations
      this.load.image('plant', SPRITE_PATH + 'plant.png');
      this.load.image('cat',   SPRITE_PATH + 'cat.png');
      // Avatar frames
      for (var i = 0; i < 4; i++)
        this.load.image('avatar_' + i, SPRITE_PATH + 'avatar_' + i + '.png');
    },

    // ---------- CREATE ----------
    create: function () {
      this.createAnims();
      this.placeBackground();
      this.placeNavObjects();
      this.placeDecorations();
      this.placeAvatar();
      this.placeAmbient();
      this.placeUI();
      // State
      this.walkTarget = null;
      this.navigating = false;
      this.nextWander = this.time.now + 2500;
      this.isWalking = false;
      this.bubble = null;
      this.avatarFrame = 0;
      this.frameTimer = 0;
    },

    // ---------- animations ----------
    createAnims: function () {
      // Avatar idle: frames 0-1 (gentle bob handled by texture swap)
      // Avatar walk: frames 2-3
      // (Using manual frame swap in update — simpler with separate textures)
    },

    // ---------- background ----------
    placeBackground: function () {
      this.add.image(0, 0, 'room_bg').setOrigin(0, 0).setDepth(DEPTH.bg);
    },

    // ---------- nav objects (interactive furniture) ----------
    placeNavObjects: function () {
      var self = this;
      this.navSprites = [];

      NAV_ITEMS.forEach(function (item) {
        var isFloor = item.floor;
        var originY = isFloor ? 1 : 0.5;
        var depth = isFloor ? item.y : DEPTH.wall;

        var sprite = self.add.image(item.x, item.y, item.id)
          .setOrigin(0.5, originY)
          .setScale(item.scale || 1)
          .setDepth(depth);

        // Hit zone (generous)
        var bw = sprite.displayWidth + 20;
        var bh = sprite.displayHeight + 16;
        var zy = isFloor ? item.y - sprite.displayHeight / 2 : item.y;
        var zone = self.add.zone(item.x, zy, bw, bh)
          .setInteractive({ useHandCursor: true });

        // Label
        var ly = isFloor ? item.y - sprite.displayHeight - 8 : item.y - sprite.displayHeight / 2 - 12;
        var label = self.add.text(item.x, ly, item.label, {
          fontFamily: FONT, fontSize: '7px',
          fill: '#fff', stroke: '#000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(DEPTH.ui).setAlpha(0);

        // Glow rectangle
        var glow = self.add.rectangle(
          item.x, isFloor ? item.y - sprite.displayHeight / 2 : item.y,
          sprite.displayWidth + 6, sprite.displayHeight + 6,
          0xffd700, 0
        ).setDepth(depth - 1);

        zone.on('pointerover', function () {
          sprite.setTint(0xffffcc);
          self.tweens.add({ targets: label, alpha: 1, duration: 100 });
          self.tweens.add({ targets: glow, alpha: 0.18, duration: 100 });
          self.tweens.add({ targets: sprite, scaleX: (item.scale || 1) * 1.06,
            scaleY: (item.scale || 1) * 1.06, duration: 80 });
        });
        zone.on('pointerout', function () {
          sprite.clearTint();
          self.tweens.add({ targets: label, alpha: 0, duration: 100 });
          self.tweens.add({ targets: glow, alpha: 0, duration: 100 });
          self.tweens.add({ targets: sprite, scaleX: item.scale || 1,
            scaleY: item.scale || 1, duration: 80 });
        });
        zone.on('pointerdown', function () { self.navigateTo(item.url); });

        self.navSprites.push({ sprite: sprite, item: item });
      });
    },

    // ---------- decorations (interactive, like Star-Office-UI click-to-cycle) ----------
    placeDecorations: function () {
      var self = this;
      var d = DECOS;

      // Plant 1 — click to wiggle
      this.plant1 = this.add.image(d.plant1.x, d.plant1.y, 'plant')
        .setOrigin(0.5, 1).setScale(d.plant1.scale).setDepth(d.plant1.depth);
      this.plant1.setInteractive({ useHandCursor: true });
      this.plant1.on('pointerdown', function () {
        self.tweens.add({
          targets: self.plant1, angle: { from: -8, to: 8 },
          duration: 80, yoyo: true, repeat: 2,
          onComplete: function () { self.plant1.angle = 0; }
        });
      });

      // Plant 2 (windowsill)
      this.plant2 = this.add.image(d.plant2.x, d.plant2.y, 'plant')
        .setOrigin(0.5, 1).setScale(d.plant2.scale).setDepth(d.plant2.depth);

      // Cat — click to meow + flip
      this.cat = this.add.image(d.cat.x, d.cat.y, 'cat')
        .setOrigin(0.5, 1).setScale(d.cat.scale).setDepth(d.cat.depth);
      this.cat.setInteractive({ useHandCursor: true });
      this.cat.on('pointerdown', function () {
        self.cat.setFlipX(!self.cat.flipX);
        self.showBubbleAt(self.cat.x, self.cat.y - self.cat.displayHeight - 4, 'Meow!');
        self.tweens.add({
          targets: self.cat, y: d.cat.y - 8, duration: 120,
          yoyo: true, ease: 'Bounce.easeOut',
        });
      });
    },

    // ---------- avatar ----------
    placeAvatar: function () {
      this.avatar = this.add.image(W / 2, 275, 'avatar_0')
        .setOrigin(0.5, 1).setDepth(265);
    },

    // ---------- ambient effects ----------
    placeAmbient: function () {
      var self = this;
      // Dust motes in window light
      this.dust = [];
      for (var i = 0; i < 10; i++) {
        var px = 200 + Math.random() * 240;
        var py = 140 + Math.random() * 160;
        var dot = this.add.rectangle(px, py, 1, 1, 0xfff8dc, 0.25 + Math.random() * 0.25)
          .setDepth(DEPTH.wall + 5);
        this.dust.push({
          obj: dot, bx: px, by: py,
          spd: 0.15 + Math.random() * 0.25,
          ph: Math.random() * Math.PI * 2,
        });
      }

      // Clock on wall (graphics)
      this.clockGfx = this.add.graphics().setDepth(DEPTH.wall + 2);
      this.clockAngle = 0;
      this.drawClock(0);
      this.time.addEvent({
        delay: 1000, loop: true,
        callback: function () {
          self.clockAngle = (self.clockAngle + 6) % 360;
          self.drawClock(self.clockAngle);
        },
      });
    },

    drawClock: function (angle) {
      var g = this.clockGfx; g.clear();
      var cx = 520, cy = 82;
      g.fillStyle(0x7a5a2e); g.fillCircle(cx, cy, 11);
      g.fillStyle(0xfaf8f0); g.fillCircle(cx, cy, 9);
      g.fillStyle(0x333333);
      for (var i = 0; i < 12; i++) {
        var a = i * 30 * Math.PI / 180;
        g.fillRect(cx + Math.cos(a) * 7 - 0.5, cy + Math.sin(a) * 7 - 0.5, 1, 1);
      }
      var ha = (angle / 12) * Math.PI / 180;
      g.lineStyle(2, 0x333333);
      g.lineBetween(cx, cy, cx + Math.cos(ha - Math.PI / 2) * 5, cy + Math.sin(ha - Math.PI / 2) * 5);
      var ma = angle * Math.PI / 180;
      g.lineStyle(1, 0x555555);
      g.lineBetween(cx, cy, cx + Math.cos(ma - Math.PI / 2) * 7, cy + Math.sin(ma - Math.PI / 2) * 7);
      g.fillStyle(0x333333); g.fillCircle(cx, cy, 1);
    },

    // ---------- UI ----------
    placeUI: function () {
      this.add.rectangle(W / 2, H - 16, 250, 22, 0x1a1a2e, 0.82)
        .setDepth(DEPTH.overlay).setStrokeStyle(1, 0x5b6ee1, 0.6);
      this.add.text(W / 2, H - 16, '\u2726 My Academic Office \u2726', {
        fontFamily: FONT, fontSize: '7px',
        fill: '#ffd700', stroke: '#1a1a2e', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(DEPTH.overlay + 1);
      this.add.text(W / 2, H - 4, 'click objects to explore \u00b7 click decorations to interact', {
        fontFamily: FONT, fontSize: '5px', fill: '#888',
      }).setOrigin(0.5, 1).setDepth(DEPTH.overlay + 1);
    },

    // ---------- speech bubbles ----------
    showBubble: function (text) {
      this.showBubbleAt(this.avatar.x, this.avatar.y - this.avatar.displayHeight - 8, text);
    },
    showBubbleAt: function (bx, by, text) {
      if (this.bubble) { this.bubble.destroy(); this.bubble = null; }
      var tw = text.length * 5 + 16;
      var bg = this.add.rectangle(bx, by, tw, 14, 0xffffff, 0.94)
        .setStrokeStyle(1, 0x333333).setDepth(1000);
      var tail = this.add.triangle(bx, by + 9, 0, 0, 8, 0, 4, 5, 0xffffff, 0.94)
        .setDepth(1000);
      var txt = this.add.text(bx, by, text, {
        fontFamily: FONT, fontSize: '5px', fill: '#333',
      }).setOrigin(0.5).setDepth(1001);
      this.bubble = this.add.container(0, 0, [bg, tail, txt]).setDepth(1000);
      var self = this;
      this.time.delayedCall(2500, function () {
        if (self.bubble) { self.bubble.destroy(); self.bubble = null; }
      });
    },

    // ---------- UPDATE LOOP ----------
    update: function (time, delta) {
      if (this.navigating) return;

      // Avatar frame cycling
      this.frameTimer += delta;
      if (this.frameTimer > 220) {
        this.frameTimer = 0;
        if (this.isWalking) {
          this.avatarFrame = this.avatarFrame === 2 ? 3 : 2;
        } else {
          this.avatarFrame = this.avatarFrame === 0 ? 1 : 0;
        }
        this.avatar.setTexture('avatar_' + this.avatarFrame);
      }

      // Movement
      if (this.walkTarget) {
        var dx = this.walkTarget.x - this.avatar.x;
        var dist = Math.abs(dx);
        if (dist > 3) {
          if (!this.isWalking) this.isWalking = true;
          this.avatar.x += Math.sign(dx) * 55 * (delta / 1000);
          this.avatar.y = 275 + Math.sin(time / 200) * 0.8;
          this.avatar.setFlipX(dx < 0);
          this.avatar.setDepth(Math.round(this.avatar.y));
        } else {
          this.isWalking = false;
          this.avatar.y = 275;
          this.walkTarget = null;
          this.nextWander = time + 3000 + Math.random() * 5000;
          if (Math.random() < 0.4) {
            this.showBubble(Phaser.Utils.Array.GetRandom(THOUGHTS));
          }
        }
      } else if (time > this.nextWander) {
        var target = Phaser.Utils.Array.GetRandom(this.navSprites);
        this.walkTarget = { x: target.item.x + Phaser.Math.Between(-15, 15) };
      }

      // Dust motes
      for (var i = 0; i < this.dust.length; i++) {
        var p = this.dust[i];
        p.obj.x = p.bx + Math.sin(time / 2000 + p.ph) * 8;
        p.obj.y = p.by - (time * p.spd * 0.01) % 60;
        if (p.obj.y < 140) p.obj.y += 160;
        p.obj.alpha = 0.12 + Math.sin(time / 1000 + p.ph) * 0.12;
      }
    },

    // ---------- navigation ----------
    navigateTo: function (url) {
      if (this.navigating) return;
      this.navigating = true;
      var flash = this.add.rectangle(W / 2, H / 2, W, H, 0xffffff, 0).setDepth(10000);
      this.tweens.add({
        targets: flash, alpha: 1, duration: 280, ease: 'Power2',
        onComplete: function () { window.location.href = url; },
      });
    },
  });

  // ============================================================
  //  INITIALIZATION
  // ============================================================
  function isMobile() { return window.innerWidth < 768; }

  function init() {
    var wrapper = document.getElementById('pixel-game-wrapper');
    var fallback = document.getElementById('pixel-mobile-fallback');
    if (!wrapper) return;

    if (isMobile()) {
      wrapper.style.display = 'none';
      if (fallback) fallback.style.display = 'block';
      return;
    }
    wrapper.style.display = 'block';
    if (fallback) fallback.style.display = 'none';

    new Phaser.Game({
      type: Phaser.AUTO, width: W, height: H,
      parent: 'pixel-game-container',
      pixelArt: true,
      backgroundColor: '#1a1a2e',
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [PixelOffice],
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
