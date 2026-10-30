import Levels from '../world/levels.js';
import {
  PORTAL_LIMIT,
  PORTAL_FLOATS,
  GOALS_OFFSET,
  TORCHES_OFFSET,
  BODY3_OFFSET,
  BODY4_OFFSET,
  BODY_SLOTS_OFFSET,
  FINISH_OFFSET,
  GOAL_SLOTS_OFFSET,
  SCENE_FLOATS,
} from './layout.js';
import { dot, normalize, viewMatrix, cameraFrame } from './math.js';
import { assemblyDropOffset } from './assembly.js';
import { portalRing } from './geometry/mechanisms.js';
import { colliderLines, surfaceBindings } from './geometry/surfaces.js';
import { shared } from './shaders/shared.js';
import { skin } from './shaders/skin.js';
import { compute } from './shaders/compute.js';
import { post, BLOOM_LEVELS, bloomShader } from './shaders/post.js';
import { latticeShader, colliderShader } from './shaders/debug.js';
import { sceneMethods } from './scene.js';
import { propsMethods } from './props.js';
import { effectsMethods } from './effects.js';
class Renderer {
  constructor(canvas, soft) {
    this.canvas = canvas;
    this.soft = soft;
    this.ready = false;
    this.error = null;
    this.mesh = false;
    this.grain = true;
    this.dust = true;
    this.grainStrength = 1;
    this.grainSize = 1;
    this.dustDensity = 1;
    this.dustSpeed = 1;
    this.filmData = new Float32Array(4);
    this.frames = 0;
    this.errors = [];
  }
  async init() {
    this.onProgress?.(0.05, 'loadingGraphics');
    if (!navigator.gpu)
      throw Error(
        'В этом браузере нет WebGPU. Откройте игру в актуальном Chrome или Edge с аппаратным ускорением.',
      );
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter)
      throw Error('Браузер не предоставил WebGPU-адаптер. Проверьте аппаратное ускорение.');
    const d = (this.device = await adapter.requestDevice());
    this.adapterInfo = adapter.info;
    this.onProgress?.(0.18, 'loadingShaders');
    d.addEventListener('uncapturederror', (e) => {
      this.errors.push(e.error.message);
      console.error(e.error.message);
    });
    d.lost.then((info) => {
      this.ready = false;
      this.error = info.message || 'Соединение с графическим устройством потеряно.';
      this.onFailure?.(this.error);
    });
    this.context = this.canvas.getContext('webgpu');
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({ device: d, format: this.format, alphaMode: 'opaque' });
    const module = async (label, code) => {
      const m = d.createShaderModule({ label, code });
      const info = await m.getCompilationInfo();
      const errors = info.messages.filter((x) => x.type === 'error');
      if (errors.length) throw Error(label + ': ' + errors.map((e) => e.message).join('\n'));
      return m;
    };
    const main = await module('Dungeon and candy', shared + skin),
      deform = await module('Cofactor deformation', compute),
      finish = await module('Khronos PBR Neutral', post),
      lattice = await module('XPBD lattice overlay', latticeShader),
      collider = await module('Level collision overlay', colliderShader),
      bloom = await module('Bloom', bloomShader);
    this.onProgress?.(0.4, 'loadingScene');
    this.uniform = this.buffer(
      new Float32Array(SCENE_FLOATS),
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    );
    const bindings = surfaceBindings(this.soft);
    this.bindingCount = bindings.count;
    this.bindBuffer = this.buffer(bindings.vertices, GPUBufferUsage.STORAGE);
    this.indexBuffer = this.buffer(bindings.indices, GPUBufferUsage.INDEX);
    this.indexCount = bindings.indices.length;
    this.nodes = this.buffer(
      new Float32Array(320 * 4),
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    );
    this.restNodes = this.buffer(
      new Float32Array(this.soft.rest.flatMap((p) => [...p, 0])),
      GPUBufferUsage.STORAGE,
    );
    this.deformed = d.createBuffer({
      size: 6750 * 48,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX,
    });
    this.compute = d.createComputePipeline({
      layout: 'auto',
      compute: { module: deform, entryPoint: 'deform' },
    });
    this.computeGroup = d.createBindGroup({
      layout: this.compute.getBindGroupLayout(0),
      entries: [this.nodes, this.restNodes, this.bindBuffer, this.deformed].map(
        (buffer, binding) => ({ binding, resource: { buffer } }),
      ),
    });
    this.sceneLayout = d.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'comparison' } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 6, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });
    this.skinLayout = d.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });
    const layout = d.createPipelineLayout({
      bindGroupLayouts: [this.sceneLayout, this.skinLayout],
    });
    const vertexBuffers = [
      {
        arrayStride: 48,
        attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' },
          { shaderLocation: 1, offset: 12, format: 'float32x3' },
          { shaderLocation: 2, offset: 24, format: 'float32x3' },
          { shaderLocation: 3, offset: 36, format: 'float32x3' },
        ],
      },
    ];
    const pipeline = (
      vertexEntry,
      fragmentEntry,
      cullMode = 'back',
      samples = 4,
      depthCompare = 'less',
      depthWrite = true,
      blend = undefined,
      buffers = [
        'solidVS',
        'portalHaloVS',
        'portalRingVS',
        'goalBeamVS',
        'goalGlowVS',
        'goalSealVS',
      ].includes(vertexEntry)
        ? vertexBuffers
        : [],
    ) =>
      d.createRenderPipeline({
        layout,
        vertex: { module: main, entryPoint: vertexEntry, buffers },
        fragment: {
          module: main,
          entryPoint: fragmentEntry,
          targets: [{ format: 'rgba16float', blend }],
        },
        primitive: { topology: 'triangle-list', cullMode, frontFace: 'ccw' },
        depthStencil: { format: 'depth32float', depthWriteEnabled: depthWrite, depthCompare },
        multisample: { count: samples },
      });
    this.opaque = pipeline('solidVS', 'solidFS');
    const assemblyBuffers = [
      ...vertexBuffers,
      { arrayStride: 16, attributes: [{ shaderLocation: 4, offset: 0, format: 'float32x4' }] },
    ];
    this.stonePipeline = pipeline(
      'assemblyVS',
      'stoneFS',
      'back',
      4,
      'less',
      true,
      undefined,
      assemblyBuffers,
    );
    this.assemblyOpaque = pipeline(
      'assemblyVS',
      'solidFS',
      'back',
      4,
      'less',
      true,
      undefined,
      assemblyBuffers,
    );
    this.skin = pipeline('softVS', 'skinFS');
    this.back = pipeline('softVS', 'backFS', 'front', 1, 'greater');
    this.effectPipeline = pipeline('solidVS', 'effectFS', 'back', 4, 'less', false, {
      color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    });
    this.phasePipeline = pipeline(
      'assemblyVS',
      'phaseFS',
      'back',
      4,
      'less',
      false,
      {
        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      },
      assemblyBuffers,
    );
    const crystalBlend = {
      color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    };
    this.crystalBackPipeline = pipeline(
      'solidVS',
      'crystalFS',
      'front',
      4,
      'less',
      false,
      crystalBlend,
    );
    this.crystalPipeline = pipeline('solidVS', 'crystalFS', 'back', 4, 'less', false, crystalBlend);
    const additive = {
      color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    };
    this.runePipeline = pipeline('runeVS', 'runeFS', 'none', 4, 'less', false, additive, [
      vertexBuffers[0],
      {
        arrayStride: 48,
        stepMode: 'instance',
        attributes: [
          { shaderLocation: 4, offset: 0, format: 'float32x4' },
          { shaderLocation: 5, offset: 16, format: 'float32x4' },
          { shaderLocation: 6, offset: 32, format: 'float32x4' },
        ],
      },
    ]);
    this.runeData = new Float32Array(32 * 12);
    this.runeBuffer = d.createBuffer({
      size: this.runeData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.beamPipeline = pipeline('beamVS', 'beamFS', 'none', 4, 'less', false, additive, [
      {
        arrayStride: 48,
        stepMode: 'instance',
        attributes: [
          { shaderLocation: 4, offset: 0, format: 'float32x4' },
          { shaderLocation: 5, offset: 16, format: 'float32x4' },
          { shaderLocation: 6, offset: 32, format: 'float32x4' },
        ],
      },
    ]);
    this.beamData = new Float32Array(16 * 12);
    this.beamBuffer = d.createBuffer({
      size: this.beamData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.dustPipeline = pipeline('dustVS', 'dustFS', 'none', 4, 'less', false, additive, [
      {
        arrayStride: 16,
        stepMode: 'instance',
        attributes: [{ shaderLocation: 4, offset: 0, format: 'float32x4' }],
      },
    ]);
    this.dustData = new Float32Array(192 * 4);
    this.dustBuffer = d.createBuffer({
      size: this.dustData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.portalHaloPipeline = pipeline(
      'portalHaloVS',
      'portalFXFS',
      'none',
      4,
      'less',
      false,
      additive,
    );
    this.portalRingPipeline = pipeline(
      'portalRingVS',
      'portalFXFS',
      'back',
      4,
      'less',
      false,
      additive,
    );
    this.goalBeamPipeline = pipeline(
      'goalBeamVS',
      'goalBeamFS',
      'none',
      4,
      'less',
      false,
      additive,
    );
    this.goalGlowPipeline = pipeline(
      'goalGlowVS',
      'portalFXFS',
      'none',
      4,
      'less',
      false,
      additive,
    );
    this.goalSealPipeline = pipeline(
      'goalSealVS',
      'goalSealFS',
      'none',
      4,
      'less',
      false,
      additive,
    );
    const glow = {
      color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
      alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' },
    };
    this.flamePipeline = pipeline('flameVS', 'flameFS', 'none', 4, 'less', false, glow, [
      vertexBuffers[0],
    ]);
    const ring = [];
    portalRing(ring, 0, 0, 0, [1, 1, 1]);
    this.portalRingCount = ring.length / 12;
    this.portalRingBuffer = this.buffer(new Float32Array(ring), GPUBufferUsage.VERTEX);
    const halo = [];
    for (const p of [
      [-1, 0, -1],
      [1, 0, 1],
      [1, 0, -1],
      [-1, 0, -1],
      [-1, 0, 1],
      [1, 0, 1],
    ])
      halo.push(...p, 0, 1, 0, 1, 1, 1, 0, 0, 0);
    this.portalHaloBuffer = this.buffer(new Float32Array(halo), GPUBufferUsage.VERTEX);
    this.shadow = d.createRenderPipeline({
      layout: d.createPipelineLayout({ bindGroupLayouts: [this.sceneLayout] }),
      vertex: { module: main, entryPoint: 'shadowVS', buffers: vertexBuffers },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' },
    });
    this.assemblyShadow = d.createRenderPipeline({
      layout: d.createPipelineLayout({ bindGroupLayouts: [this.sceneLayout] }),
      vertex: { module: main, entryPoint: 'assemblyShadowVS', buffers: assemblyBuffers },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' },
    });
    this.post = d.createRenderPipeline({
      layout: 'auto',
      vertex: { module: finish, entryPoint: 'postVS' },
      fragment: { module: finish, entryPoint: 'postFS', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list' },
    });
    this.filmUniform = this.buffer(this.filmData, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
    this.bloomLayout = d.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });
    const bloomLayout = d.createPipelineLayout({ bindGroupLayouts: [this.bloomLayout] });
    const bloomPipeline = (entryPoint, blend) =>
      d.createRenderPipeline({
        layout: bloomLayout,
        vertex: { module: bloom, entryPoint: 'bloomVS' },
        fragment: { module: bloom, entryPoint, targets: [{ format: 'rgba16float', blend }] },
        primitive: { topology: 'triangle-list' },
      });
    this.bloomPrefilter = bloomPipeline('bloomPrefilterFS');
    this.bloomDown = bloomPipeline('bloomDownFS');
    this.bloomUp = bloomPipeline('bloomUpFS', {
      color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
    });
    this.latticePipeline = d.createRenderPipeline({
      layout: 'auto',
      vertex: { module: lattice, entryPoint: 'latticeVS' },
      fragment: {
        module: lattice,
        entryPoint: 'latticeFS',
        targets: [
          {
            format: 'rgba16float',
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
            },
          },
        ],
      },
      primitive: { topology: 'line-list' },
      multisample: { count: 4 },
    });
    const edgeData = new Uint32Array(this.soft.edges.flatMap((e) => [e.a, e.b]));
    this.edgeCount = edgeData.length;
    this.edgeBuffer = this.buffer(edgeData, GPUBufferUsage.STORAGE);
    this.latticeGroup = d.createBindGroup({
      layout: this.latticePipeline.getBindGroupLayout(0),
      entries: [this.uniform, this.nodes, this.edgeBuffer].map((buffer, binding) => ({
        binding,
        resource: { buffer },
      })),
    });
    this.colliderPipeline = d.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: collider,
        entryPoint: 'colliderVS',
        buffers: [
          {
            arrayStride: 24,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' },
              { shaderLocation: 1, offset: 12, format: 'float32x3' },
            ],
          },
        ],
      },
      fragment: {
        module: collider,
        entryPoint: 'colliderFS',
        targets: [
          {
            format: 'rgba16float',
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
            },
          },
        ],
      },
      primitive: { topology: 'line-list' },
      multisample: { count: 4 },
    });
    this.colliderGroup = d.createBindGroup({
      layout: this.colliderPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.uniform } }],
    });
    this.colliderBuffer = d.createBuffer({
      size: 256000,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.shadowTexture = d.createTexture({
      size: [1024, 1024],
      format: 'depth32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.sampler = d.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this.compareSampler = d.createSampler({
      compare: 'less',
      magFilter: 'linear',
      minFilter: 'linear',
    });
    this.onProgress?.(0.65, 'loadingTextures');
    let texturesLoaded = 0;
    [this.stoneTexture, this.woodTexture] = await Promise.all(
      ['dungeon-stone-atlas.png', 'crate-oak.png'].map(async (name) => {
        const texture = await this.loadMaterialTexture('assets/materials/' + name);
        this.onProgress?.(0.65 + ++texturesLoaded * 0.12, 'loadingTextures');
        return texture;
      }),
    );
    this.materialSampler = d.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
      maxAnisotropy: 4,
    });
    const materialEntries = [
      { binding: 4, resource: this.stoneTexture.createView() },
      { binding: 5, resource: this.woodTexture.createView() },
      { binding: 6, resource: this.materialSampler },
    ];
    this.sceneGroup = d.createBindGroup({
      layout: this.sceneLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniform } },
        { binding: 1, resource: { buffer: this.deformed } },
        { binding: 2, resource: this.shadowTexture.createView() },
        { binding: 3, resource: this.compareSampler },
        ...materialEntries,
      ],
    });
    // A distinct unsampled depth texture avoids attachment/sampling hazards in the shadow pass.
    this.dummyShadow = d.createTexture({
      size: [1, 1],
      format: 'depth32float',
      usage: GPUTextureUsage.TEXTURE_BINDING,
    });
    this.shadowGroup = d.createBindGroup({
      layout: this.sceneLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniform } },
        { binding: 1, resource: { buffer: this.deformed } },
        { binding: 2, resource: this.dummyShadow.createView() },
        { binding: 3, resource: this.compareSampler },
        ...materialEntries,
      ],
    });
    this.staticBuffer = d.createBuffer({
      size: 4e6,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.phaseBuffer = d.createBuffer({
      size: 65536,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.phaseFaces = [];
    this.propBuffer = d.createBuffer({
      size: 2e6,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.bridgeBuffer = d.createBuffer({
      size: 1e6,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.effectBuffer = d.createBuffer({
      size: 4e6,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.decorationBuffer = d.createBuffer({
      size: 2e6,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.ready = true;
    this.onProgress?.(1, 'loadingReady');
    return this;
  }
  buffer(data, usage) {
    const b = this.device.createBuffer({
      size: Math.max(4, data.byteLength),
      usage,
      mappedAtCreation: true,
    });
    new Uint8Array(b.getMappedRange()).set(
      new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    );
    b.unmap();
    return b;
  }
  async loadMaterialTexture(url) {
    const response = await fetch(url);
    if (!response.ok) throw Error('Cannot load material: ' + url);
    const bitmap = await createImageBitmap(await response.blob()),
      { width, height } = bitmap,
      mipLevelCount = 1 + Math.floor(Math.log2(Math.max(width, height)));
    const texture = this.device.createTexture({
      label: url,
      size: [width, height],
      mipLevelCount,
      format: 'rgba8unorm-srgb',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    for (let mip = 0; mip < mipLevelCount; mip++) {
      const w = Math.max(1, width >> mip),
        h = Math.max(1, height >> mip),
        canvas = new OffscreenCanvas(w, h),
        ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0, w, h);
      this.device.queue.copyExternalImageToTexture({ source: canvas }, { texture, mipLevel: mip }, [
        w,
        h,
      ]);
    }
    bitmap.close();
    return texture;
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect(),
      width = Math.max(1, rect.width),
      height = Math.max(1, rect.height);
    const ratio = Math.min(devicePixelRatio || 1, 1.25, Math.sqrt(2e6 / (width * height))),
      w = Math.max(1, Math.round(width * ratio)),
      h = Math.max(1, Math.round(height * ratio));
    if (this.canvas.width === w && this.canvas.height === h && this.hdr) return;
    this.canvas.width = w;
    this.canvas.height = h;
    const d = this.device;
    for (const t of [
      this.hdr,
      this.background,
      this.msaa,
      this.depth,
      this.exitDepth,
      ...(this.exits || []),
      ...(this.bloomTextures || []),
    ])
      t?.destroy();
    const create = (format, sampleCount = 1, extra = 0) =>
      d.createTexture({
        size: [w, h],
        format,
        sampleCount,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | extra,
      });
    this.hdr = create('rgba16float', 1, GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC);
    this.background = create(
      'rgba16float',
      1,
      GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    );
    this.msaa = create('rgba16float', 4);
    this.depth = create('depth32float', 4);
    this.exitDepth = create('depth32float');
    this.exits = Array.from({ length: 5 }, () =>
      create('rgba16float', 1, GPUTextureUsage.TEXTURE_BINDING),
    );
    this.skinGroups = this.exits.map((t) =>
      d.createBindGroup({
        layout: this.skinLayout,
        entries: [
          { binding: 0, resource: this.background.createView() },
          { binding: 1, resource: t.createView() },
          { binding: 2, resource: this.sampler },
        ],
      }),
    );
    this.bloomTextures = [];
    for (let i = 0, bw = w >> 1, bh = h >> 1; i < BLOOM_LEVELS; i++) {
      bw = Math.max(1, bw >> 1);
      bh = Math.max(1, bh >> 1);
      this.bloomTextures.push(
        d.createTexture({
          size: [bw, bh],
          format: 'rgba16float',
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        }),
      );
    }
    this.bloomViews = this.bloomTextures.map((t) => t.createView());
    const bloomGroup = (view) =>
      d.createBindGroup({
        layout: this.bloomLayout,
        entries: [
          { binding: 0, resource: view },
          { binding: 1, resource: this.sampler },
        ],
      });
    // Down pass i reads the previous level (the HDR scene for i=0); up pass i reads level i.
    this.bloomDownGroups = [this.hdr.createView(), ...this.bloomViews.slice(0, -1)].map(bloomGroup);
    this.bloomUpGroups = this.bloomViews.map(bloomGroup);
    this.postGroup = d.createBindGroup({
      layout: this.post.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.hdr.createView() },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: this.bloomViews[0] },
        { binding: 3, resource: { buffer: this.filmUniform } },
      ],
    });
  }
  encodeBloom(encoder) {
    const pass = (view, loadOp) =>
      encoder.beginRenderPass({
        colorAttachments: [
          { view, loadOp, clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: 'store' },
        ],
      });
    this.bloomViews.forEach((view, i) => {
      const p = pass(view, 'clear');
      p.setPipeline(i ? this.bloomDown : this.bloomPrefilter);
      p.setBindGroup(0, this.bloomDownGroups[i]);
      p.draw(3);
      p.end();
    });
    for (let i = this.bloomViews.length - 1; i > 0; i--) {
      const p = pass(this.bloomViews[i - 1], 'load');
      p.setPipeline(this.bloomUp);
      p.setBindGroup(0, this.bloomUpGroups[i]);
      p.draw(3);
      p.end();
    }
  }
  render(level, players, camera, angle, time, scale, dt = 1 / 60) {
    if (!this.ready) return;
    this.resize();
    const d = this.device,
      w = this.canvas.width,
      h = this.canvas.height;
    const rect = this.canvas.getBoundingClientRect(),
      frame = (this.cameraState = cameraFrame(camera, angle, rect.width, rect.height, scale)),
      { vp, view, eye } = frame;
    const extent = level.definition?.size ?? 12,
      lightVP = viewMatrix(
        [(extent - 1) * 0.5, 0, (extent - 1) * 0.5],
        normalize([-0.45, 1, 0.35]),
        Math.max(18, extent + 4),
        Math.max(18, extent + 4),
      );
    if (this.bridgeKey === undefined) {
      this.buildScene(level);
      this.bridgeKey = 'static';
    }
    const uniforms = new Float32Array(SCENE_FLOATS);
    uniforms.set(vp);
    uniforms.set(lightVP, 16);
    uniforms.set([...eye, frame.perspective ? 1 : 0], 32);
    uniforms.set([-2, 12, 9, 1], 36);
    uniforms[FINISH_OFFSET] = Math.max(0, Math.min(1, level.finishProgress || 0));
    uniforms[FINISH_OFFSET + 1] = this.fogBase ?? 0;
    uniforms[FINISH_OFFSET + 2] = level.assembly?.progress ?? 1;
    (level.world.torches || [])
      .slice(0, 8)
      .forEach((p, i) => uniforms.set([...Levels.torchFrame(p).light, 1], TORCHES_OFFSET + i * 4));
    players.forEach((p, i) =>
      uniforms.set(
        [
          p.x,
          (p.y || 0) + 0.42,
          p.z,
          level.assembly || p.state === 'dead'
            ? 0
            : 4 + (level.world.heightAt(p.x, p.z, (p.y || 0) + 0.2, p) || 0),
        ],
        i === 4 ? BODY4_OFFSET : i === 3 ? BODY3_OFFSET : 40 + i * 4,
      ),
    );
    uniforms.set([w, h, time, this.dustSpeed], 52);
    this.updatePortalVisuals(level, players, dt);
    level.world.portals.slice(0, PORTAL_LIMIT).forEach((p, i) => {
      const state = this.portalStates[i],
        offset = 56 + i * PORTAL_FLOATS;
      uniforms.set([p.x, p.y ?? level.world.heightAt(p.x, p.z) ?? 0, p.z, state.charge], offset);
      uniforms.set([...Levels.portalColor(p.color).glow, state.offset], offset + 4);
      uniforms.set([state.active, state.phase, 0, 0], offset + 8);
    });
    this.goalGlowStrength ??= [];
    this.goalWinGlow ??= 0;
    const fade = level.reducedMotion ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * 8),
      celebrate = level.reducedMotion ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * 4);
    this.goalWinGlow += ((level.won ? 1 : 0) - this.goalWinGlow) * celebrate;
    level.goals.slice(0, 5).forEach((g, i) => {
      if (!g) return;
      const player = players.find((p, j) => (p.slot ?? j) === (g.slot ?? i)),
        target = level.world.goalCharge(g, player);
      this.goalGlowStrength[i] =
        (this.goalGlowStrength[i] || 0) + (target - (this.goalGlowStrength[i] || 0)) * fade;
      uniforms.set(
        [g.x, g.y ?? level.world.heightAt(g.x, g.z) ?? 0, g.z, this.goalGlowStrength[i]],
        GOALS_OFFSET + i * 8,
      );
      uniforms.set(
        [
          ...[
            [0.45, 1, 0.08],
            [0.035, 0.17, 1],
            [1, 0.055, 0.025],
            [0.68, 0.12, 1],
            [1, 0.65, 0.025],
          ][g.slot ?? i],
          this.goalWinGlow,
        ],
        GOALS_OFFSET + 4 + i * 8,
      );
      uniforms[GOAL_SLOTS_OFFSET + i] = player ? (g.slot ?? i) : -1;
    });
    players.forEach((p, i) => (uniforms[BODY_SLOTS_OFFSET + i] = p.slot ?? i));
    d.queue.writeBuffer(this.uniform, 0, uniforms);
    this.filmData.set([
      time,
      this.grain ? 0.045 * this.grainStrength : 0,
      1.35 * this.grainSize,
      0,
    ]);
    d.queue.writeBuffer(this.filmUniform, 0, this.filmData);
    const nodes = new Float32Array(320 * 4);
    for (let i = 0; i < 5; i++) nodes[i * 256 + 3] = -1;
    const landingCount =
      level.plates.length +
      players.length +
      (level.crates || []).length +
      level.world.pickups.length +
      level.world.archers.length +
      (level.world.drones || []).length;
    players.forEach((p, i) => {
      const dropOffset = assemblyDropOffset(level.assembly, level.plates.length + i, landingCount);
      level.soft
        .get(p)
        .positions.forEach((q, j) =>
          nodes.set(
            [
              q[0],
              p.state === 'dead' || dropOffset === null ? -100 : q[1] + dropOffset,
              q[2],
              p.slot ?? i,
            ],
            (i * 64 + j) * 4,
          ),
        );
    });
    d.queue.writeBuffer(this.nodes, 0, nodes);
    const assembling = !!level.assembly,
      bridgeDraw = assembling ? { opaqueCount: 0, spectralCount: 0 } : this.bridges(level),
      propCount = this.props(level, players, angle, time, dt),
      effectCount = this.effects(level.effects, view);
    this.updateRunes(level.effects, level);
    this.updateBeams(level);
    const encoder = d.createCommandEncoder();
    const computePass = encoder.beginComputePass();
    computePass.setPipeline(this.compute);
    computePass.setBindGroup(0, this.computeGroup);
    computePass.dispatchWorkgroups(Math.ceil((players.length * 1350) / 64));
    computePass.end();
    const shadowPass = encoder.beginRenderPass({
      colorAttachments: [],
      depthStencilAttachment: {
        view: this.shadowTexture.createView(),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });
    // Only masonry casts shadows: tiny decor shadows are invisible, and half-buried pebbles
    // made this depth-only pass about 6 ms slower on an integrated Radeon.
    shadowPass.setPipeline(this.assemblyShadow);
    shadowPass.setBindGroup(0, this.shadowGroup);
    shadowPass.setVertexBuffer(0, this.staticBuffer);
    shadowPass.setVertexBuffer(1, this.assemblyBuffer);
    shadowPass.draw(this.stoneCount);
    if (bridgeDraw.opaqueCount) {
      shadowPass.setPipeline(this.shadow);
      shadowPass.setVertexBuffer(0, this.bridgeBuffer);
      shadowPass.draw(bridgeDraw.opaqueCount);
    }
    shadowPass.end();
    const opaque = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.msaa.createView(),
          resolveTarget: this.hdr.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: {
        view: this.depth.createView(),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });
    opaque.setBindGroup(0, this.sceneGroup);
    opaque.setBindGroup(1, this.skinGroups[0]);
    opaque.setVertexBuffer(0, this.staticBuffer);
    if (this.stoneCount) {
      opaque.setPipeline(this.stonePipeline);
      opaque.setVertexBuffer(1, this.assemblyBuffer);
      opaque.draw(this.stoneCount);
    }
    opaque.setPipeline(assembling ? this.assemblyOpaque : this.opaque);
    if (this.staticCount > this.stoneCount)
      opaque.draw(this.staticCount - this.stoneCount, 1, this.stoneCount);
    opaque.setPipeline(this.opaque);
    if (bridgeDraw.opaqueCount) {
      opaque.setVertexBuffer(0, this.bridgeBuffer);
      opaque.draw(bridgeDraw.opaqueCount);
    }
    opaque.setVertexBuffer(0, this.propBuffer);
    opaque.draw(propCount);
    opaque.setVertexBuffer(0, this.decorationBuffer);
    if (!assembling) opaque.draw(this.decorationCount);
    const torchCount = assembling ? 0 : Math.min(8, (level.world.torches || []).length);
    if (torchCount) {
      opaque.setPipeline(this.flamePipeline);
      opaque.setVertexBuffer(0, this.portalHaloBuffer);
      opaque.draw(6, torchCount);
    }
    opaque.end();
    if (bridgeDraw.spectralCount) {
      const spectral = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: this.msaa.createView(),
            resolveTarget: this.hdr.createView(),
            loadOp: 'load',
            storeOp: 'store',
          },
        ],
        depthStencilAttachment: {
          view: this.depth.createView(),
          depthLoadOp: 'load',
          depthStoreOp: 'store',
        },
      });
      spectral.setPipeline(this.effectPipeline);
      spectral.setBindGroup(0, this.sceneGroup);
      spectral.setBindGroup(1, this.skinGroups[0]);
      spectral.setVertexBuffer(0, this.bridgeBuffer);
      spectral.draw(bridgeDraw.spectralCount, 1, bridgeDraw.opaqueCount);
      spectral.end();
    }
    const order = players.flatMap((p, i) => {
      const dropOffset = assemblyDropOffset(level.assembly, level.plates.length + i, landingCount);
      return p.state === 'dead' || dropOffset === null
        ? []
        : [{ kind: 'jelly', i, center: [p.x, (p.y || 0) + 0.42 + dropOffset, p.z] }];
    });
    order.push(...this.crystalPieces);
    for (const face of this.phaseFaces)
      if (
        dot(
          face.normal,
          eye.map((v, k) => v - face.center[k]),
        ) > 0
      )
        order.push(face);
    order.sort((a, b) => dot(a.center, view) - dot(b.center, view));
    const layerPass = () =>
      encoder.beginRenderPass({
        colorAttachments: [
          {
            view: this.msaa.createView(),
            resolveTarget: this.hdr.createView(),
            loadOp: 'load',
            storeOp: 'store',
          },
        ],
        depthStencilAttachment: {
          view: this.depth.createView(),
          depthLoadOp: 'load',
          depthStoreOp: 'store',
        },
      });
    for (let layer = 0; layer < order.length; layer++) {
      if (order[layer].kind === 'crystal') {
        const glass = layerPass(),
          crystal = order[layer];
        glass.setBindGroup(0, this.sceneGroup);
        glass.setBindGroup(1, this.skinGroups[0]);
        glass.setVertexBuffer(0, this.propBuffer);
        glass.setPipeline(this.crystalBackPipeline);
        glass.draw(crystal.count, 1, crystal.first);
        glass.setPipeline(this.crystalPipeline);
        glass.draw(crystal.count, 1, crystal.first);
        if (layer === order.length - 1) this.drawEffects(glass, level, effectCount);
        glass.end();
        continue;
      }
      if (order[layer].kind === 'phase') {
        const glass = layerPass();
        glass.setPipeline(this.phasePipeline);
        glass.setBindGroup(0, this.sceneGroup);
        glass.setBindGroup(1, this.skinGroups[0]);
        glass.setVertexBuffer(0, this.phaseBuffer);
        glass.setVertexBuffer(1, this.phaseAssemblyBuffer);
        do {
          const face = order[layer];
          glass.draw(face.count, 1, face.first);
          layer++;
        } while (layer < order.length && order[layer].kind === 'phase');
        if (layer === order.length) this.drawEffects(glass, level, effectCount);
        layer--;
        glass.end();
        continue;
      }
      const i = order[layer].i;
      const backPass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: this.exits[i].createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
        depthStencilAttachment: {
          view: this.exitDepth.createView(),
          depthClearValue: 0,
          depthLoadOp: 'clear',
          depthStoreOp: 'store',
        },
      });
      backPass.setPipeline(this.back);
      backPass.setBindGroup(0, this.sceneGroup);
      backPass.setBindGroup(1, this.skinGroups[(i + 1) % 5]);
      backPass.setIndexBuffer(this.indexBuffer, 'uint32');
      backPass.drawIndexed(this.indexCount, 1, 0, 0, i);
      backPass.end();
      encoder.copyTextureToTexture({ texture: this.hdr }, { texture: this.background }, [w, h]);
      const skin = layerPass();
      skin.setPipeline(this.skin);
      skin.setBindGroup(0, this.sceneGroup);
      skin.setBindGroup(1, this.skinGroups[i]);
      skin.setIndexBuffer(this.indexBuffer, 'uint32');
      skin.drawIndexed(this.indexCount, 1, 0, 0, i);
      if (layer === order.length - 1) this.drawEffects(skin, level, effectCount);
      skin.end();
    }
    if (
      !order.length &&
      (effectCount ||
        this.beamCount ||
        (this.dust && this.dustCount) ||
        level.world.portals.length ||
        level.goals.length)
    ) {
      const effects = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: this.msaa.createView(),
            resolveTarget: this.hdr.createView(),
            loadOp: 'load',
            storeOp: 'store',
          },
        ],
        depthStencilAttachment: {
          view: this.depth.createView(),
          depthLoadOp: 'load',
          depthStoreOp: 'store',
        },
      });
      this.drawEffects(effects, level, effectCount);
      effects.end();
    }
    if (this.mesh) {
      const lattice = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: this.msaa.createView(),
            resolveTarget: this.hdr.createView(),
            loadOp: 'load',
            storeOp: 'store',
          },
        ],
      });
      lattice.setPipeline(this.latticePipeline);
      lattice.setBindGroup(0, this.latticeGroup);
      lattice.draw(this.edgeCount, players.length);
      lattice.end();
    }
    if (this.colliders) {
      const lines = colliderLines(level.world.debugBoxes());
      if (lines.byteLength > this.colliderBuffer.size) {
        this.colliderBuffer.destroy();
        this.colliderBuffer = d.createBuffer({
          size: Math.ceil(lines.byteLength / 65536) * 65536,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
      }
      d.queue.writeBuffer(this.colliderBuffer, 0, lines);
      const debug = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: this.msaa.createView(),
            resolveTarget: this.hdr.createView(),
            loadOp: 'load',
            storeOp: 'store',
          },
        ],
      });
      debug.setPipeline(this.colliderPipeline);
      debug.setBindGroup(0, this.colliderGroup);
      debug.setVertexBuffer(0, this.colliderBuffer);
      debug.draw(lines.length / 6);
      debug.end();
    }
    this.encodeBloom(encoder);
    const finish = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });
    finish.setPipeline(this.post);
    finish.setBindGroup(0, this.postGroup);
    finish.draw(3);
    finish.end();
    d.queue.submit([encoder.finish()]);
    this.frames++;
  }
}
Object.assign(Renderer.prototype, sceneMethods, propsMethods, effectsMethods);
export { Renderer };
