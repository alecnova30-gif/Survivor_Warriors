import { ensureWorld, buildChunk } from './chunkgen.js';

self.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'init') {
    ensureWorld(msg.seed);
    self.postMessage({ type: 'init' });
    return;
  }
  try {
    ensureWorld(msg.seed);
    const result = buildChunk(msg);
    if (result.positions) {
      self.postMessage({ id: msg.id, ...result },
        [result.positions.buffer, result.normals.buffer, result.colors.buffer, result.uvs.buffer, result.indices.buffer]);
    } else {
      self.postMessage({ id: msg.id, empty: true });
    }
  } catch (err) {
    self.postMessage({ id: msg.id, error: String(err && err.stack || err) });
  }
};
