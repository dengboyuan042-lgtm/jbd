/* Snow Glass — three plans, one library.
 * Every draw function is a pure function of t (seconds).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./lib.js'));
  else root.SnowGlassScenes = factory(root.SnowGlass);
})(typeof self !== 'undefined' ? self : this, function (S) {
  'use strict';

  const {
    TAU, clamp, clamp01, lerp, smoothstep, easeInOutCubic,
    spring, roundRect, drawTracked, drawSnowflake, backdrop, blitBackdrop,
    drawSnow, drawSnowFront, drawGlassSurface, dropShadow, drawFlakesOnGlass,
    drawGrain, drawVignette,
  } = S;

  function camera(ctx, W, H, scale, cx, cy, swayX, swayY) {
    ctx.translate(W / 2, H / 2);
    ctx.scale(scale, scale);
    ctx.translate(-cx + (swayX || 0), -cy + (swayY || 0));
  }

  // ---------------------------------------------------------------- text bits
  function clockText(ctx, text, cx, baseline, size, t, t0, opt) {
    opt = opt || {};
    ctx.save();
    ctx.font = `${opt.weight || 500} ${size}px ${opt.family || 'Inter500'}, sans-serif`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    const spacing = opt.spacing === undefined ? -size * 0.018 : opt.spacing;
    const chars = Array.from(text);
    const widths = chars.map((c) => ctx.measureText(c).width);
    const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
    let x = cx - total / 2;
    ctx.fillStyle = opt.color || 'rgba(255,255,255,0.96)';
    if (opt.glow !== false) {
      ctx.shadowColor = `rgba(150,200,255,${opt.glow === undefined ? 0.45 : opt.glow})`;
      ctx.shadowBlur = size * 0.13;
    }
    for (let i = 0; i < chars.length; i++) {
      const k = spring(t - (t0 + i * (opt.stagger || 0.07)), 15, 0.6);
      if (k > 0.001) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x - size * 0.09, baseline - size * 1.06, widths[i] + size * 0.18, size * 1.22);
        ctx.clip();
        ctx.globalAlpha = clamp01(k * 1.7);
        ctx.fillText(chars[i], x, baseline + (1 - k) * size * 0.62);
        ctx.restore();
      }
      x += widths[i] + spacing;
    }
    ctx.restore();
  }

  function riseIn(t, t0, dur) {
    const k = spring(t - t0, 16, 0.75);
    return { a: clamp01((t - t0) / (dur || 0.5)), dy: (1 - k) * 26, k };
  }

  // ================================================================ PLAN A
  // "Lock screen": one big frosted panel over a defocused winter dusk,
  // a second sheet of glass for the notification, snow landing on both.
  function drawA(ctx, W, H, t) {
    backdrop(W, H, t, 26);
    const g = { x: 84, y: 424, w: 912, h: 900, r: 80 };

    ctx.fillStyle = '#03060b';
    ctx.fillRect(0, 0, W, H);

    // one continuous push-in with a slow lateral drift: the panel grows ~13%
    // across the shot, so the frame is never still but never busy either
    const push = 1.0 + 0.13 * smoothstep((t - 0.5) / 11.0);
    ctx.save();
    camera(ctx, W, H, push, W / 2, H / 2, 5 * Math.sin(t * 0.22), 7 - 4.5 * Math.sin(t * 0.17 + 0.7));
    blitBackdrop(ctx, W, H);

    // ---- panel entry
    const kIn = spring(t - 0.32, 13, 0.72);
    const panelAlpha = clamp01((t - 0.32) / 0.35);

    ctx.save();
    ctx.globalAlpha = panelAlpha;
    const gcx = g.x + g.w / 2;
    const gcy = g.y + g.h / 2;
    ctx.translate(gcx, gcy + (1 - kIn) * 46);
    ctx.scale(0.945 + 0.055 * kIn, 0.945 + 0.055 * kIn);
    ctx.translate(-gcx, -gcy);

    dropShadow(ctx, g, 0.62, 84);
    drawGlassSurface(ctx, g, t, {
      blur: 26, saturate: 1.6, brightness: 1.12, stretch: 1.07,
      tint: 'rgba(220,238,255,0.06)',
      sweep: { p: t < 4.4 ? clamp01((t - 2.3) / 2.0) : t > 8.4 ? clamp01((t - 8.4) / 1.5) : 0 },
    });

    // weather row
    {
      const r = riseIn(t, 1.2);
      ctx.save();
      ctx.globalAlpha = r.a;
      const iy = g.y + 146 + r.dy;
      ctx.strokeStyle = 'rgba(255,255,255,0.88)';
      drawSnowflake(ctx, g.x + 106, iy - 26, 19, 2.2);
      ctx.font = '300 78px Inter300, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('−3°', g.x + 146, iy);
      ctx.font = '500 21px Inter500, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.52)';
      drawTracked(ctx, 'SNOW', g.x + g.w - 92, iy - 8, 6.4, 'right');
      ctx.restore();
    }

    // clock
    clockText(ctx, '19:42', gcx, g.y + 486, 208, t, 1.05, { spacing: -6, glow: 0.34 });

    // date
    {
      const r = riseIn(t, 1.7);
      ctx.save();
      ctx.globalAlpha = r.a * 0.6;
      ctx.font = '500 25px Inter500, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'alphabetic';
      drawTracked(ctx, 'SATURDAY 24 JANUARY', gcx, g.y + 574 + r.dy, 5.8, 'center');
      ctx.restore();
    }

    // hairline + footer row
    {
      const r = riseIn(t, 2.15);
      ctx.save();
      ctx.globalAlpha = r.a;
      const lg = ctx.createLinearGradient(g.x + 110, 0, g.x + g.w - 110, 0);
      lg.addColorStop(0, 'rgba(255,255,255,0)');
      lg.addColorStop(0.5, 'rgba(255,255,255,0.26)');
      lg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(g.x + 110, g.y + 700 + r.dy, g.w - 220, 1.3);

      ctx.font = '400 23px Inter400, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.56)';
      ctx.textBaseline = 'alphabetic';
      drawTracked(ctx, 'SNOW UNTIL 23:00', g.x + 108, g.y + 770 + r.dy, 2.4, 'left');
      drawTracked(ctx, '12 CM', g.x + g.w - 108, g.y + 770 + r.dy, 2.4, 'right');
      ctx.restore();
    }
    ctx.restore(); // panel transform

    // ---- notification card: its own sheet, springs up over the panel's bottom edge
    {
      const t0 = 5.9;
      const k = spring(t - t0, 14, 0.7);
      const vis = clamp01((t - t0) / 0.3);
      if (vis > 0) {
        const card = { x: 142, y: 1356 + (1 - k) * 160, w: 796, h: 184, r: 52 };
        ctx.save();
        ctx.globalAlpha = vis;
        dropShadow(ctx, card, 0.55, 62);
        drawGlassSurface(ctx, card, t, {
          blur: 28, saturate: 1.55, brightness: 1.14, stretch: 1.14,
          tint: 'rgba(226,242,255,0.09)',
          sweep: { p: t > 9.0 ? clamp01((t - 9.0) / 1.5) : 0 },
        });
        ctx.save();
        ctx.filter = 'blur(26px)';
        const refl = ctx.createLinearGradient(0, card.y + card.h, 0, card.y + card.h + 120);
        refl.addColorStop(0, 'rgba(150,200,245,0.16)');
        refl.addColorStop(1, 'rgba(150,200,245,0)');
        ctx.fillStyle = refl;
        roundRect(ctx, card.x + 60, card.y + card.h - 10, card.w - 120, 130, 40);
        ctx.fill();
        ctx.restore();
        const ix = card.x + 88, iy = card.y + card.h / 2;
        const ig = ctx.createLinearGradient(ix - 32, iy - 32, ix + 32, iy + 32);
        ig.addColorStop(0, 'rgba(126,194,255,0.95)');
        ig.addColorStop(1, 'rgba(64,124,214,0.95)');
        ctx.fillStyle = ig;
        roundRect(ctx, ix - 32, iy - 32, 64, 64, 20);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        drawSnowflake(ctx, ix, iy, 16, 2.1);

        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.font = '600 25px Inter600, sans-serif';
        ctx.fillText('Weather', card.x + 150, card.y + 71);
        ctx.fillStyle = 'rgba(255,255,255,0.72)';
        ctx.font = '400 26px Inter400, sans-serif';
        ctx.fillText('Snow continues until 23:00', card.x + 150, card.y + 116);
        ctx.fillStyle = 'rgba(255,255,255,0.40)';
        ctx.font = '500 20px Inter500, sans-serif';
        drawTracked(ctx, 'NOW', card.x + card.w - 38, card.y + 60, 2, 'right');
        ctx.restore();
      }
    }

    // flakes landing on the big panel
    drawFlakesOnGlass(ctx, g, t);

    drawSnowFront(ctx, W, H, t, 26);
    ctx.restore();

    // a quiet stamp at the very bottom, pinned to the frame (outside the camera)
    {
      const r = riseIn(t, 8.6);
      ctx.save();
      ctx.globalAlpha = r.a * 0.34;
      ctx.font = '500 20px Inter500, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'alphabetic';
      drawTracked(ctx, 'SNOWFALL · −3°', 84, H - 84, 4.5, 'left');
      drawTracked(ctx, '24 JAN 2026', W - 84, H - 84, 4.5, 'right');
      ctx.restore();
    }

    drawVignette(ctx, W, H, 0.6);
    drawGrain(ctx, W, H);

    const fade = 1 - smoothstep(t / 1.15);
    if (fade > 0) {
      ctx.fillStyle = `rgba(3,6,11,${fade})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ================================================================ PLAN B
  // "Macro": the camera sits a few centimetres from the glass. One corner of
  // the sheet cuts the frame; behind it the world is pure bokeh, in front a
  // single snowflake lands and starts to melt.
  function drawB(ctx, W, H, t) {
    backdrop(W, H, t, 26);
    ctx.fillStyle = '#03060b';
    ctx.fillRect(0, 0, W, H);

    const zoom = 1.25 + 0.16 * smoothstep(t / 9);
    ctx.save();
    camera(ctx, W, H, zoom, W * 0.5, H * 0.46, 6 * Math.sin(t * 0.4), 5 * Math.sin(t * 0.31 + 2));
    blitBackdrop(ctx, W, H);

    // the sheet: corner in the upper third, body filling the rest of the frame
    const sheet = { x: W * 0.30, y: H * 0.24, w: W * 1.25, h: H * 1.05, r: 210 };
    dropShadow(ctx, sheet, 0.72, 110);
    drawGlassSurface(ctx, sheet, t, {
      blur: 30, saturate: 1.72, brightness: 1.14, stretch: 1.05,
      tint: 'rgba(226,242,255,0.075)',
      sweep: { p: clamp01((t - 0.8) / 7.2) },
    });

    // a second, smaller sheet floating behind for depth
    {
      const s2 = { x: W * 0.02, y: H * 0.30, w: W * 0.30, h: H * 0.16, r: 34 };
      ctx.save();
      ctx.globalAlpha = 0.85;
      dropShadow(ctx, s2, 0.45, 46);
      drawGlassSurface(ctx, s2, t, { blur: 22, saturate: 1.5, brightness: 1.06, stretch: 1.2, tint: 'rgba(226,242,255,0.05)' });
      ctx.restore();
    }

    // the snowflake: falls in, sticks, then starts to slide and melt
    {
      const t0 = 1.15;
      const k = spring(t - t0, 11, 0.5);
      const slide = Math.max(0, t - t0 - 3.0);
      const slideY = slide * slide * 30;
      const cx = W * 0.545 + Math.sin(t * 0.9) * 2;
      const cy = H * 0.365 + (1 - k) * -260 + slideY;
      const r = 62 * clamp01(k * 1.2);
      if (r > 1) {
        ctx.save();
        if (slideY > 1) {
          const sg = ctx.createLinearGradient(cx, cy - slideY - 30, cx, cy);
          sg.addColorStop(0, 'rgba(255,255,255,0)');
          sg.addColorStop(1, 'rgba(255,255,255,0.13)');
          ctx.strokeStyle = sg;
          ctx.lineWidth = r * 0.55;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(cx, cy - slideY);
          ctx.lineTo(cx, cy);
          ctx.stroke();
        }
        const hg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 3.2);
        hg.addColorStop(0, 'rgba(255,255,255,0.30)');
        hg.addColorStop(0.35, 'rgba(235,246,255,0.10)');
        hg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = hg;
        ctx.beginPath(); ctx.arc(cx, cy, r * 3.2, 0, TAU); ctx.fill();

        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.shadowColor = 'rgba(170,215,255,0.7)';
        ctx.shadowBlur = 30;
        drawSnowflake(ctx, cx, cy, r, r * 0.085);
        ctx.restore();
      }
    }

    drawSnowFront(ctx, W, H, t, 26);
    ctx.restore();

    // caption pinned to the frame
    {
      const r = riseIn(t, 0.9);
      ctx.save();
      ctx.globalAlpha = r.a * 0.5;
      ctx.font = '500 19px Inter500, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'alphabetic';
      drawTracked(ctx, 'MACRO · 35 MM · FROSTED', 84, H - 100, 6.5, 'left');
      ctx.restore();
    }

    drawVignette(ctx, W, H, 0.55);
    drawGrain(ctx, W, H);
    const fade = 1 - smoothstep(t / 1.0);
    if (fade > 0) { ctx.fillStyle = `rgba(3,6,11,${fade})`; ctx.fillRect(0, 0, W, H); }
  }

  // ================================================================ PLAN C
  // "Through the glass": one unbroken dolly forward through three sheets of
  // frosted glass, each carrying one word, each at its own depth.
  const C_PANELS = [
    { x: 0.500, y: 0.195, z: 0.28, w: 0.600, word: 'snow' },
    { x: 0.330, y: 0.470, z: 0.60, w: 0.470, word: 'glass' },
    { x: 0.610, y: 0.745, z: 1.00, w: 0.420, word: 'light' },
  ];

  function drawC(ctx, W, H, t) {
    backdrop(W, H, t, 26);
    const p = clamp01(t / 12);
    const dolly = 1 + 0.22 * p * p;
    ctx.fillStyle = '#03060b';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    camera(ctx, W, H, dolly, W / 2, H / 2, 0, 0);
    blitBackdrop(ctx, W, H);

    const order = C_PANELS.slice().sort((a, b) => a.z - b.z);
    for (const pl of order) {
      const par = (1 - pl.z) * 90 * p;
      const cx = W * pl.x - par * 0.35;
      const cy = H * pl.y - par * 0.8;
      const w = W * pl.w * (1 + (1 - pl.z) * 0.16);
      const h = w * 0.44;
      const box = { x: cx - w / 2, y: cy - h / 2, w, h, r: h * 0.24 };
      const enter = spring(t - 0.3 - (1 - pl.z) * 0.45, 12, 0.7);
      ctx.save();
      ctx.globalAlpha = clamp01(enter * 1.5);
      ctx.translate(cx, cy);
      ctx.scale(lerp(0.9, 1, enter), lerp(0.9, 1, enter));
      ctx.translate(-cx, -cy);
      dropShadow(ctx, box, 0.5, 64);
      drawGlassSurface(ctx, box, t, {
        blur: 26, saturate: 1.62, brightness: 1.1, stretch: 1.1,
        tint: 'rgba(224,240,255,0.075)',
        sweep: { p: t > 2 + pl.z * 2 ? clamp01((t - 2 - pl.z * 2) / 1.8) : 0 },
      });

      // word, kerned, fitted to the sheet
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let fs = h * 0.40;
      ctx.font = `500 ${fs}px Inter500, sans-serif`;
      const maxW = w * 0.74;
      const mw = ctx.measureText(pl.word).width;
      if (mw > maxW) {
        fs *= maxW / mw;
        ctx.font = `500 ${fs}px Inter500, sans-serif`;
      }
      ctx.letterSpacing = `${(-fs * 0.012).toFixed(2)}px`;
      ctx.fillStyle = 'rgba(255,255,255,0.94)';
      ctx.shadowColor = 'rgba(140,190,255,0.5)';
      ctx.shadowBlur = fs * 0.32;
      ctx.fillText(pl.word, cx, cy + fs * 0.03);
      ctx.restore();
      ctx.restore();
    }
    drawSnowFront(ctx, W, H, t, 26);
    ctx.restore();

    drawVignette(ctx, W, H, 0.6);
    drawGrain(ctx, W, H);
    // the last beat is the payoff: hold the widest frame, then let it go
    const out3 = smoothstep((t - 11.0) / 1.0);
    if (out3 > 0) { ctx.fillStyle = `rgba(3,6,11,${out3 * 0.9})`; ctx.fillRect(0, 0, W, H); }
    const fade = 1 - smoothstep(t / 1.0);
    if (fade > 0) { ctx.fillStyle = `rgba(3,6,11,${fade})`; ctx.fillRect(0, 0, W, H); }
  }

  const DRAW = { a: drawA, b: drawB, c: drawC };
  return { draw: (name, ctx, W, H, t) => DRAW[name](ctx, W, H, t), drawA, drawB, drawC };
});
