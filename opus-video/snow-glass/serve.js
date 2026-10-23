#!/usr/bin/env node
// tiny static server for the live preview (no deps)
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = __dirname;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.mp4': 'video/mp4', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.json': 'application/json' };
const port = Number(process.env.PORT || 4173);
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  const ext = path.extname(f);
  res.writeHead(200, {
    'Content-Type': types[ext] || 'application/octet-stream',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  fs.createReadStream(f).pipe(res);
}).listen(port, '0.0.0.0', () => console.log(`Snow Glass preview on http://0.0.0.0:${port}`));
