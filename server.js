import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = import.meta.dirname;
http
  .createServer((req, res) => {
    const name = req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0];
    const file = path.resolve(root, '.' + name);
    if (
      !file.startsWith(root + path.sep) ||
      path
        .relative(root, file)
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
        }[path.extname(file)] || 'application/octet-stream',
      );
      res.end(data);
    });
  })
  .listen(3000, () => console.log('Jelly & Bones: http://localhost:3000'));
