const KEY = 'jelly-dnd.progress.v2',
  LEGACY_KEY = 'jelly-dnd.unlocked-level';
// Historical file identities, used only to migrate the original five-level saves.
const LEGACY_FILES = [
  '01-first-steps.json',
  '02-helping-hands.json',
  '03-true-colors.json',
  '04-through-the-rift.json',
  '05-sunken-sanctum.json',
];
function create(storage) {
  let order = [],
    configured = false,
    saved = false,
    legacy = 1;
  const completed = new Set(),
    unlocked = new Set(),
    bestTimes = {};
  try {
    const data = JSON.parse(storage?.getItem(KEY) || 'null');
    if (data?.version === 2 && Array.isArray(data.completed) && Array.isArray(data.unlocked)) {
      for (const file of data.completed) if (typeof file === 'string') completed.add(file);
      for (const file of data.unlocked) if (typeof file === 'string') unlocked.add(file);
      if (data.bestTimes && typeof data.bestTimes === 'object')
        for (const [file, time] of Object.entries(data.bestTimes))
          if (Number.isFinite(time) && time > 0) bestTimes[file] = time;
      saved = true;
    }
  } catch {}
  if (!saved)
    try {
      const value = Number(storage?.getItem(LEGACY_KEY));
      if (Number.isInteger(value) && value >= 1 && value <= LEGACY_FILES.length) legacy = value;
    } catch {}
  function persist() {
    try {
      storage?.setItem(
        KEY,
        JSON.stringify({
          version: 2,
          completed: [...completed],
          unlocked: [...unlocked],
          bestTimes,
        }),
      );
    } catch {}
  }
  return {
    configure(files) {
      order = [...files];
      if (!configured && !saved && legacy > 1) {
        for (const file of LEGACY_FILES.slice(0, legacy)) unlocked.add(file);
        for (const file of LEGACY_FILES.slice(0, legacy - 1)) completed.add(file);
      }
      configured = true;
      if (order.length) unlocked.add(order[0]);
      order.forEach((file, index) => {
        if (completed.has(file) && order[index + 1]) unlocked.add(order[index + 1]);
      });
      persist();
    },
    get unlocked() {
      return order.reduce((max, file, i) => (unlocked.has(file) ? i + 1 : max), 0);
    },
    canPlay(id) {
      return Number.isInteger(id) && id >= 1 && id <= order.length && unlocked.has(order[id - 1]);
    },
    bestTime(id) {
      return bestTimes[order[id - 1]] ?? null;
    },
    complete(id, seconds) {
      if (!this.canPlay(id)) return this.unlocked;
      if (Number.isFinite(seconds) && seconds > 0) {
        const file = order[id - 1];
        bestTimes[file] = Math.min(bestTimes[file] ?? Infinity, seconds);
      }
      completed.add(order[id - 1]);
      if (order[id]) unlocked.add(order[id]);
      persist();
      return this.unlocked;
    },
  };
}
export { create, KEY, LEGACY_KEY };
