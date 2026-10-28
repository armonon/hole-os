import assert from 'node:assert/strict';
import { test } from 'node:test';
import '../src/tempo-analysis.js';
export function clicks(bpm, duration = 24, rate = 8000) {
  const pcm = new Float32Array(duration * rate);
  for (let t = .25; t < duration; t += 60 / bpm) for (let n = 0; n < rate * .025 && Math.round(t * rate) + n < pcm.length; n++) pcm[Math.round(t * rate) + n] = .8 * Math.exp(-n / (rate * .004)) * Math.cos(n * .7);
  return pcm;
}
test('generated pulse fixtures have a matching period, without claiming unique meter', async () => {
  for (const bpm of [60, 90, 120, 150, 180]) {
    const result = await HoleTempo.analyze([clicks(bpm)], 8000);
    assert.ok(result.candidates.some(c => Math.abs(c.bpm - bpm) < 3), `${bpm}: ${JSON.stringify(result.candidates)}`);
    assert.equal(result.experimental, true); assert.match(result.scoreMeaning, /not a probability/);
  }
});
test('silence and too-short material return no fabricated tempo', async () => {
  assert.equal((await HoleTempo.analyze([new Float32Array(8000 * 10)], 8000)).bpm, null);
  assert.equal((await HoleTempo.analyze([clicks(120, 2)], 8000)).reason, 'insufficient-duration');
});
test('coverage and phase-inverted stereo retain actual onset information', async () => {
  const left = clicks(120), right = left.map(v => -v);
  const result = await HoleTempo.analyze([left, right], 8000, { maxSeconds: 10 });
  assert.equal(result.coverage.partial, true); assert.equal(result.coverage.endSeconds, 10);
  assert.equal(result.coverage.sourceDurationSeconds, 24); assert.ok(Math.abs(result.bpm - 120) < 3);
  assert.equal(result.ambiguous, true);
});
test('abort, runtime budget, invalid PCM and sample cap reject', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(HoleTempo.analyze([clicks(120)], 8000, { signal: controller.signal }), { code: 'CANCELLED' });
  const live = new AbortController(); setTimeout(() => live.abort(), 5);
  await assert.rejects(HoleTempo.analyze([clicks(120)], 8000, { signal: live.signal }), { code: 'CANCELLED' });
  await assert.rejects(HoleTempo.analyze([clicks(120)], 8000, { budgetMs: 1 }), { code: 'RESOURCE_LIMIT' });
  await assert.rejects(HoleTempo.analyze([new Float32Array(8000).fill(NaN)], 8000), { code: 'INVALID_PARAMETERS' });
  await assert.rejects(HoleTempo.analyze([new Float32Array(7000000), new Float32Array(7000000)], 192000), { code: 'RESOURCE_LIMIT' });
});
