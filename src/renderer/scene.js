import { rotateBridgeMesh, mossAt, box } from './mesh.js';
import { OAK_WOOD, OAK_FRAME, bridgeOakPlank } from './geometry/wood.js';
import { phaseTints } from './geometry/mechanisms.js';
import { phaseBlock, phaseGroundGlow } from './geometry/runes.js';
import { torchDecor, scatterDecor } from './geometry/decor.js';
// Decorative stone columns under base cubes (cells with nothing anywhere below them),
// fading into the void fog for depth. Deterministic per cell, so a level always looks the same.
function levelPillars(blocks) {
  const stone = blocks.filter((b) => b.color === undefined),
    lowest = new Map();
  for (const b of blocks) {
    const key = b.x + ',' + b.z;
    if (!lowest.has(key) || b.y < lowest.get(key).y) lowest.set(key, b);
  }
  const pillars = [];
  for (const b of stone) {
    if (lowest.get(b.x + ',' + b.z) !== b) continue;
    const hash = Math.abs(Math.sin(b.x * 12.9898 + b.z * 78.233 + b.y * 37.719) * 43758.5453) % 1;
    if (hash > 0.7) continue;
    const depth = 3 + Math.floor((hash / 0.7) * 8);
    for (let k = 1; k <= depth; k++) pillars.push({ x: b.x, y: b.y - k, z: b.z });
  }
  return pillars;
}
export const sceneMethods = {
  buildScene(level) {
    this.buildDust(level.world);
    const mesh = [],
      phaseMesh = [],
      assembly = [],
      phaseAssembly = [],
      decorAssembly = [],
      blocks = (level.world.blocks || []).filter(
        (b) =>
          !level.bridges.some((p) => p.x === b.x && p.z === b.z && p.y === b.y) &&
          !level.world.lifts.some((p) => p.x === b.x && p.z === b.z && p.base === b.y),
      ),
      occupied = new Set(
        blocks.filter((b) => b.color === undefined).map((b) => [b.x, b.y, b.z].join(',')),
      ),
      pillars = this.pillars ? levelPillars(blocks) : [];
    for (const p of pillars) occupied.add([p.x, p.y, p.z].join(','));
    let blockIndex = 0;
    const blockAssemblyIndices = new Map(),
      recordBlock = (target, source, from, center, cell = center) => {
        blockAssemblyIndices.set(cell.join(','), blockIndex);
        for (let k = from; k < source.length; k += 12) target.push(...center, blockIndex);
        blockIndex++;
      },
      recordDecor = (source, from, b) => {
        const index = blockAssemblyIndices.get([b.x, b.y, b.z].join(',')) ?? 0;
        for (let k = from; k < source.length; k += 12)
          decorAssembly.push(b.x, b.y - 0.5, b.z, index);
      };
    this.phaseFaces = [];
    // The void fog starts beneath the lowest walkable top of the map.
    this.fogBase = blocks.reduce(
      (low, b) => Math.min(low, b.y),
      level.floor?.size ? 0 : blocks.length ? Infinity : 0,
    );
    // Voxel-style contact occlusion: each face corner darkens with the stone cells around it.
    const AO = [0.46, 0.63, 0.81, 1],
      solid = (cell) => occupied.has(cell.join(','));
    const occlusion = (b) => {
      const corners = new Map();
      return (axis, sign, s, t) => {
        const key = axis * 2 + (sign > 0 ? 1 : 0);
        let c = corners.get(key);
        if (!c) {
          const u = (axis + 1) % 3,
            v = (axis + 2) % 3,
            front = [b.x, b.y, b.z];
          front[axis] += sign;
          const at = (du, dv) => {
            const cell = [...front];
            cell[u] += du;
            cell[v] += dv;
            return solid(cell) ? 1 : 0;
          };
          const corner = (du, dv) => {
            const a = at(du, 0),
              e = at(0, dv);
            return AO[a && e ? 0 : 3 - a - e - at(du, dv)];
          };
          // A face pressed against another stone is only seen through the joint: keep it as deep mortar.
          c = solid(front)
            ? [0.12, 0.12, 0.12, 0.12]
            : [corner(-1, -1), corner(1, -1), corner(-1, 1), corner(1, 1)];
          corners.set(key, c);
        }
        return (c[0] * (1 - s) + c[1] * s) * (1 - t) + (c[2] * (1 - s) + c[3] * s) * t;
      };
    };
    for (const b of blocks) {
      if (
        [
          [1, 0, 0],
          [-1, 0, 0],
          [0, 1, 0],
          [0, -1, 0],
          [0, 0, 1],
          [0, 0, -1],
        ].every((d) => occupied.has([b.x + d[0], b.y + d[1], b.z + d[2]].join(',')))
      )
        continue;
      if (b.color !== undefined) {
        const from = phaseMesh.length;
        phaseBlock(phaseMesh, this.phaseFaces, b, phaseTints[b.color]);
        const support = level.world.heightAt(b.x, b.z, b.y - 0.99);
        if (support !== null && Math.abs(support - (b.y - 1)) < 0.01)
          phaseGroundGlow(phaseMesh, this.phaseFaces, b, phaseTints[b.color]);
        recordBlock(phaseAssembly, phaseMesh, from, [b.x, b.y - 0.5, b.z], [b.x, b.y, b.z]);
        continue;
      }
      const from = mesh.length;
      const n = ((((b.x * 73 + b.y * 31 + b.z * 137) % 19) + 19) % 19) / 19,
        color =
          b.y > 0
            ? [0.2 + n * 0.03, 0.172 + n * 0.026, 0.142 + n * 0.022]
            : [0.265 + n * 0.04, 0.225 + n * 0.035, 0.18 + n * 0.03];
      box(mesh, [b.x, b.y - 0.5, b.z], [0.97, 1, 0.97], color, 0.06, 0, 2, {
        crisp: true,
        shade: occlusion(b),
        detail: mossAt,
      });
      recordBlock(assembly, mesh, from, [b.x, b.y - 0.5, b.z], [b.x, b.y, b.z]);
    }
    const pillarFrom = blockIndex;
    for (const b of pillars) {
      if (
        [
          [1, 0, 0],
          [-1, 0, 0],
          [0, -1, 0],
          [0, 0, 1],
          [0, 0, -1],
        ].every((d) => occupied.has([b.x + d[0], b.y + d[1], b.z + d[2]].join(',')))
      )
        continue;
      const from = mesh.length,
        n = ((((b.x * 73 + b.y * 31 + b.z * 137) % 19) + 19) % 19) / 19;
      box(
        mesh,
        [b.x, b.y - 0.5, b.z],
        [0.97, 1, 0.97],
        [0.19 + n * 0.03, 0.163 + n * 0.026, 0.136 + n * 0.022],
        0.06,
        0,
        2,
        {
          crisp: true,
          shade: occlusion(b),
          detail: mossAt,
        },
      );
      recordBlock(assembly, mesh, from, [b.x, b.y - 0.5, b.z], [b.x, b.y, b.z]);
    }
    const pillarTo = blockIndex;
    for (const key of level.floor) {
      const [x, z] = key.split(',').map(Number);
      if (level.bridges.some((b) => b.x === x && b.z === z)) continue;
      const from = mesh.length;
      const height = 0;
      const noise = ((x * 73 + z * 137) % 19) / 19,
        color = [0.265 + noise * 0.04, 0.225 + noise * 0.035, 0.18 + noise * 0.03];
      if (level.world.lifts.some((l) => l.x === x && l.z === z)) {
        const base = level.world.lifts.find((l) => l.x === x && l.z === z).base || 0;
        box(mesh, [x, base - 0.52, z], [0.99, 0.25, 0.99], [0.12, 0.14, 0.12], 0.025);
      } else {
        box(mesh, [x, height - 0.36, z], [0.97, 0.72, 0.97], color, 0.045);
        const upper = level.world.heights.get(key) || 0;
        for (let y = 0; y < upper; y++) {
          const span = Math.min(1, upper - y);
          box(mesh, [x, y + span * 0.5, z], [0.97, span, 0.97], color, 0.045);
        }
      }
      recordBlock(assembly, mesh, from, [x, height - 0.36, z], [x, height, z]);
    }
    for (const o of level.world.collisionBoxes().filter((o) => o.kind === 'wall')) {
      const from = mesh.length;
      box(
        mesh,
        [o.x, (o.minY + o.maxY) * 0.5, o.z],
        [o.half * 2 - 0.03, o.maxY - o.minY, o.half * 2 - 0.03],
        o.half > 0.4 ? [0.12, 0.145, 0.18] : [0.105, 0.12, 0.115],
        0.045,
      );
      recordBlock(assembly, mesh, from, [o.x, (o.minY + o.maxY) * 0.5, o.z]);
    }
    // Masonry comes first and uses the stone pipeline; decor follows in the same buffer.
    const decor = [];
    scatterDecor(decor, level, occupied, recordDecor);
    for (const torch of level.world.torches || []) {
      const from = decor.length;
      torchDecor(decor, torch);
      recordDecor(decor, from, torch);
    }
    assembly.push(...decorAssembly);
    for (const [key, values] of [
      ['assemblyBuffer', assembly],
      ['phaseAssemblyBuffer', phaseAssembly],
    ]) {
      for (let i = 3; i < values.length; i += 4) {
        const index = values[i];
        values[i] =
          key === 'assemblyBuffer' && index >= pillarFrom && index < pillarTo
            ? 2 + (index - pillarFrom) / Math.max(1, pillarTo - pillarFrom - 1)
            : (index < pillarFrom ? index : index - pillarTo + pillarFrom) /
              Math.max(1, blockIndex - (pillarTo - pillarFrom) - 1);
      }
      this[key]?.destroy();
      this[key] = this.buffer(
        new Float32Array(values.length ? values : [0, 0, 0, 0]),
        GPUBufferUsage.VERTEX,
      );
    }
    this.assemblyBlockCount = blockIndex;
    const data = new Float32Array(mesh.length + decor.length);
    data.set(mesh);
    data.set(decor, mesh.length);
    if (data.byteLength > this.staticBuffer.size) {
      this.staticBuffer.destroy();
      this.staticBuffer = this.device.createBuffer({
        size: Math.ceil(data.byteLength / 65536) * 65536,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    this.stoneCount = mesh.length / 12;
    this.staticCount = data.length / 12;
    this.device.queue.writeBuffer(this.staticBuffer, 0, data);
    const phaseData = new Float32Array(phaseMesh);
    if (phaseData.byteLength > this.phaseBuffer.size) {
      this.phaseBuffer.destroy();
      this.phaseBuffer = this.device.createBuffer({
        size: Math.ceil(phaseData.byteLength / 65536) * 65536,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    if (phaseData.length) this.device.queue.writeBuffer(this.phaseBuffer, 0, phaseData);
  },
  bridges(level) {
    const wood = [],
      spectral = [];
    level.bridges
      .filter((bridge) => bridge.color === undefined)
      .forEach((bridge) => {
        const mesh = wood;
        const from = mesh.length;
        const progress = bridge.progress ?? (level.world.soft ? 0 : 1),
          x = bridge.x,
          z = bridge.z,
          seed = bridge.x * 31 + bridge.z * 17;
        // The deck uses the crate's oak boards so all timber shares grain and wear.
        for (const side of [-1, 1])
          bridgeOakPlank(
            mesh,
            [x + side * 0.31, -0.13, z],
            [0.13, 0.2, 0.96],
            OAK_FRAME.map((value) => value * 0.62),
            seed + side,
            0.014,
          );
        // Separate crosswise boards retain fixed grain scale and never stretch during motion.
        for (let n = 0; n < 5; n++) {
          const boardZ = z + (n - 2) * 0.19,
            brightness = 0.9 + ((n * 3 + seed) % 5) * 0.045;
          bridgeOakPlank(
            mesh,
            [x, -0.035 + (n % 3) * 0.002, boardZ],
            [0.92, 0.1, 0.18],
            OAK_WOOD.map((value) => value * brightness),
            seed + n + 5,
            0.012,
          );
          for (const side of [-1, 1])
            if (n === 0 || n === 4)
              box(
                mesh,
                [x + side * 0.37, 0.022, boardZ],
                [0.07, 0.025, 0.055],
                [0.31, 0.23, 0.14],
                0.004,
                12,
                1,
              );
        }
        // Iron end brackets visually lock the deck into the banks.
        for (const end of [-1, 1])
          box(
            mesh,
            [x, 0.008, z + end * 0.445],
            [0.82, 0.035, 0.045],
            [0.19, 0.16, 0.13],
            0.006,
            12,
            1,
          );
        rotateBridgeMesh(mesh, from, bridge, progress);
      });
    level.bridges
      .filter((bridge) => bridge.color !== undefined)
      .forEach((bridge) => {
        const progress = bridge.progress ?? (level.world.soft ? 0 : 1),
          tint = phaseTints[bridge.color ?? 1] || phaseTints[1],
          from = spectral.length;
        box(
          spectral,
          [bridge.x, -0.055, bridge.z],
          [0.92, 0.11, 0.96],
          tint.map((v) => v * 1.25),
          0.025,
          16,
          3,
          { crisp: true },
        );
        rotateBridgeMesh(spectral, from, bridge, progress);
      });
    const opaqueCount = wood.length / 12,
      mesh = wood.concat(spectral),
      spectralCount = spectral.length / 12;
    if (mesh.length) {
      const data = new Float32Array(mesh);
      if (data.byteLength > this.bridgeBuffer.size) {
        this.bridgeBuffer.destroy();
        this.bridgeBuffer = this.device.createBuffer({
          size: Math.ceil(data.byteLength / 65536) * 65536,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
      }
      this.device.queue.writeBuffer(this.bridgeBuffer, 0, data);
    }
    return { opaqueCount, spectralCount };
  },
};
