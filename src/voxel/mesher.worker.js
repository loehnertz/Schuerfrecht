import { marchChunk } from './MarchingCubes.js';

self.onmessage = function (e) {
  const { type, chunkKey, paddedData, surfaceThreshold, materialColors, materialEmissive, chunkWorldX, chunkWorldY, chunkWorldZ } = e.data;

  if (type === 'mesh') {
    const result = marchChunk(
      paddedData,
      surfaceThreshold,
      materialColors,
      materialEmissive,
      chunkWorldX,
      chunkWorldY,
      chunkWorldZ,
    );

    self.postMessage(
      {
        type: 'meshResult',
        chunkKey,
        positions: result.positions,
        normals: result.normals,
        colors: result.colors,
      },
      // Transfer the buffers — zero-copy
      [result.positions.buffer, result.normals.buffer, result.colors.buffer],
    );
  }
};
