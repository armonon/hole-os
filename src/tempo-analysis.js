/* Original experimental tempo estimator: window energy, positive differences,
 * normalized autocorrelation. No native engine code or profiles are included. */
(() => {
  'use strict';
  const fail = (message, code) => Object.assign(new Error(message), { code });
  async function analyze(channels, sampleRate, options = {}) {
    const { signal, maxSeconds = 60, budgetMs = 10000 } = options;
    const began = Date.now();
    function check() {
      if (signal?.aborted) throw fail('Tempo analysis cancelled.', 'CANCELLED');
      if (Date.now() - began > budgetMs) throw fail('Tempo analysis exceeded its time budget.', 'RESOURCE_LIMIT');
    }
    async function yieldNow() { check(); await new Promise(resolve => setTimeout(resolve, 0)); check(); }
    check();
    if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000 || !Array.isArray(channels) || !channels.length || channels.length > 8 || !Number.isFinite(maxSeconds) || maxSeconds < 8 || maxSeconds > 120 || !Number.isFinite(budgetMs) || budgetMs < 1 || budgetMs > 30000) throw fail('Invalid tempo analysis bounds.', 'INVALID_PARAMETERS');
    const length = channels[0].length;
    if (channels.some(c => !(c instanceof Float32Array) || c.length !== length)) throw fail('Expected equal PCM channel lengths.', 'INVALID_PARAMETERS');
    const count = Math.min(length, Math.floor(maxSeconds * sampleRate));
    if (count * channels.length > 12000000) throw fail('Tempo analysis is limited to 12 million selected PCM samples.', 'RESOURCE_LIMIT');
    const hop = Math.max(1, Math.round(sampleRate / 100)), rate = sampleRate / hop;
    const frames = Math.floor(count / hop), energy = new Float64Array(frames);
    for (let f = 0; f < frames; f++) {
      let sum = 0;
      for (const channel of channels) for (let i = f * hop; i < (f + 1) * hop; i++) {
        const v = channel[i];
        if (!Number.isFinite(v)) throw fail('Non-finite PCM samples are unsupported.', 'INVALID_PARAMETERS');
        sum += v * v;
      }
      energy[f] = Math.sqrt(sum / (hop * channels.length));
      if (f % 32 === 0) await yieldNow();
    }
    const onset = new Float64Array(frames);
    let strength = 0;
    for (let i = 1; i < frames; i++) { onset[i] = Math.max(0, energy[i] - energy[i - 1]); strength += onset[i] * onset[i]; }
    const report = { schema: 'hole.tempo-analysis/1', engine: 'hole-energy-autocorrelation/1', experimental: true, bpm: null, candidates: [], ambiguous: true, reason: null, coverage: { startSeconds: 0, endSeconds: frames * hop / sampleRate, sourceDurationSeconds: length / sampleRate, partial: count < length, sampleRate, channels: channels.length }, scoreMeaning: 'Normalized onset autocorrelation, not a probability or calibrated confidence.', limitations: ['Energy attacks can miss soft beats or follow subdivisions.', 'Half/double tempo and changing tempo can remain unresolved.', 'No musical key estimate; no native-engine parity or corpus accuracy claim.'] };
    if (frames / rate < 8 || strength < 1e-10) { report.reason = frames / rate < 8 ? 'insufficient-duration' : 'no-onset-energy'; return report; }
    const minLag = Math.ceil(60 * rate / 200), maxLag = Math.floor(60 * rate / 50), scores = [];
    for (let lag = minLag; lag <= maxLag; lag++) {
      let cross = 0, left = 0, right = 0;
      for (let i = lag; i < frames; i++) { cross += onset[i] * onset[i - lag]; left += onset[i] ** 2; right += onset[i - lag] ** 2; }
      scores.push({ lag, score: cross / (Math.sqrt(left * right) || 1) });
      if (lag % 8 === 0) await yieldNow();
    }
    const peaks = scores.filter((x, i) => x.score > .1 && x.score >= (scores[i - 1]?.score ?? -1) && x.score >= (scores[i + 1]?.score ?? -1));
    peaks.sort((a, b) => b.score - a.score || a.lag - b.lag);
    if (peaks.length) {
      const nearBest = peaks.filter(x => x.score >= peaks[0].score - .015).sort((a, b) => a.lag - b.lag)[0];
      peaks.splice(peaks.indexOf(nearBest), 1); peaks.unshift(nearBest);
    }
    report.candidates = peaks.slice(0, 5).map(x => ({ bpm: Math.round(6000 * rate / x.lag) / 100, periodicity: Math.round(x.score * 10000) / 10000 }));
    if (!peaks.length || peaks[0].score < .2) report.reason = 'weak-periodicity';
    else {
      report.bpm = report.candidates[0].bpm;
      report.ambiguous = peaks.slice(1).some(x => x.score >= peaks[0].score * .8);
      report.reason = report.ambiguous ? 'competing-periods-including-possible-subdivisions' : 'single-dominant-period';
    }
    check(); return report;
  }
  globalThis.HoleTempo = Object.freeze({ analyze });
})();
