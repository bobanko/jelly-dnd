// Height-aware level surfaces and triggers, shared by physics, rendering and debug overlays.
const alive = (p) => !p.state || p.state === 'alive';
const near = (p, q, r) => Math.abs(p.x - q.x) < r && Math.abs(p.z - q.z) < r;
const smooth = (t) => t * t * (3 - 2 * t);
function bridgePose(bridge, progress = 0) {
  const t = Math.max(0, Math.min(1, progress)),
    angle = (1 - t) * Math.PI * 0.5,
    hinge = [bridge.x, bridge.y || 0, bridge.z - 0.5];
  return {
    angle,
    hinge,
    center: [bridge.x, hinge[1] - Math.sin(angle) * 0.5, hinge[2] + Math.cos(angle) * 0.5],
  };
}
const spikeNormals = {
  top: [0, 1, 0],
  north: [0, 0, -1],
  east: [1, 0, 0],
  south: [0, 0, 1],
  west: [-1, 0, 0],
};
function spikeFrame(spike, height = 0) {
  const n = spikeNormals[spike.face || 'top'] || spikeNormals.top,
    wall = n[1] === 0;
  return {
    origin: [spike.x + n[0] * 0.503, height - (wall ? 0.5 : 0), spike.z + n[2] * 0.503],
    n,
    u: wall ? [-n[2], 0, n[0]] : [1, 0, 0],
    v: wall ? [0, 1, 0] : [0, 0, 1],
  };
}
function spikeBoxes(spike, height = 0, extension = 1) {
  const f = spikeFrame(spike, height),
    length = 0.24 * extension,
    boxes = [];
  for (const u of [-0.21, 0.21])
    for (const v of [-0.21, 0.21]) {
      const center = f.origin.map(
        (p, k) => p + f.u[k] * u + f.v[k] * v + f.n[k] * (0.015 + length * 0.5),
      );
      const half = f.n.map(
        (n, k) =>
          Math.abs(n) * length * 0.5 + (Math.abs(f.u[k]) + Math.abs(f.v[k])) * 0.075 * extension,
      );
      boxes.push({
        x: center[0],
        z: center[2],
        halfX: half[0],
        halfZ: half[2],
        minY: center[1] - half[1],
        maxY: center[1] + half[1],
        kind: 'spikes',
        ...(spike.color === undefined ? {} : { color: spike.color }),
      });
    }
  return boxes;
}
function install(World) {
  Object.assign(World.prototype, {
    conveyorVelocity(p, foot = p.y || 0) {
      let x = 0,
        z = 0;
      if (!alive(p) || p.launchTimer > 0 || Math.abs(p.vy || 0) > 0.9) return { x, z };
      const half = 0.36,
        area = 4 * half * half;
      for (const belt of this.conveyors) {
        if (Math.abs(p.x - belt.x) > 0.5 + half || Math.abs(p.z - belt.z) > 0.5 + half) continue;
        const height = belt.y ?? this.heightAt(belt.x, belt.z);
        if (height === null || Math.abs(foot - height) > 0.13) continue;
        const overlapX = Math.max(
          0,
          Math.min(p.x + half, belt.x + 0.5) - Math.max(p.x - half, belt.x - 0.5),
        );
        const overlapZ = Math.max(
          0,
          Math.min(p.z + half, belt.z + 0.5) - Math.max(p.z - half, belt.z - 0.5),
        );
        const weight = (overlapX * overlapZ) / area,
          speed = belt.speed ?? 0.85;
        x += (belt.dx || 0) * speed * weight;
        z += (belt.dz ?? 1) * speed * weight;
      }
      return { x, z };
    },
    conveyorJoined(belt, sign) {
      const dx = belt.dx || 0,
        dz = belt.dz ?? 1,
        y = belt.y ?? this.heightAt(belt.x, belt.z);
      return this.conveyors.some(
        (other) =>
          other !== belt &&
          other.x === belt.x + dx * sign &&
          other.z === belt.z + dz * sign &&
          (other.dx || 0) === dx &&
          (other.dz ?? 1) === dz &&
          (other.y ?? this.heightAt(other.x, other.z)) === y,
      );
    },
    goalActive(goal, player) {
      return (
        !!goal &&
        !!player &&
        alive(player) &&
        player.kind !== 'crate' &&
        Math.abs((player.y || 0) - (goal.y ?? this.heightAt(goal.x, goal.z) ?? 0)) < 0.15 &&
        Math.hypot(player.x - goal.x, player.z - goal.z) < 0.32
      );
    },
    goalCharge(goal, player) {
      if (
        !goal ||
        !player ||
        !alive(player) ||
        player.kind === 'crate' ||
        Math.abs((player.y || 0) - (goal.y ?? this.heightAt(goal.x, goal.z) ?? 0)) >= 0.15
      )
        return 0;
      const t = Math.max(
        0,
        Math.min(1, (Math.hypot(player.x - goal.x, player.z - goal.z) - 0.32) / 0.4),
      );
      return 1 - t * t * (3 - 2 * t);
    },
    portalDestination(portal) {
      const chain = this.portals.filter((p) => p.color === portal.color),
        index = chain.indexOf(portal);
      return index < 0 || chain.length < 2 ? null : chain[(index + 1) % chain.length];
    },
    portalLocked(portal, players) {
      const height = portal.y ?? this.heightAt(portal.x, portal.z) ?? 0;
      return players.some(
        (p) =>
          alive(p) &&
          p.kind !== 'crate' &&
          p.portalLock === portal.color &&
          Math.abs((p.y || 0) - height) < 0.2 &&
          near(p, portal, 0.78),
      );
    },
    portalExitBlocked(portal, bodies, traveller = null) {
      const height = portal.y ?? this.heightAt(portal.x, portal.z);
      if (height === null) return true;
      if (
        bodies.some(
          (p) =>
            p !== traveller &&
            p.state !== 'dead' &&
            near(p, portal, 0.8) &&
            Math.abs((p.y || 0) - height) < 0.7,
        )
      )
        return true;
      return this.collisionBoxes().some(
        (b) =>
          this.blockSolid(traveller, b) &&
          b.maxY > height + 0.03 &&
          b.minY < height + 0.84 &&
          Math.abs(b.x - portal.x) < (b.halfX ?? b.half) + 0.36 &&
          Math.abs(b.z - portal.z) < (b.halfZ ?? b.half) + 0.36,
      );
    },
    portalInactive(portal, bodies, traveller = null) {
      const destination = this.portalDestination(portal);
      return (
        this.portalLocked(portal, bodies) ||
        !destination ||
        this.portalLocked(destination, bodies) ||
        this.portalExitBlocked(destination, bodies, traveller) ||
        this.portalExitBlocked(
          portal,
          bodies.filter((p) => p.kind === 'crate'),
          traveller,
        )
      );
    },
    portalCharge(portal, players, available) {
      if (available === false || (available === undefined && this.portalInactive(portal, players)))
        return 0;
      const height = portal.y ?? this.heightAt(portal.x, portal.z) ?? 0;
      let charge = 0;
      for (const p of players) {
        if (!alive(p) || p.kind === 'crate' || Math.abs((p.y || 0) - height) > 0.2) continue;
        const dx = Math.max(0, Math.abs(p.x - portal.x) - 0.38),
          dz = Math.max(0, Math.abs(p.z - portal.z) - 0.38),
          t = Math.min(1, Math.hypot(dx, dz) / 0.3);
        charge = Math.max(charge, 1 - t * t * (3 - 2 * t));
      }
      return charge;
    },
    spikeState(spike) {
      if (spike.plate) {
        const progress = spike.progress || 0,
          extension = smooth(progress),
          stage =
            progress === 0
              ? 'hidden'
              : progress === 1
                ? 'raised'
                : spike.target
                  ? 'rising'
                  : 'retracting';
        return {
          extension,
          stage,
          dangerous: extension > 0.35,
          warning: stage === 'rising' && extension <= 0.35,
        };
      }
      if (spike.cycle === 0) {
        const enabled = spike.enabled !== false;
        return {
          extension: enabled ? 1 : 0,
          stage: enabled ? 'raised' : 'hidden',
          dangerous: enabled,
          warning: false,
        };
      }
      // A one-second warning beat shows harmless tips before the full rise.
      const cycle = spike.cycle ?? 5.8,
        time =
          (this.featureTime || 0) +
          (spike.offset || 0) +
          (spike.enabled === false ? (cycle * 2.4) / 5.8 : 0),
        phase = (((time % cycle) + cycle) % cycle) * (5.8 / cycle),
        peek = 0.3;
      let extension = 1,
        stage = 'raised';
      if (phase >= 2 && phase < 2.3) {
        extension = 1 - smooth((phase - 2) / 0.3);
        stage = 'retracting';
      } else if (phase >= 2.3 && phase < 4.5) {
        extension = 0;
        stage = 'hidden';
      } else if (phase >= 4.5 && phase < 5.5) {
        extension = peek * smooth(Math.min(1, (phase - 4.5) / 0.15));
        stage = 'peeking';
      } else if (phase >= 5.5) {
        extension = peek + (1 - peek) * smooth((phase - 5.5) / 0.3);
        stage = 'rising';
      }
      return {
        extension,
        stage,
        dangerous: extension > 0.35,
        warning: stage === 'peeking' || (stage === 'rising' && extension <= 0.35),
      };
    },
    spikeFrame(spike) {
      return spikeFrame(spike, spike.y ?? this.heightAt(spike.x, spike.z) ?? 0);
    },
    spikeBoxes(spike, extension = 1) {
      return spikeBoxes(spike, spike.y ?? this.heightAt(spike.x, spike.z) ?? 0, extension);
    },
    spikeTouches(player, spike, extension = 1) {
      if (spike.color !== undefined && player.kind !== 'crate' && player.slot === spike.color)
        return false;
      if (Math.abs(player.x - spike.x) > 1.2 || Math.abs(player.z - spike.z) > 1.2) return false;
      const f = this.spikeFrame(spike),
        d = [player.x - f.origin[0], (player.y || 0) + 0.42 - f.origin[1], player.z - f.origin[2]],
        project = (axis) => d.reduce((sum, v, k) => sum + v * axis[k], 0),
        radius = (axis) =>
          Math.abs(axis[1]) * 0.42 + (Math.abs(axis[0]) + Math.abs(axis[2])) * 0.38;
      const n = project(f.n),
        half = radius(f.n),
        width = 0.075 * extension;
      return (
        n + half > 0.015 &&
        n - half < 0.015 + 0.24 * extension &&
        Math.abs(Math.abs(project(f.u)) - 0.21) < radius(f.u) + width &&
        Math.abs(Math.abs(project(f.v)) - 0.21) < radius(f.v) + width
      );
    },
    bridgeBounds(i) {
      const bridge = this.bridges[i],
        progress = bridge.progress ?? (this.soft ? 0 : this.held.has(i) ? 1 : 0);
      // The complete deck unfolds around its northern hinge. It only becomes
      // supporting once it is close enough to horizontal for stable footing.
      if (progress <= 0.88) return null;
      const pose = bridgePose(bridge, progress);
      return {
        x: bridge.x,
        z: bridge.z,
        half: 0.5,
        halfX: 0.5,
        halfZ: 0.5,
        minY: pose.center[1] - 0.2,
        maxY: pose.center[1],
        kind: 'bridge',
        ...(bridge.color === undefined ? {} : { color: bridge.color }),
      };
    },
    blockSolid(body, block) {
      return (
        block.color === undefined || !body || body.kind === 'crate' || body.slot !== block.color
      );
    },
    // A bridge or lift replaces the block or floor it is mounted on at height y.
    mountedAt(tx, tz, y) {
      for (const b of this.bridges)
        if (b.x === tx && b.z === tz && Math.abs((b.y || 0) - y) < 0.01) return true;
      for (const l of this.lifts)
        if (l.x === tx && l.z === tz && Math.abs(l.base - y) < 0.01) return true;
      return false;
    },
    heightAt(x, z, ceiling = Infinity, body = null) {
      if (this.blocks?.length) {
        // Called for every lattice node on every solver iteration: highest surface at or
        // below the ceiling, found without temporary arrays.
        const tx = Math.floor(x + 0.5),
          tz = Math.floor(z + 0.5),
          column = `${tx},${tz}`,
          limit = ceiling + 0.001,
          ownColor =
            body && body.kind !== 'crate' && Number.isInteger(body.slot) && this.blockColors?.size;
        let best = null;
        const ys = this.blockColumns
          ? this.blockColumns.get(column) || []
          : this.blocks.filter((b) => b.x === tx && b.z === tz).map((b) => b.y);
        for (const y of ys) {
          if (ownColor && this.blockColors.get(`${tx},${y},${tz}`) === body.slot) continue;
          if (y <= limit && !this.mountedAt(tx, tz, y))
            best = best === null ? y : Math.max(best, y);
        }
        for (let i = 0; i < this.bridges.length; i++) {
          const b = this.bridges[i];
          if (b.x !== tx || b.z !== tz) continue;
          const bounds = this.bridgeBounds(i);
          if (
            bounds &&
            this.blockSolid(body, bounds) &&
            Math.abs(x - bounds.x) <= bounds.halfX &&
            Math.abs(z - bounds.z) <= bounds.halfZ + 1e-8 &&
            bounds.maxY <= limit
          )
            best = best === null ? bounds.maxY : Math.max(best, bounds.maxY);
        }
        for (const l of this.lifts)
          if (l.x === tx && l.z === tz && l.height <= limit)
            best = best === null ? l.height : Math.max(best, l.height);
        if (this.floor.has(column)) {
          const legacyY = this.heights.get(column) || 0;
          if (legacyY <= limit && !this.mountedAt(tx, tz, legacyY))
            best = best === null ? legacyY : Math.max(best, legacyY);
        }
        return best;
      }
      const tileX = Math.floor(x + 0.5),
        tileZ = Math.floor(z + 0.5);
      for (let i = 0; i < this.bridges.length; i++) {
        const b = this.bridges[i];
        if (b.x !== tileX || b.z !== tileZ) continue;
        const bounds = this.bridgeBounds(i);
        return bounds &&
          this.blockSolid(body, bounds) &&
          Math.abs(x - bounds.x) <= bounds.halfX &&
          Math.abs(z - bounds.z) <= bounds.halfZ + 1e-8
          ? bounds.maxY
          : null;
      }
      // No bridge here, so the tile is solid exactly when it is off the floor (see solid()).
      const key = `${tileX},${tileZ}`;
      if (!this.floor.has(key)) return null;
      for (const l of this.lifts) if (l.x === tileX && l.z === tileZ) return l.height;
      return this.heights.get(key) || 0;
    },
    supported(p) {
      const height = this.heightAt(p.x, p.z, (p.y || 0) + 0.2, p);
      return (
        height !== null &&
        (this.blocks?.length ? Math.abs((p.y || 0) - height) < 0.23 : (p.y || 0) >= height - 0.2)
      );
    },
    obstaclesNear(p) {
      return this.blocks?.length
        ? this.collisionBoxes().filter(
            (b) =>
              this.blockSolid(p, b) && b.maxY > (p.y || 0) + 0.05 && b.minY < (p.y || 0) + 0.84,
          )
        : this.obstacles;
    },
    active(i, bodies) {
      const plate = this.plates[i];
      if (!plate) return false;
      return this.plates.some((candidate) => {
        if (candidate !== plate && (!plate.color || candidate.color !== plate.color)) return false;
        const height = candidate.y ?? this.heightAt(candidate.x, candidate.z) ?? 0;
        return bodies.some(
          (p) => alive(p) && Math.abs((p.y || 0) - height) < 0.15 && near(p, candidate, 0.42),
        );
      });
    },
    collisionBoxes() {
      if (this._collisionCache) return this._collisionCache;
      const boxes = [];
      this._blockBoxes ??= (this.blocks || [])
        .filter(
          (b) =>
            !this.bridges.some(
              (p) => p.x === b.x && p.z === b.z && Math.abs((p.y || 0) - b.y) < 0.01,
            ) &&
            !this.lifts.some((p) => p.x === b.x && p.z === b.z && Math.abs(p.base - b.y) < 0.01),
        )
        .map((b) => ({
          x: b.x,
          z: b.z,
          half: 0.5,
          minY: b.y - 1,
          maxY: b.y,
          kind: 'block',
          ...(b.color === undefined ? {} : { color: b.color }),
        }))
        .concat(
          (this.pillars || [])
            .filter((p) => p.solid)
            .map((p) => ({ x: p.x, z: p.z, half: 0.5, minY: p.y - 1, maxY: p.y, kind: 'block' })),
        );
      boxes.push(...this._blockBoxes);
      if (this.blocks?.length) {
        for (let i = 0; i < this.bridges.length; i++) {
          const p = this.bridges[i],
            b = this.bridgeBounds(i),
            key = `${p.x},${p.z}`;
          if (
            b &&
            (!this.floor.has(key) || Math.abs((this.heights.get(key) || 0) - (p.y || 0)) > 0.01)
          )
            boxes.push(b);
        }
        for (const l of this.lifts) {
          const key = `${l.x},${l.z}`;
          if (!this.floor.has(key) || Math.abs((this.heights.get(key) || 0) - l.base) > 0.01)
            boxes.push({
              x: l.x,
              z: l.z,
              half: 0.5,
              minY: l.height - 0.16,
              maxY: l.height,
              kind: 'lift',
            });
        }
      }
      // Which floor tiles carry a bridge or lift never changes during play, so the tile
      // scan is cached; only bridge and lift boxes are rebuilt, keeping the original order.
      const floorKey = this.floor.size + ',' + this.heights.size + ',' + !!this.blocks?.length;
      if (this._floorTemplate?.key !== floorKey) {
        const tiles = [],
          conveyorCells = new Set(this.conveyors.map((p) => `${p.x},${p.z}`));
        for (const key of this.floor) {
          const [x, z] = key.split(',').map(Number),
            legacyY = this.heights.get(key) || 0,
            bridge = this.bridges.findIndex(
              (b) =>
                b.x === x &&
                b.z === z &&
                (!this.blocks?.length || Math.abs((b.y || 0) - legacyY) < 0.01),
            );
          if (bridge >= 0) {
            tiles.push({ bridge });
            continue;
          }
          const lift = this.lifts.find(
            (l) =>
              l.x === x && l.z === z && (!this.blocks?.length || Math.abs(l.base - legacyY) < 0.01),
          );
          tiles.push(
            lift
              ? { lift, x, z }
              : {
                  box: {
                    x,
                    z,
                    half: 0.5,
                    minY: -0.72,
                    maxY: legacyY,
                    kind: conveyorCells.has(key) ? 'conveyor' : 'floor',
                  },
                },
          );
        }
        this._floorTemplate = { key: floorKey, tiles };
      }
      for (const tile of this._floorTemplate.tiles) {
        if (tile.box) boxes.push(tile.box);
        else if (tile.lift)
          boxes.push({
            x: tile.x,
            z: tile.z,
            half: 0.5,
            minY: tile.lift.height - 0.16,
            maxY: tile.lift.height,
            kind: 'lift',
          });
        else {
          const bounds = this.bridgeBounds(tile.bridge);
          if (bounds) boxes.push(bounds);
        }
      }
      for (const o of this.obstacles)
        boxes.push({
          ...o,
          minY: o.minY ?? (o.half > 0.4 ? -0.4 : 0),
          maxY: o.height ?? (o.half > 0.4 ? 1.4 : 0.56),
          kind: 'wall',
        });
      for (const a of this.archers)
        if (a.state !== 'dead') {
          const y = a.y ?? this.heightAt(a.x, a.z) ?? 0;
          boxes.push({ x: a.x, z: a.z, half: 0.25, minY: y, maxY: y + 1.2, kind: 'archer' });
        }
      return (this._collisionCache = boxes);
    },
    debugBoxes() {
      return [
        ...this.collisionBoxes(),
        ...this.spikes.flatMap((s) => {
          const state = this.spikeState(s);
          return state.dangerous ? this.spikeBoxes(s, state.extension) : [];
        }),
        ...this.portals.map((p) => ({
          ...p,
          half: 0.28,
          minY: p.y ?? this.heightAt(p.x, p.z) ?? 0,
          maxY: (p.y ?? this.heightAt(p.x, p.z) ?? 0) + 0.08,
          kind: 'portal',
        })),
      ];
    },
    featureSnapshot() {
      return {
        time: this.featureTime || 0,
        spikes: this.spikes.map((s) => ({ progress: s.progress || 0, target: s.target || 0 })),
        bridges: this.bridges.map((b) => ({
          progress: b.progress || 0,
          velocity: b.velocity || 0,
        })),
        lifts: this.lifts.map((l) => ({
          height: l.height,
          target: l.target,
          occupiedTime: l.occupiedTime || 0,
          emptyTime: l.emptyTime || 0,
        })),
        combat: this.combatSnapshot(),
      };
    },
    restoreFeatures(snapshot) {
      this.featureTime = snapshot?.time || 0;
      this.spikes.forEach((s, i) =>
        Object.assign(s, snapshot?.spikes?.[i] || { progress: 0, target: 0 }),
      );
      this.bridges.forEach((b, i) =>
        Object.assign(b, snapshot?.bridges?.[i] || { progress: 0, velocity: 0 }),
      );
      this.lifts.forEach((l, i) =>
        Object.assign(
          l,
          snapshot?.lifts?.[i] || {
            height: l.base || 0,
            target: l.base || 0,
            occupiedTime: 0,
            emptyTime: 0,
          },
        ),
      );
      this.restoreCombat(snapshot?.combat);
      this._collisionCache = null;
    },
    resetFeatures() {
      this.restoreFeatures(null);
    },
    stepSpikes(bodies, dt) {
      for (const spike of this.spikes) {
        if (!spike.plate) continue;
        spike.target = this.active(
          this.plates.findIndex((p) => p.id === spike.plate || p.color === spike.plate),
          bodies,
        )
          ? 1
          : 0;
        // The same extension drives visible geometry, damage, sound and debug bounds.
        const progress = spike.progress || 0,
          distance = spike.target - progress;
        spike.progress = progress + Math.sign(distance) * Math.min(Math.abs(distance), dt / 0.3);
      }
    },
    beforeFeatures(players, soft, dt) {
      this.featureTime = (this.featureTime || 0) + dt;
      this._collisionCache = null;
      this.refresh(players);
      this.stepSpikes(players, dt);
      for (let i = 0; i < this.bridges.length; i++) {
        const bridge = this.bridges[i],
          target = this.held.has(i) ? 1 : 0;
        // Exact critically damped spring: smooth starts and reversals at any frame rate.
        const error = (bridge.progress || 0) - target,
          velocity = bridge.velocity || 0,
          omega = 10,
          c = velocity + omega * error,
          decay = Math.exp(-omega * dt);
        bridge.progress = Math.max(0, Math.min(1, target + (error + c * dt) * decay));
        bridge.velocity = (velocity - omega * c * dt) * decay;
        if (Math.abs(bridge.progress - target) < 0.001 && Math.abs(bridge.velocity) < 0.015) {
          bridge.progress = target;
          bridge.velocity = 0;
        }
      }
      players.forEach((p) => {
        p.portalCooldown = Math.max(0, (p.portalCooldown || 0) - dt);
        p.portalFlash = Math.max(0, (p.portalFlash || 0) - dt);
        p.portalBlocked = false;
        if (
          p.portalLock &&
          p.portalCooldown === 0 &&
          !this.portals.some(
            (portal) =>
              portal.color === p.portalLock &&
              near(p, portal, 0.78) &&
              Math.abs((p.y || 0) - (portal.y ?? this.heightAt(portal.x, portal.z) ?? 0)) < 0.2,
          )
        )
          p.portalLock = null;
      });
      for (const lift of this.lifts) {
        const riders = players.filter(
          (p) => alive(p) && near(p, lift, 0.36) && Math.abs((p.y || 0) - lift.height) < 0.18,
        );
        if (riders.length) {
          lift.emptyTime = 0;
          lift.occupiedTime = (lift.occupiedTime || 0) + dt;
          if (lift.occupiedTime > 0.16) lift.target = lift.top;
        } else {
          lift.occupiedTime = 0;
          lift.emptyTime = (lift.emptyTime || 0) + dt;
          if (lift.emptyTime > 0.75) lift.target = lift.base || 0;
        }
        const previous = lift.height,
          distance = lift.target - lift.height;
        lift.height += Math.sign(distance) * Math.min(Math.abs(distance), dt * 0.85);
        const delta = lift.height - previous;
        if (delta) {
          const carried = new Set();
          const carry = (p) => {
            if (carried.has(p)) return;
            carried.add(p);
            soft.translate(p, 0, delta, 0);
            for (const other of players) if (soft.get(other).support === p) carry(other);
          };
          for (const p of riders) carry(p);
        }
      }
    },
    afterFeatures(players, soft) {
      const events = [];
      players.forEach((p, i) => {
        if (!alive(p) || p.kind === 'crate') return;
        const spike = this.spikes.find((s) => {
          const state = this.spikeState(s);
          return state.dangerous && this.spikeTouches(p, s, state.extension);
        });
        // A jelly whose centre rests on a lava block burns; crates ride over lava like floor.
        const tx = Math.round(p.x),
          tz = Math.round(p.z),
          top = Math.round(p.y || 0),
          lava =
            this.lavaBlocks?.size &&
            Math.abs((p.y || 0) - top) < 0.12 &&
            this.lavaBlocks.has(`${tx},${top},${tz}`);
        if (spike || lava) {
          const reason = spike ? 'spikes' : 'lava';
          p.state = 'dead';
          p.deaths = (p.deaths || 0) + 1;
          p.deathReason = reason;
          p.respawnTimer = 0.7;
          p.vx = p.vy = p.vz = 0;
          soft.get(p).velocities.forEach((v) => v.fill(0));
          events.push({ type: 'death', reason, player: i });
          return;
        }
        const source = this.portals.find(
          (portal) =>
            portal.color !== p.portalLock &&
            near(p, portal, 0.28) &&
            Math.abs((p.y || 0) - (portal.y ?? this.heightAt(portal.x, portal.z) ?? 0)) < 0.18,
        );
        if (!source) return;
        if (this.portalInactive(source, players, p)) {
          p.portalBlocked = true;
          return;
        }
        const destination = this.portalDestination(source);
        const fromHeight = source.y ?? this.heightAt(source.x, source.z) ?? 0,
          toHeight = destination.y ?? this.heightAt(destination.x, destination.z) ?? 0;
        soft.translate(p, destination.x - p.x, toHeight - fromHeight, destination.z - p.z, true);
        p.portalLock = source.color;
        p.portalCooldown = 0.65;
        p.portalFlash = 0.55;
        events.push({
          type: 'portal',
          player: i,
          color: source.color,
          source: [source.x, fromHeight, source.z],
          destination: [destination.x, toHeight, destination.z],
        });
      });
      this._collisionCache = null;
      return events;
    },
    // Bodies come back only on their own spawn. While it is blocked (another body on it, a
    // raised spike, a wall) they wait and retry every step; nothing is pushed aside.
    respawnPosition(p, bodies) {
      const c = { ...p.spawn },
        height = this.heightAt(
          c.x,
          c.z,
          this.blocks?.length ? (p.spawn.y ?? 0) + 0.2 : Infinity,
          p,
        );
      if (height === null) return;
      c.y = height;
      if (
        this.spikes.some((s) => this.spikeTouches({ ...p, ...c }, s)) ||
        this.portals.some((portal) => near(c, portal, 0.5))
      )
        return;
      if (
        this.collisionBoxes().some(
          (o) =>
            this.blockSolid(p, o) &&
            (o.kind === 'wall' || o.kind === 'archer' || o.kind === 'block') &&
            height + 0.03 < o.maxY &&
            height + 0.84 > o.minY &&
            near(c, o, 0.36 + o.half + 0.015),
        )
      )
        return;
      // Footprints: jellies and small crates are 0.76 wide, large crates 0.94.
      const half = (q) => (q.kind === 'crate' && q.large ? 0.47 : 0.38);
      if (
        bodies.some(
          (b) =>
            b !== p &&
            b.state !== 'dead' &&
            near(c, b, half(p) + half(b) - 0.02) &&
            Math.abs((b.y || 0) - height) < 0.75,
        )
      )
        return;
      return c;
    },
  });
}
export { install, spikeFrame, spikeBoxes, bridgePose };
