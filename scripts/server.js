import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { localAddresses, localTLS } from './dev-tls.js';
const root = path.resolve(import.meta.dirname, '..');

export function createDevServer({ secure = false, directory = root } = {}) {
  const tls = secure ? localTLS(directory) : null;
  const handle = (req, res) => {
    const name = req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0];
    // Only this public certificate is downloadable; .certs and its keys stay hidden.
    if (name === '/dev-ca.cer') {
      fs.readFile(path.join(directory, '.certs', 'rootCA.cer'), (error, data) => {
        if (error) {
          res.writeHead(404);
          return res.end('Start npm run start:https first to generate the local certificate.');
        }
        res.setHeader('Content-Type', 'application/x-x509-ca-cert');
        res.setHeader('Content-Disposition', 'attachment; filename="jelly-dev-ca.cer"');
        res.end(data);
      });
      return;
    }
    // The editor's map list: every level JSON in levels/ (the build writes this file instead).
    if (name === '/levels/index.json') {
      const levels = fs
        .readdirSync(path.join(directory, 'levels'))
        .filter((file) => /^[a-z0-9-]+\.json$/i.test(file) && file !== 'index.json')
        .sort();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ levels }));
    }
    const file = path.resolve(directory, '.' + name);
    if (
      !file.startsWith(directory + path.sep) ||
      path
        .relative(directory, file)
        .split(path.sep)
        .some((part) => part.startsWith('.'))
    ) {
      res.writeHead(403);
      return res.end();
    }
    fs.readFile(file, (error, data) => {
      if (error) {
        res.writeHead(404);
        return res.end('Not found');
      }
      res.setHeader(
        'Content-Type',
        {
          '.html': 'text/html; charset=utf-8',
          '.css': 'text/css',
          '.js': 'text/javascript',
          '.json': 'application/json; charset=utf-8',
          '.png': 'image/png',
          '.svg': 'image/svg+xml',
          '.mp3': 'audio/mpeg',
          '.wav': 'audio/wav',
        }[path.extname(file)] || 'application/octet-stream',
      );
      res.end(data);
    });
  };
  return secure ? https.createServer(tls, handle) : http.createServer(handle);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const secure = process.argv.includes('--https');
  const port = Number(
    process.argv.find((arg) => arg.startsWith('--port='))?.slice(7) ?? (secure ? 3443 : 3000),
  );
  try {
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('Invalid server port.');
    const server = createDevServer({ secure });
    server.on('error', (error) => {
      console.error('Development server: ' + error.message);
      process.exitCode = 1;
    });
    server.listen(port, () => {
      const protocol = secure ? 'https' : 'http',
        actualPort = server.address().port;
      console.log(`Jelly & Bones: ${protocol}://localhost:${actualPort}`);
      for (const ip of localAddresses()) console.log(`LAN: ${protocol}://${ip}:${actualPort}`);
      if (secure)
        console.log(
          'iPhone: install .certs/rootCA.cer, then enable full trust in Settings > General > About > Certificate Trust Settings. See docs/development.md.',
        );
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
