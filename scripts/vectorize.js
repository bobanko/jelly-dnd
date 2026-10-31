import { loadEnvFile } from 'node:process';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const api = 'https://api.vectorizer.ai/api/v1';
const imageTypes = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
};

const usage =
  'npm run vectorize -- --check                         Check keys and show credits\n' +
  'npm run vectorize -- <image> [options]               Free test run (watermarked)\n' +
  'npm run vectorize -- <image> --production [options]  Clean SVG (uses 1 credit)\n\n' +
  'Options:\n' +
  '  --preset <name>     Parameter preset from scripts/vectorize-presets.json\n' +
  '  --set key=value     Any API parameter, e.g. --set processing.max_colors=4 (repeatable)\n' +
  '  --out <file>        Output path (test default: artifacts/vectorize/<name>.test.svg,\n' +
  '                      production default: assets/icons/<name>.svg)\n' +
  '  --force             Overwrite an existing production file\n' +
  '  --dry-run           Print request parameters without calling the API';

export async function request(endpoint, auth, options = {}) {
  const response = await fetch(api + endpoint, {
    ...options,
    headers: { Authorization: 'Basic ' + auth, ...options.headers },
    redirect: 'error',
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) {
    // The API reports parameter problems in error.message; it never echoes credentials.
    let detail = '';
    try {
      const message = (await response.json())?.error?.message;
      if (typeof message === 'string') detail = ' ' + message.slice(0, 300);
    } catch {}
    const hint = {
      401: 'Invalid API Id or Secret.',
      402: 'Not enough credits.',
      429: 'Rate limit reached. Wait a few seconds and retry.',
    }[response.status];
    throw Error(`Vectorizer HTTP ${response.status}.${detail}${hint ? ' ' + hint : ''}`);
  }
  return response;
}

export function parseArgs(args) {
  const options = { set: {}, production: false, force: false, dryRun: false };
  const takeValue = (flag, index) => {
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) throw Error(`${flag} needs a value.`);
    return value;
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--production') options.production = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--check') options.check = true;
    else if (arg === '--help') options.help = true;
    else if (arg === '--preset') options.preset = takeValue(arg, i++);
    else if (arg === '--out') options.out = takeValue(arg, i++);
    else if (arg === '--set') {
      const pair = takeValue(arg, i++);
      const split = pair.indexOf('=');
      if (split < 1) throw Error('--set expects key=value.');
      options.set[pair.slice(0, split)] = pair.slice(split + 1);
    } else if (arg.startsWith('--')) throw Error(`Unknown option ${arg}. Use --help.`);
    else if (options.input) throw Error('Only one input image is supported.');
    else options.input = arg;
  }
  return options;
}

function loadAuth() {
  // Explicit environment variables take precedence over the local file.
  if (!process.env.VECTORIZER_API_ID || !process.env.VECTORIZER_API_SECRET) {
    try {
      loadEnvFile(path.join(root, '.env.vectorizer'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw Error('Cannot load .env.vectorizer.');
    }
  }
  const id = process.env.VECTORIZER_API_ID?.trim();
  const secret = process.env.VECTORIZER_API_SECRET?.trim();
  if (!id || !secret)
    throw Error('Add VECTORIZER_API_ID and VECTORIZER_API_SECRET to .env.vectorizer.');
  return Buffer.from(`${id}:${secret}`).toString('base64');
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (options.help || (!options.check && !options.input)) {
    console.log(usage);
    return;
  }

  if (options.check) {
    if (options.input) throw Error('--check takes no image.');
    const account = await (await request('/account', loadAuth())).json();
    console.log(`Authentication successful. Credits: ${account.credits}.`);
    return;
  }

  const presets = JSON.parse(await readFile(new URL('./vectorize-presets.json', import.meta.url)));
  if (options.preset && !Object.hasOwn(presets, options.preset))
    throw Error(`Unknown preset. Available: ${Object.keys(presets).join(', ')}.`);
  const params = {
    ...(options.preset ? presets[options.preset] : {}),
    ...options.set,
    mode: options.production ? 'production' : 'test',
  };
  const format = String(params['output.file_format'] ?? 'svg');

  const input = path.resolve(options.input);
  const type = imageTypes[path.extname(input).toLowerCase()];
  if (!type) throw Error('Input must be PNG, JPEG, WebP, GIF, BMP or TIFF.');
  const name = path.basename(input, path.extname(input));
  const destination = path.resolve(
    options.out ??
      (options.production
        ? path.join(root, 'assets', 'icons', `${name}.${format}`)
        : path.join(root, 'artifacts', 'vectorize', `${name}.test.${format}`)),
  );

  if (options.dryRun) {
    console.log(JSON.stringify({ input, output: destination, params }, null, 2));
    return;
  }

  const image = await readFile(input);
  const auth = loadAuth();
  await mkdir(path.dirname(destination), { recursive: true });
  // Production runs cost credits: check the target before calling the API.
  const flag = options.production && !options.force ? 'wx' : 'w';
  if (flag === 'wx') {
    try {
      await writeFile(destination, '', { flag: 'wx' });
    } catch (error) {
      if (error.code === 'EEXIST') throw Error('Output exists. Use --out or --force.');
      throw error;
    }
  }

  const form = new FormData();
  form.append('image', new Blob([image], { type }), path.basename(input));
  for (const [key, value] of Object.entries(params)) form.append(key, String(value));

  console.log(`Vectorizing ${path.basename(input)} (${params.mode})…`);
  let response;
  try {
    response = await request('/vectorize', auth, { method: 'POST', body: form });
  } catch (error) {
    // Release the reserved empty file so a retry is not blocked.
    if (flag === 'wx') await unlink(destination).catch(() => {});
    throw error;
  }
  const result = Buffer.from(await response.arrayBuffer());
  if (!result.length) throw Error('Vectorizer returned an empty result.');
  await writeFile(destination, result);

  const charged = response.headers.get('X-Credits-Charged') ?? '?';
  const calculated = response.headers.get('X-Credits-Calculated');
  console.log(
    `Saved: ${path.relative(root, destination)} (${(result.length / 1024).toFixed(1)} KB). ` +
      `Credits charged: ${charged}` +
      (calculated ? `, production would cost: ${calculated}.` : '.'),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(
      error.name === 'TypeError' || error.name === 'TimeoutError'
        ? 'Network request failed or timed out. Nothing is retried automatically.'
        : error.message,
    );
    process.exitCode = 1;
  });
}
