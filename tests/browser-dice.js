import { chromium } from './browser-harness.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
// Render the production WGSL inlay on six flat faces and count connected pips.

(async () => {
  fs.mkdirSync('artifacts', { recursive: true });
  const inlay = fs
    .readFileSync('webgpu-renderer.js', 'utf8')
    .match(/fn inlay\(p:vec3f\)[\s\S]*?(?=\s*@fragment fn backFS)/)?.[0];
  assert.ok(inlay, 'production inlay shader must be available');
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--enable-unsafe-webgpu', '--use-angle=d3d11'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 768, height: 512 } }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto('http://localhost:3000');
    await page.waitForFunction(() => sceneRenderer.ready);
    const counts = await page.evaluate(async (inlay) => {
      window.requestAnimationFrame = () => 0;
      const device = sceneRenderer.device,
        width = 768,
        height = 512,
        side = 256;
      const module = device.createShaderModule({
        code:
          inlay +
          `
    @vertex fn vs(@builtin(vertex_index) id:u32)->@builtin(position) vec4f{
     let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));return vec4f(p[id],0,1);
    }
    @fragment fn fs(@builtin(position) position:vec4f)->@location(0) vec4f{
     let cell=vec2u(position.xy/256.);let id=cell.x+cell.y*3u;
     let uv=(fract(position.xy/256.)-vec2f(.5))*.76;var p:vec3f;
     switch id {
      case 0u:{p=vec3f(.38,uv.y,uv.x);}
      case 1u:{p=vec3f(-.38,uv.y,uv.x);}
      case 2u:{p=vec3f(uv.x,.38,uv.y);}
      case 3u:{p=vec3f(uv.x,-.38,uv.y);}
      case 4u:{p=vec3f(uv.x,uv.y,.38);}
      default:{p=vec3f(uv.x,uv.y,-.38);}
     }
     return vec4f(vec3f(inlay(p)),1.);
    }
   `,
      });
      const info = await module.getCompilationInfo();
      if (info.messages.some((m) => m.type === 'error'))
        throw Error(info.messages.map((m) => m.message).join('\n'));
      const pipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: { module, entryPoint: 'vs' },
        fragment: { module, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] },
        primitive: { topology: 'triangle-list' },
      });
      const texture = device.createTexture({
        size: [width, height],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
      const buffer = device.createBuffer({
        size: width * height * 4,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      const encoder = device.createCommandEncoder(),
        pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: texture.createView(),
              clearValue: { r: 0, g: 0, b: 0, a: 1 },
              loadOp: 'clear',
              storeOp: 'store',
            },
          ],
        });
      pass.setPipeline(pipeline);
      pass.draw(3);
      pass.end();
      encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow: width * 4 }, [width, height]);
      device.queue.submit([encoder.finish()]);
      await buffer.mapAsync(GPUMapMode.READ);
      const pixels = new Uint8Array(buffer.getMappedRange()).slice();
      buffer.unmap();
      const counts = [];
      for (let face = 0; face < 6; face++) {
        const visited = new Uint8Array(side * side),
          ox = (face % 3) * side,
          oy = Math.floor(face / 3) * side;
        const bright = (i) =>
          pixels[((oy + Math.floor(i / side)) * width + ox + (i % side)) * 4] > 127;
        let count = 0;
        for (let i = 0; i < side * side; i++) {
          if (visited[i] || !bright(i)) continue;
          count++;
          visited[i] = 1;
          const pending = [i];
          while (pending.length) {
            const k = pending.pop(),
              x = k % side,
              y = Math.floor(k / side);
            for (const [dx, dy] of [
              [-1, 0],
              [1, 0],
              [0, -1],
              [0, 1],
            ]) {
              const nx = x + dx,
                ny = y + dy;
              if (nx < 0 || nx >= side || ny < 0 || ny >= side) continue;
              const n = ny * side + nx;
              if (!visited[n] && bright(n)) {
                visited[n] = 1;
                pending.push(n);
              }
            }
          }
        }
        counts.push(count);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.style.cssText = 'position:fixed;inset:0;z-index:99999;width:768px;height:512px';
      canvas
        .getContext('2d')
        .putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
      document.body.append(canvas);
      texture.destroy();
      buffer.destroy();
      return counts;
    }, inlay);
    assert.deepEqual(
      counts,
      [3, 4, 1, 6, 2, 5],
      '+X/-X, +Y/-Y and +Z/-Z must carry the right pip values',
    );
    assert.deepEqual(
      [...counts].sort((a, b) => a - b),
      [1, 2, 3, 4, 5, 6],
    );
    for (let i = 0; i < 6; i += 2) assert.equal(counts[i] + counts[i + 1], 7);
    await page.screenshot({ path: 'artifacts/dice-six-face-audit.png' });
    assert.deepEqual(await page.evaluate(() => sceneRenderer.errors), []);
    assert.deepEqual(errors, []);
    await page.reload();
    await page.waitForFunction(() => sceneRenderer.ready);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => {
      reset();
      players.forEach((p, i) =>
        Object.assign(p, { x: 2 + i * 1.5, y: 2, z: 7, rx: 2 + i * 1.5, rz: 7 }),
      );
      soft.reset();
      focusPlayer(1);
      camera.x = 3.5;
      camera.z = 7;
      camera.mode = 'ortho';
      camera.pitch = 30;
      zoom = 1.8;
      resize();
      won = true;
    });
    for (let q = 0; q < 4; q++) {
      await page.evaluate((q) => {
        angle = targetAngle = (q * Math.PI) / 2;
      }, q);
      await page.waitForTimeout(220);
      await page.screenshot({ path: `artifacts/jelly-dice-faces-${q}.png` });
    }
    assert.deepEqual(await page.evaluate(() => sceneRenderer.errors), []);
    assert.deepEqual(errors, []);
    console.log(
      'PASS: actual GPU pip counts +X/-X/+Y/-Y/+Z/-Z = ' +
        counts.join('/') +
        '; all 1..6 exactly once, opposites sum to seven, four jelly views without GPU/browser errors.',
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
