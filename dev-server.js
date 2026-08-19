#!/usr/bin/env node

// Small dependency-free local server for the static app.
// Production rewrites `/` to home.html; this keeps the same contract locally.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8'
};

function getPort() {
  const args = process.argv.slice(2);
  const flagIndex = args.findIndex((arg) => arg === '--port' || arg === '-p');
  const value = flagIndex >= 0 ? args[flagIndex + 1] : process.env.PORT;
  return Number(value) || 8000;
}

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const relative = decoded === '/' ? 'home.html' : decoded.replace(/^\/+/, '');
  const absolute = path.resolve(ROOT, relative);
  return absolute.startsWith(ROOT + path.sep) ? absolute : null;
}

const server = http.createServer((req, res) => {
  let filePath;
  try {
    filePath = safePath(req.url || '/');
  } catch (error) {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }

  if (!filePath) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  function serveFile(targetPath) {
    fs.stat(targetPath, (statError, stat) => {
      let resolvedPath = targetPath;
      if (!statError && stat.isDirectory()) resolvedPath = path.join(resolvedPath, 'index.html');
      fs.readFile(resolvedPath, (readError, data) => {
        if (readError) {
          if (!path.extname(targetPath) && fs.existsSync(targetPath + '.html')) {
            serveFile(targetPath + '.html');
            return;
          }
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(resolvedPath)] || 'application/octet-stream' });
        res.end(data);
      });
    });
  }
  serveFile(filePath);
});

const port = getPort();
server.listen(port, '0.0.0.0', () => {
  console.log(`DeFi Garden serving ${ROOT} at http://localhost:${port}`);
});
