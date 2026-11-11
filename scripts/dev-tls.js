import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { isIP } from 'node:net';
import { X509Certificate, createPrivateKey } from 'node:crypto';
import { execFileSync } from 'node:child_process';

export function localAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((entry) => entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address);
}

// Keep this project's CA stable when DHCP changes the computer's IP: the phone
// only needs to trust it once. Nothing is installed into system trust stores.
export function localTLS(root, addresses = localAddresses()) {
  const directory = path.join(root, '.certs');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = (name) => path.join(directory, name);
  const run = (...args) => {
    try {
      execFileSync('openssl', args, { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      if (error.code === 'ENOENT')
        throw Error('HTTPS setup needs OpenSSL. Install it and run npm run start:https again.');
      throw Error('OpenSSL: ' + (error.stderr?.toString().trim() || error.message));
    }
  };
  const ips = [...new Set(['127.0.0.1', '::1', ...addresses.filter((ip) => isIP(ip))])];
  const config = `
[req]
prompt = no
distinguished_name = dn
[dn]
CN = localhost
[ca]
basicConstraints = critical,CA:TRUE,pathlen:0
keyUsage = critical,keyCertSign,cRLSign
subjectKeyIdentifier = hash
[server]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid,issuer
subjectAltName = @names
[names]
DNS.1 = localhost
${ips.map((ip, index) => `IP.${index + 1} = ${ip}`).join('\n')}
`;
  fs.writeFileSync(file('openssl.cnf'), config);
  const hasCA = fs.existsSync(file('rootCA.pem'));
  if (hasCA !== fs.existsSync(file('rootCA-key.pem')))
    throw Error('Incomplete local CA in .certs. Restore both rootCA.pem and rootCA-key.pem.');
  if (!hasCA) {
    run(
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-sha256',
      '-days',
      '3650',
      '-subj',
      '/CN=Jelly and Bones Local Development CA',
      '-keyout',
      'rootCA-key.pem',
      '-out',
      'rootCA.pem',
      '-config',
      'openssl.cnf',
      '-extensions',
      'ca',
    );
    fs.chmodSync(file('rootCA-key.pem'), 0o600);
  }
  const ca = new X509Certificate(fs.readFileSync(file('rootCA.pem')));
  if (Date.parse(ca.validTo) <= Date.now())
    throw Error(
      'The local CA in .certs has expired. Recreate it and trust the new CA on the phone.',
    );
  // DER .cer is recognized by iOS as an installable certificate profile.
  fs.writeFileSync(file('rootCA.cer'), ca.raw);
  let valid = false;
  try {
    const cert = new X509Certificate(fs.readFileSync(file('dev.pem')));
    valid =
      cert.verify(ca.publicKey) &&
      cert.checkPrivateKey(createPrivateKey(fs.readFileSync(file('dev-key.pem')))) &&
      Date.parse(cert.validTo) > Date.now() + 7 * 86400000 &&
      !!cert.checkHost('localhost') &&
      ips.every((ip) => cert.checkIP(ip));
  } catch {
    // A missing or damaged server certificate can be renewed under the same CA.
  }
  if (!valid) {
    run(
      'req',
      '-new',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-sha256',
      '-keyout',
      'dev-key.pem',
      '-out',
      'dev.csr',
      '-config',
      'openssl.cnf',
    );
    run(
      'x509',
      '-req',
      '-in',
      'dev.csr',
      '-CA',
      'rootCA.pem',
      '-CAkey',
      'rootCA-key.pem',
      '-CAcreateserial',
      '-out',
      'dev.pem',
      '-days',
      '365',
      '-sha256',
      '-extfile',
      'openssl.cnf',
      '-extensions',
      'server',
    );
    fs.chmodSync(file('dev-key.pem'), 0o600);
  }
  return { key: fs.readFileSync(file('dev-key.pem')), cert: fs.readFileSync(file('dev.pem')) };
}
