#!/usr/bin/env node
/* Frame renderer for the Snow Glass scenes.
 *
 *   node render.js a --still 3.2 --out stills/plan-a.png --size 1080x1920
 *   node render.js a --out out/final.mp4 --size 1080x1920 --fps 30 --duration 12
 *
 * Same contract as the skill's scripts/render.py: every scene exposes
 * draw(name, ctx, W, H, t), frames are pure functions of t, ffmpeg muxes.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// deps live in the repo's tools/node_modules so the scene folder stays clean
const Module = require('module');
const TOOLS = path.resolve(__dirname, '..', '..', '..', 'tools');
process.env.NODE_PATH = path.join(TOOLS, 'node_modules') + (process.env.NODE_PATH ? ':' + process.env.NODE_PATH : '');
Module._initPaths();
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

const S = require('./lib.js');
S.setCanvasFactory((w, h) => createCanvas(w, h));
const Scenes = require('./scenes.js');

const FONT_DIR = path.join(__dirname, '..', 'fonts');
for (const w of [200, 300, 400, 500, 600]) {
  const p = path.join(FONT_DIR, `Inter-${w}.ttf`);
  if (fs.existsSync(p)) GlobalFonts.registerFromPath(p, `Inter${w}`);
}

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
}
const scene = process.argv[2];
const [W, H] = (arg('size', '1080x1920')).toLowerCase().split('x').map(Number);
const fps = Number(arg('fps', 30));
const sub = Number(arg('subframes', 1));
const out = arg('out', 'out/frame.png');
const still = arg('still', null);
const start = Number(arg('start', 0));
const duration = Number(arg('duration', 12));
const audio = arg('audio', null);
const ffmpeg = process.env.FFMPEG || (fs.existsSync(path.join(TOOLS, 'bin', 'ffmpeg'))
  ? path.join(TOOLS, 'bin', 'ffmpeg') : 'ffmpeg');

// Scenes are authored in a 1080 x 1920 design space; any output size is that
// space scaled uniformly, so a 540x960 preview is the same composition.
const DW = 1080, DH = 1920;
const SCALE = Math.min(W / DW, H / DH);
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

function frameAt(t) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#03060b';
  ctx.fillRect(0, 0, W, H);
  ctx.setTransform(SCALE, 0, 0, SCALE, (W - DW * SCALE) / 2, (H - DH * SCALE) / 2);
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  ctx.shadowColor = 'rgba(0,0,0,0)';
  ctx.shadowBlur = 0;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  Scenes.draw(scene, ctx, DW, DH, t);
  ctx.restore();
}

if (still !== null) {
  frameAt(Number(still));
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, canvas.encodeSync('png'));
  console.log(`${out}: still at t=${still}s  ${W}x${H}`);
  process.exit(0);
}

const frames = Math.round(fps * duration);
const total = frames * sub;
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });

const blur = sub > 1
  ? `tmix=frames=${sub}:weights=${Array(sub).fill(1).join(' ')},select='not(mod(n\\,${sub}))',`
  : '';

let cmd = [ffmpeg, '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(fps * sub), '-i', '-'];
if (audio) cmd = cmd.concat(['-ss', String(start), '-i', audio]);
cmd = cmd.concat([
  '-vf', `${blur}setpts=N/(${fps}*TB),format=yuv420p`,
  '-r', String(fps), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
]);
if (audio) cmd = cmd.concat(['-c:a', 'aac', '-b:a', '192k', '-shortest']);
cmd.push(out);

const ff = spawn(cmd[0], cmd.slice(1), { stdio: ['pipe', 'inherit', 'inherit'] });
ff.on('error', (e) => { console.error(e.message); process.exit(1); });

const t0 = Date.now();
(async () => {
  for (let i = 0; i < total; i++) {
    frameAt(start + i / (fps * sub));
    const { data } = ctx.getImageData(0, 0, W, H);
    if (!ff.stdin.write(Buffer.from(data.buffer, data.byteOffset, data.byteLength))) {
      await new Promise((r) => ff.stdin.once('drain', r));
    }
    if (i && i % Math.max(1, Math.floor(total / 8)) === 0) {
      const el = (Date.now() - t0) / 1000;
      console.log(`  ${i}/${total} frames, ${el.toFixed(0)}s (${(el / (i + 1) * 1000).toFixed(0)} ms/frame)`);
    }
  }
  ff.stdin.end();
  ff.on('close', (code) => {
    if (code !== 0) { console.error('ffmpeg failed'); process.exit(code); }
    const el = (Date.now() - t0) / 1000;
    console.log(`${out}: ${frames} frames x ${sub} samples, ${W}x${H} @ ${fps}fps, rendered in ${el.toFixed(1)}s`);
  });
})();
