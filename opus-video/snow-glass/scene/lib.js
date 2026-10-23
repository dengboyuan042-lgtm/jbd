/* Snow Glass — shared scene library.
 *
 * Every frame is a pure function of t (seconds). No timers, no state carried
 * between frames, all randomness seeded — so any frame can be re-rendered on
 * its own, in any order, at any resolution.
 *
 * Runs in two places:
 *   browser  -> <script src="lib.js"> then SnowGlass.render('a', ctx, W, H, t)
 *   node     -> require('./lib.js') with a canvas factory from @napi-rs/canvas
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SnowGlass = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- utilities
  const TAU = Math.PI * 2;
  let makeCanvas = null;
  function setCanvasFactory(fn) { makeCanvas = fn; }
  function offscreen(w, h) {
    const c = makeCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
    c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    return c;
  }
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const clamp01 = (v) => clamp(v, 0, 1);
  const lerp = (a, b, p) => a + (b - a) * p;
  const mod = (a, m) => ((a % m) + m) % m;
  function smoothstep(x) { x = clamp01(x); return x * x * (3 - 2 * x); }
  function easeOutCubic(x) { x = clamp01(x); return 1 - Math.pow(1 - x, 3); }
  function easeInOutCubic(x) {
    x = clamp01(x);
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }
  function pulse(t, t0, t1) { return smoothstep((t - t0) / (t1 - t0)); }

  // closed-form spring: no dependence on the previous frame
  function spring(x, w = 16, z = 0.72) {
    if (x <= 0) return 0;
    const wd = w * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w * x) * (Math.cos(wd * x) + (z * w / wd) * Math.sin(wd * x));
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------- paths
  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.arcTo(x + w, y, x + w, y + rr, rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
    ctx.lineTo(x + rr, y + h);
    ctx.arcTo(x, y + h, x, y + h - rr, rr);
    ctx.lineTo(x, y + rr);
    ctx.arcTo(x, y, x + rr, y, rr);
    ctx.closePath();
  }

  function drawTracked(ctx, text, x, y, spacing, align) {
    const chars = Array.from(text);
    const widths = chars.map((c) => ctx.measureText(c).width);
    const total = widths.reduce((a, b) => a + b, 0) + spacing * Math.max(0, chars.length - 1);
    let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    for (let i = 0; i < chars.length; i++) {
      ctx.fillText(chars[i], cx, y);
      cx += widths[i] + spacing;
    }
    return total;
  }

  function drawSnowflake(ctx, cx, cy, r, lw) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      ctx.save();
      ctx.rotate((i * TAU) / 6);
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(0, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.52); ctx.lineTo(-r * 0.22, -r * 0.72);
      ctx.moveTo(0, -r * 0.52); ctx.lineTo(r * 0.22, -r * 0.72);
      ctx.moveTo(0, -r * 0.80); ctx.lineTo(-r * 0.16, -r * 0.94);
      ctx.moveTo(0, -r * 0.80); ctx.lineTo(r * 0.16, -r * 0.94);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- textures
  let noisePattern = null;
  function getNoise(ctx) {
    if (noisePattern) return noisePattern;
    const size = 180;
    const c = offscreen(size, size);
    const g = c.getContext('2d');
    const rnd = mulberry32(99173);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const v = rnd();
        g.fillStyle = v > 0.5
          ? `rgba(255,255,255,${(v - 0.5) * 0.9})`
          : `rgba(0,0,0,${(0.5 - v) * 0.8})`;
        g.fillRect(x, y, 1, 1);
      }
    }
    noisePattern = ctx.createPattern(c, 'repeat');
    return noisePattern;
  }

  // ---------------------------------------------------------------- snow
  // Three depths; the near layer is big and out of focus, the far layer small.
  const SNOW = { built: false, layers: [] };
  function buildSnow(W, H) {
    const rnd = mulberry32(20260124);
    const mk = (n, rmin, rmax, smin, smax, amin, amax, blur) => {
      const arr = [];
      for (let i = 0; i < n; i++) {
        arr.push({
          x0: rnd() * W,
          y0: rnd() * H,
          r: lerp(rmin, rmax, Math.pow(rnd(), 1.7)),
          v: lerp(smin, smax, rnd()),
          a: lerp(amin, amax, rnd()),
          ph: rnd() * TAU,
          sway: lerp(5, 24, rnd()),
          freq: lerp(0.3, 0.85, rnd()),
          blur,
        });
      }
      return arr;
    };
    SNOW.far = mk(190, 0.9, 2.6, 18, 34, 0.16, 0.38, 1.0);
    SNOW.mid = mk(90, 2.2, 4.8, 40, 70, 0.34, 0.62, 0);
    SNOW.near = mk(16, 10, 26, 80, 150, 0.10, 0.22, 6.0);
    SNOW.built = true;
  }

  function drawSnowLayer(ctx, W, H, t, layer, windX, scale) {
    // out-of-focus flakes are painted as soft radial dots instead of a canvas
    // blur filter: same look, a fraction of the cost per frame.
    for (const f of layer) {
      const soft = f.blur > 0 ? f.blur * scale : 0;
      const y = mod(f.y0 + f.v * t, H + 260) - 130;
      const x = mod(f.x0 + windX * t * (f.v / 60) + f.sway * Math.sin(t * f.freq + f.ph), W + 260) - 130;
      if (soft <= 0.2) {
        ctx.globalAlpha = f.a;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, f.r, 0, TAU);
        ctx.fill();
      } else {
        const rr = f.r + soft * 2.4;
        const gr = ctx.createRadialGradient(x, y, 0, x, y, rr);
        const a = f.a * 0.85;
        gr.addColorStop(0, `rgba(255,255,255,${a})`);
        gr.addColorStop(0.36, `rgba(255,255,255,${a * 0.78})`);
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalAlpha = 1;
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(x, y, rr, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawSnow(ctx, W, H, t, windX, scale) {
    if (!SNOW.built) buildSnow(W, H);
    drawSnowLayer(ctx, W, H, t, SNOW.far, windX * 0.5, scale);
    drawSnowLayer(ctx, W, H, t, SNOW.mid, windX, scale);
  }
  function drawSnowFront(ctx, W, H, t, windX, scale) {
    if (!SNOW.built) buildSnow(W, H);
    drawSnowLayer(ctx, W, H, t, SNOW.near, windX * 1.8, scale || 1);
  }

  // ---------------------------------------------------------------- backdrop
  // A defocused winter dusk. Painted at half resolution on purpose: everything
  // here is meant to be seen through frosted glass, and blurs get 4x cheaper.
  const BG = { canvas: null, scale: 0.5, W: 0, H: 0, key: '' };

  function paintBackdrop(g, W, H, t, scale) {
    const k = (v) => v * scale;
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0.0, '#03060c');
    sky.addColorStop(0.18, '#06101d');
    sky.addColorStop(0.40, '#0c2135');
    sky.addColorStop(0.58, '#173750');
    sky.addColorStop(0.68, '#1d4058');
    sky.addColorStop(0.78, '#122a3e');
    sky.addColorStop(0.90, '#081524');
    sky.addColorStop(1.0, '#04080f');
    g.fillStyle = sky;
    g.fillRect(-W, -H, W * 3, H * 3);

    // cold moonlight, upper right
    let grd = g.createRadialGradient(W * 0.82, H * 0.10, 0, W * 0.82, H * 0.10, H * 0.42);
    grd.addColorStop(0, 'rgba(168,214,255,0.24)');
    grd.addColorStop(0.42, 'rgba(112,172,238,0.09)');
    grd.addColorStop(1, 'rgba(112,172,238,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);

    // warm light, low left — this is what makes the glass read warm at the bottom
    grd = g.createRadialGradient(W * 0.10, H * 0.80, 0, W * 0.10, H * 0.80, H * 0.42);
    grd.addColorStop(0, 'rgba(255,168,92,0.34)');
    grd.addColorStop(0.38, 'rgba(240,146,80,0.13)');
    grd.addColorStop(1, 'rgba(240,146,80,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);

    // bokeh field. Anchors put real colour where the glass will sit.
    const rnd = mulberry32(4241);
    const orbs = [
      [0.24, 0.33, 235, 0.34, 1],
      [0.63, 0.27, 190, 0.30, 0],
      [0.82, 0.44, 150, 0.26, 1],
      [0.38, 0.52, 260, 0.28, 1],
      [0.70, 0.60, 175, 0.30, 1],
      [0.16, 0.61, 205, 0.26, 0],
      [0.90, 0.68, 130, 0.24, 1],
      [0.47, 0.72, 150, 0.22, 1],
    ];
    for (let i = 0; i < 54; i++) {
      orbs.push([
        rnd(),
        0.16 + rnd() * 0.74,
        lerp(10, 66, Math.pow(rnd(), 2.3)),
        lerp(0.05, 0.16, rnd()),
        rnd() > 0.42 ? 1 : 0,
      ]);
    }
    g.save();
    g.filter = `blur(${k(18)}px)`;
    for (let i = 0; i < orbs.length; i++) {
      const [px, py, r, a, warm] = orbs[i];
      const x = px * W;
      const y = py * H;
      const col = warm ? [255, 189, 118] : [168, 216, 255];
      const og = g.createRadialGradient(x, y, 0, x, y, r);
      og.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${a})`);
      og.addColorStop(0.52, `rgba(${col[0]},${col[1]},${col[2]},${a * 0.46})`);
      og.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
      g.fillStyle = og;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
    // festoon lights: a loose string of warm bulbs across the lower third
    for (let i = 0; i < 12; i++) {
      const x = W * (0.02 + i * 0.092);
      const y = H * (0.775 + 0.022 * Math.sin(i * 1.15 + 0.6));
      const r = 11 + 4 * (i % 3);
      const a = 0.34 + 0.07 * Math.sin(i * 2.1);
      const og = g.createRadialGradient(x, y, 0, x, y, r * 2.8);
      og.addColorStop(0, `rgba(255,219,170,${a})`);
      og.addColorStop(0.36, `rgba(255,193,132,${a * 0.34})`);
      og.addColorStop(1, 'rgba(255,193,132,0)');
      g.fillStyle = og;
      g.beginPath(); g.arc(x, y, r * 2.8, 0, TAU); g.fill();
    }
    g.restore();

    // mist band
    grd = g.createLinearGradient(0, H * 0.54, 0, H * 0.80);
    grd.addColorStop(0, 'rgba(150,190,225,0)');
    grd.addColorStop(0.5, 'rgba(150,190,225,0.07)');
    grd.addColorStop(1, 'rgba(150,190,225,0)');
    g.fillStyle = grd;
    g.fillRect(0, H * 0.52, W, H * 0.30);

    // far treeline: soft, low, only in the bottom third
    g.save();
    g.filter = `blur(${k(11)}px)`;
    g.fillStyle = 'rgba(7,16,26,0.55)';
    pineRow(g, W, H * 0.905, H * 0.115, 14, 2026);
    g.restore();

    g.save();
    g.filter = `blur(${k(6)}px)`;
    g.fillStyle = 'rgba(3,8,14,0.86)';
    pineRow(g, W, H * 1.01, H * 0.155, 9, 777);
    g.restore();

    // a second, weaker pool of light on the ground, lower right
    grd = g.createRadialGradient(W * 0.78, H * 0.98, 0, W * 0.78, H * 0.98, H * 0.30);
    grd.addColorStop(0, 'rgba(255,182,120,0.16)');
    grd.addColorStop(0.45, 'rgba(230,150,96,0.06)');
    grd.addColorStop(1, 'rgba(230,150,96,0)');
    g.fillStyle = grd;
    g.fillRect(0, H * 0.6, W, H * 0.4);

    // snow drift on the ground
    grd = g.createLinearGradient(0, H * 0.90, 0, H);
    grd.addColorStop(0, 'rgba(140,175,210,0.06)');
    grd.addColorStop(1, 'rgba(10,20,32,0.66)');
    g.fillStyle = grd;
    g.fillRect(0, H * 0.90, W, H * 0.11);
  }

  /* One conifer: stacked tiers, the silhouette you read through snow. */
  function conifer(ctx, x, base, h, w) {
    const tiers = 5;
    ctx.moveTo(x - w * 0.06, base);
    for (let i = 0; i < tiers; i++) {
      const p = i / tiers;
      const y = base - h * p * 0.94;
      const ww = w * 0.5 * (0.34 + 0.66 * (1 - p));
      const nextY = base - h * (p + 1 / tiers) * 0.98;
      ctx.lineTo(x - ww, y);
      ctx.lineTo(x - ww * 0.34, (y + nextY) / 2);
      ctx.lineTo(x, nextY - h * 0.02);
      ctx.lineTo(x + ww * 0.34, (y + nextY) / 2);
      ctx.lineTo(x + ww, y);
    }
    ctx.lineTo(x + w * 0.06, base);
    ctx.closePath();
  }

  function pineRow(ctx, W, base, height, count, seed) {
    const rnd = mulberry32(seed);
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const x = (i / (count - 1)) * (W + 220) - 110 + (rnd() - 0.5) * 46;
      const h = height * lerp(0.60, 1.20, rnd());
      const w = h * lerp(0.30, 0.46, rnd());
      conifer(ctx, x, base + (rnd() - 0.5) * 20, h, w);
    }
    ctx.fill();
  }

  /* `backdrop(W,H,t)` keeps two caches:
   *   BG.base  — everything that never moves (sky, bokeh, trees, ground), painted once
   *   BG.canvas— base + snow for the current t, rebuilt every frame but cheaply:
   *              one blit at half resolution, a slow drift, and the snow layer.
   * The defocused look is baked in, so all of this stays at half resolution. */
  function backdrop(W, H, t, windX) {
    const key = W + 'x' + H;
    if (BG.key !== key) {
      BG.key = key;
      BG.W = W; BG.H = H;
      BG.base = offscreen(W * BG.scale, H * BG.scale);
      BG.canvas = offscreen(W * BG.scale, H * BG.scale);
      const bg = BG.base.getContext('2d');
      bg.setTransform(BG.scale, 0, 0, BG.scale, 0, 0);
      paintBackdrop(bg, W, H, 0, BG.scale);
    }
    const g = BG.canvas.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, BG.canvas.width, BG.canvas.height);
    // a very slow parallax drift keeps the still backdrop alive
    const dx = Math.sin(t * 0.13) * 5 * BG.scale;
    const dy = Math.sin(t * 0.10 + 1.3) * 4 * BG.scale;
    g.drawImage(BG.base, dx, dy);
    g.setTransform(BG.scale, 0, 0, BG.scale, 0, 0);
    drawSnow(g, W, H, t, windX === undefined ? 26 : windX, BG.scale);
    BG.t = t;
    return BG.canvas;
  }

  // Draw the cached backdrop into a context using logical coordinates.
  function blitBackdrop(ctx, W, H) {
    if (!BG.canvas) return;
    ctx.drawImage(BG.canvas, 0, 0, W, H);
  }

  // ---------------------------------------------------------------- glass
  /* Paints a frosted-glass surface.
   *
   * The backdrop under the panel is sampled into a 1/3-resolution buffer, where
   * it gets blurred, saturated and lifted — that is the actual "frost". It is
   * then drawn back into the clip, upscaled, which softens the grain without
   * costing a full-resolution blur. Everything else is material: milky body,
   * top sheen, inner rim light, grain, and the specular sweep.
   */
  function frostFor(g, opts) {
    const { x, y, w, h } = g;
    const stretch = opts.stretch === undefined ? 1.06 : opts.stretch;
    const blur = opts.blur === undefined ? 22 : opts.blur;
    const sat = opts.saturate === undefined ? 1.55 : opts.saturate;
    const bright = opts.brightness === undefined ? 1.1 : opts.brightness;
    const f = 3; // downsample factor
    const fw = Math.max(4, Math.round(w / f));
    const fh = Math.max(4, Math.round(h / f));
    const c = offscreen(fw, fh);
    const cg = c.getContext('2d');
    // opaque base so the blur has something to bleed into (no dark edges)
    cg.fillStyle = '#0b1a2a';
    cg.fillRect(0, 0, fw, fh);
    if (BG.canvas) {
      const sx = (x + w / 2 - (w * stretch) / 2) * BG.scale;
      const sy = (y + h / 2 - (h * stretch) / 2) * BG.scale;
      const sw = (w * stretch) * BG.scale;
      const sh = (h * stretch) * BG.scale;
      cg.filter = `blur(${blur / f}px) saturate(${sat}) brightness(${bright})`;
      cg.drawImage(BG.canvas, sx, sy, sw, sh, 0, 0, fw, fh);
      cg.filter = 'none';
    }
    return c;
  }

  function drawGlassSurface(ctx, g, t, opts) {
    opts = opts || {};
    const { x, y, w, h, r } = g;
    const frost = frostFor(g, opts);

    ctx.save();
    roundRect(ctx, x, y, w, h, r);
    ctx.clip();

    // the frost itself, upscaled
    ctx.drawImage(frost, x, y, w, h);

    // milky body
    ctx.fillStyle = opts.tint || 'rgba(222,238,255,0.075)';
    ctx.fillRect(x, y, w, h);

    // top sheen (light falling on the surface)
    let grd = ctx.createLinearGradient(0, y, 0, y + h * 0.66);
    grd.addColorStop(0, 'rgba(255,255,255,0.19)');
    grd.addColorStop(0.42, 'rgba(255,255,255,0.05)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(x, y, w, h * 0.66);

    // thickness at the bottom edge
    grd = ctx.createLinearGradient(0, y + h * 0.45, 0, y + h);
    grd.addColorStop(0, 'rgba(3,9,18,0)');
    grd.addColorStop(1, 'rgba(3,9,18,0.30)');
    ctx.fillStyle = grd;
    ctx.fillRect(x, y + h * 0.45, w, h * 0.55);

    // acrylic micro-structure: a coarse turbulence field scrubs the frost so it
    // does not read as one flat sheet of milk
    if (!GLASS_MAT || GLASS_MAT.key !== w + 'x' + h) {
      const mw = 96, mh = Math.round((96 * h) / w);
      const mc = offscreen(mw, mh);
      const mg = mc.getContext('2d');
      const rnd = mulberry32(5150);
      const img = mg.createImageData(mw, mh);
      // value-noise: a lattice of random values, bilinearly interpolated
      const LW = 12, LH = Math.round((12 * mh) / mw) + 1;
      const lat = new Float32Array(LW * LH).map(() => rnd());
      const at = (ix, iy) => lat[(iy % LH) * LW + (ix % LW)];
      for (let py = 0; py < mh; py++) {
        for (let px = 0; px < mw; px++) {
          const gx = (px / mw) * (LW - 1), gy = (py / mh) * (LH - 1);
          const x0 = Math.floor(gx), y0 = Math.floor(gy);
          const fx = smoothstep(gx - x0), fy = smoothstep(gy - y0);
          const v = lerp(lerp(at(x0, y0), at(x0 + 1, y0), fx), lerp(at(x0, y0 + 1), at(x0 + 1, y0 + 1), fx), fy);
          const a = clamp01((v - 0.5) * 0.9 + 0.5);
          const o = (py * mw + px) * 4;
          img.data[o] = 255; img.data[o + 1] = 255; img.data[o + 2] = 255;
          img.data[o + 3] = Math.round(a * 255);
        }
      }
      mg.putImageData(img, 0, 0);
      GLASS_MAT = { canvas: mc, key: w + 'x' + h };
    }
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.globalCompositeOperation = 'overlay';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(GLASS_MAT.canvas, x, y, w, h);
    ctx.restore();

    // a reflected window: two soft diagonal bands, slowly drifting
    const drift = 10 * Math.sin(t * 0.22);
    ctx.save();
    ctx.filter = `blur(${Math.max(30, w * 0.09)}px)`;
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 2; i++) {
      const bx = x + w * (0.18 + i * 0.30) + drift * (i ? -1 : 1);
      const wd = w * (i ? 0.24 : 0.18);
      ctx.beginPath();
      ctx.moveTo(bx, y - 40);
      ctx.lineTo(bx + wd, y - 40);
      ctx.lineTo(bx + wd - w * 0.22, y + h + 40);
      ctx.lineTo(bx - w * 0.22, y + h + 40);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // grain
    const pat = getNoise(ctx);
    if (pat) {
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = pat;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    }

    // travelling specular sweep
    const sweep = opts.sweep;
    if (sweep && sweep.p > 0 && sweep.p < 1) {
      const p = sweep.p;
      const band = w * 0.5;
      const cx = lerp(x - band, x + w + band, easeInOutCubic(p));
      ctx.save();
      ctx.filter = `blur(${Math.max(8, w * 0.02)}px)`;
      const sg = ctx.createLinearGradient(cx - band / 2, y, cx + band / 2, y + h * 0.6);
      sg.addColorStop(0, 'rgba(255,255,255,0)');
      sg.addColorStop(0.5, `rgba(255,255,255,${0.14 * Math.sin(Math.PI * p)})`);
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.moveTo(cx - band * 0.16, y - 100);
      ctx.lineTo(cx + band * 0.20, y - 100);
      ctx.lineTo(cx + band * 0.02, y + h + 100);
      ctx.lineTo(cx - band * 0.34, y + h + 100);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // inner rim light along the top-left
    ctx.save();
    ctx.filter = `blur(${Math.max(3, w * 0.007)}px)`;
    ctx.strokeStyle = 'rgba(255,255,255,0.30)';
    ctx.lineWidth = Math.max(2, w * 0.005);
    roundRect(ctx, x + w * 0.008, y + w * 0.008, w - w * 0.016, h - w * 0.016, r - w * 0.006);
    ctx.stroke();
    ctx.restore();

    // the top edge catches the sky: a bright sliver that fades out by 45%
    ctx.save();
    const tw = w * 0.46;
    const sliver = ctx.createLinearGradient(x + w * 0.06, 0, x + w * 0.06 + tw, 0);
    sliver.addColorStop(0, 'rgba(255,255,255,0)');
    sliver.addColorStop(0.34, 'rgba(255,255,255,0.62)');
    sliver.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = sliver;
    ctx.lineWidth = Math.max(2.4, w * 0.0055);
    ctx.beginPath();
    ctx.moveTo(x + r * 0.7, y + Math.max(1.4, w * 0.003));
    ctx.lineTo(x + w * 0.06 + tw, y + Math.max(1.4, w * 0.003));
    ctx.stroke();
    ctx.restore();

    ctx.restore(); // clip

    // --- outside the clip: specular edge + chromatic fringe
    ctx.save();
    roundRect(ctx, x, y, w, h, r);
    const edge = ctx.createLinearGradient(x, y, x + w, y + h);
    edge.addColorStop(0, 'rgba(255,255,255,0.92)');
    edge.addColorStop(0.26, 'rgba(255,255,255,0.30)');
    edge.addColorStop(0.58, 'rgba(255,255,255,0.12)');
    edge.addColorStop(0.84, 'rgba(255,255,255,0.30)');
    edge.addColorStop(1, 'rgba(255,255,255,0.66)');
    ctx.strokeStyle = edge;
    ctx.lineWidth = Math.max(1.6, w * 0.0028);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,120,120,0.15)';
    ctx.lineWidth = Math.max(1, w * 0.0016);
    ctx.save(); ctx.translate(-1.2, -1.2); ctx.stroke(); ctx.restore();
    ctx.strokeStyle = 'rgba(120,190,255,0.17)';
    ctx.save(); ctx.translate(1.2, 1.2); ctx.stroke(); ctx.restore();
    ctx.restore();
  }

  let GLASS_MAT = null;

  function dropShadow(ctx, g, alpha, blur) {
    ctx.save();
    ctx.shadowColor = `rgba(2,6,12,${alpha})`;
    ctx.shadowBlur = blur;
    ctx.shadowOffsetY = blur * 0.4;
    ctx.fillStyle = 'rgba(2,6,12,1)';
    roundRect(ctx, g.x, g.y, g.w, g.h, g.r);
    ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------- flakes on the glass
  // Flakes land on the panel: they pop in with a spring, sit a beat, then slide
  // down gathering speed and leave a wet streak.
  const ON_GLASS = [
    { x: 0.20, y: 0.16, r: 7, t0: 2.4, hold: 0.9, slide: 34 },
    { x: 0.74, y: 0.09, r: 5, t0: 3.3, hold: 1.6, slide: 24 },
    { x: 0.52, y: 0.38, r: 9, t0: 4.4, hold: 1.1, slide: 50 },
    { x: 0.29, y: 0.52, r: 6, t0: 5.3, hold: 1.9, slide: 28 },
    { x: 0.84, y: 0.58, r: 8, t0: 6.4, hold: 0.7, slide: 56 },
    { x: 0.13, y: 0.72, r: 5, t0: 7.2, hold: 1.4, slide: 32 },
    { x: 0.61, y: 0.84, r: 10, t0: 8.1, hold: 1.0, slide: 44 },
    { x: 0.43, y: 0.30, r: 4, t0: 8.9, hold: 1.5, slide: 26 },
  ];

  function drawFlakesOnGlass(ctx, g, t) {
    ctx.save();
    roundRect(ctx, g.x, g.y, g.w, g.h, g.r);
    ctx.clip();
    for (const f of ON_GLASS) {
      if (t < f.t0) continue;
      const grow = spring(t - f.t0, 14, 0.55);
      const after = Math.max(0, t - f.t0 - f.hold);
      // a melt-drop does not accelerate forever: it slips, slows, slips again
      const slip = after <= 0 ? 0 : (f.slide * after * after) / 2 + f.slide * after * 0.5;
      const cx = g.x + f.x * g.w + Math.sin(t * 0.85 + f.x * 11) * 2.2 + Math.sin(after * 2.6) * 1.4;
      const cy = g.y + f.y * g.h + slip;
      if (cy > g.y + g.h + 24) continue;
      const r = f.r * grow;

      // trail: short, faint, and it only trails the drop a little
      if (slip > 4) {
        const len = Math.min(slip, f.r * 6 + 18);
        const tg = ctx.createLinearGradient(cx, cy - len, cx, cy);
        tg.addColorStop(0, 'rgba(255,255,255,0)');
        tg.addColorStop(0.65, 'rgba(255,255,255,0.055)');
        tg.addColorStop(1, 'rgba(255,255,255,0.10)');
        ctx.strokeStyle = tg;
        ctx.lineWidth = Math.max(1.6, r * 0.75);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - 0.8, cy - len);
        ctx.quadraticCurveTo(cx + 1.2, cy - len * 0.4, cx, cy);
        ctx.stroke();
      }

      // halo, then the drop: white core with a cool rim
      const hg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.2);
      hg.addColorStop(0, 'rgba(255,255,255,0.36)');
      hg.addColorStop(0.36, 'rgba(235,245,255,0.10)');
      hg.addColorStop(1, 'rgba(220,240,255,0)');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(cx, cy, r * 2.2, 0, TAU); ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
      // highlight sits up-left, the way the sky does
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath(); ctx.arc(cx - r * 0.28, cy - r * 0.3, r * 0.42, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- overlays
  function drawGrain(ctx, W, H, amount) {
    const pat = getNoise(ctx);
    if (!pat) return;
    ctx.save();
    ctx.globalAlpha = amount === undefined ? 0.032 : amount;
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function drawVignette(ctx, W, H, strength) {
    const g = ctx.createRadialGradient(W / 2, H * 0.44, H * 0.20, W / 2, H * 0.44, H * 0.80);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(2,6,12,${strength === undefined ? 0.55 : strength})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  return {
    TAU, setCanvasFactory, offscreen,
    clamp, clamp01, lerp, mod, smoothstep, easeOutCubic, easeInOutCubic, pulse, spring, mulberry32,
    roundRect, drawTracked, drawSnowflake,
    backdrop, blitBackdrop, drawSnow, drawSnowFront,
    drawGlassSurface, dropShadow, drawFlakesOnGlass,
    drawGrain, drawVignette,
    BG,
  };
});
