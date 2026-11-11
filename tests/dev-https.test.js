import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import { once } from 'node:events';
import { X509Certificate } from 'node:crypto';
import { localTLS } from '../scripts/dev-tls.js';
import { createDevServer } from '../scripts/server.js';

function request(server, pathname, ca) {
  return new Promise((resolve, reject) => {
    const client = ca ? https : http;
    client
      .get(
        {
          hostname: '127.0.0.1',
          port: server.address().port,
          path: pathname,
          ca,
          agent: false,
        },
        (response) => {
          const chunks = [];
          response.on('data', (chunk) => chunks.push(chunk));
          response.on('end', () =>
            resolve({
              status: response.statusCode,
              headers: response.headers,
              body: Buffer.concat(chunks),
            }),
          );
          response.on('error', reject);
        },
      )
      .on('error', reject);
  });
}

test('local HTTPS supports trusted LAN certificates without exposing private keys', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jelly-https-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const read = (name) => fs.readFileSync(path.join(directory, '.certs', name));

  await t.test('the certificate covers localhost and LAN IPs and is reused on restart', () => {
    const first = localTLS(directory, ['192.168.1.20']);
    const ca = new X509Certificate(read('rootCA.pem'));
    const cert = new X509Certificate(first.cert);
    assert.equal(ca.ca, true);
    assert.equal(cert.verify(ca.publicKey), true);
    assert.equal(cert.checkHost('localhost'), 'localhost');
    for (const ip of ['127.0.0.1', '::1', '192.168.1.20']) assert.ok(cert.checkIP(ip));
    assert.deepEqual(read('rootCA.cer'), ca.raw);
    assert.deepEqual(localTLS(directory, ['192.168.1.20']), first);
  });

  await t.test('DHCP changes renew the server certificate while preserving phone trust', () => {
    const root = read('rootCA.pem'),
      previous = read('dev.pem');
    const changed = localTLS(directory, ['192.168.1.21']);
    assert.deepEqual(read('rootCA.pem'), root);
    assert.notDeepEqual(changed.cert, previous);
    const cert = new X509Certificate(changed.cert);
    assert.ok(cert.checkIP('192.168.1.21'));
    assert.ok(cert.verify(new X509Certificate(root).publicKey));
  });

  fs.writeFileSync(path.join(directory, 'index.html'), '<title>HTTPS game</title>');
  fs.mkdirSync(path.join(directory, 'levels'));
  fs.writeFileSync(path.join(directory, 'levels', 'test.json'), '{}');
  for (const secure of [false, true])
    await t.test(
      `${secure ? 'HTTPS' : 'HTTP'} serves the game and public CA and denies keys`,
      async () => {
        const server = createDevServer({ secure, directory });
        server.listen(0, '127.0.0.1');
        await once(server, 'listening');
        try {
          const ca = secure ? read('rootCA.pem') : undefined;
          const index = await request(server, '/', ca);
          assert.equal(index.status, 200);
          assert.equal(index.body.toString(), '<title>HTTPS game</title>');
          const catalog = await request(server, '/levels/index.json', ca);
          assert.deepEqual(JSON.parse(catalog.body), { levels: ['test.json'] });
          const publicCA = await request(server, '/dev-ca.cer', ca);
          assert.equal(publicCA.status, 200);
          assert.equal(publicCA.headers['content-type'], 'application/x-x509-ca-cert');
          assert.deepEqual(publicCA.body, read('rootCA.cer'));
          for (const name of ['rootCA-key.pem', 'dev-key.pem', 'rootCA.pem']) {
            const response = await request(server, '/.certs/' + name, ca);
            assert.equal(response.status, 403);
          }
        } finally {
          await new Promise((resolve) => server.close(resolve));
        }
      },
    );
});
