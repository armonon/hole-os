import assert from 'node:assert/strict';
import test from 'node:test';
import '../src/world-tools.js';

const model = globalThis.HoleWorldToolsModel;
const place = { name: 'Library', latitude: '37.7793', longitude: '-122.4193', date: '2026-10-26', timeZone: 'America/Los_Angeles', notes: 'Private trip note', linkedAssetId: 'private-photo' };
const phrase = { sourceLanguage: 'en', targetLanguage: 'es', sourceText: 'Good morning', targetText: 'Buenos días' };

test('Atlas validates real coordinates, calendar dates and explicit zones', () => {
  const saved = model.place(place);
  assert.equal(saved.latitude, 37.7793); assert.equal(saved.privacy, 'local-private');
  for (const patch of [{ latitude: '' }, { latitude: 91 }, { longitude: -181 }, { longitude: Infinity }, { date: '2026-02-30' }, { timeZone: 'Mars/Olympus' }, { timeZone: undefined }]) assert.throws(() => model.place({ ...place, ...patch }));
  const url = model.mapURL(place);
  assert.ok(url.startsWith('https://www.openstreetmap.org/'));
  assert.ok(!url.includes('Private') && !url.includes('private-photo'));
});

test('Tongue exports actual timed subtitles and refuses overlaps or zero-length cues', () => {
  const cards = [{ ...phrase, cue: { start: 0, end: 2.25 } }, { ...phrase, targetText: 'Gracias', cue: { start: 3, end: 4.5 } }];
  const srt = model.subtitles(cards);
  assert.match(srt, /00:00:00,000 --> 00:00:02,250\nBuenos días/);
  assert.match(srt, /00:00:03,000 --> 00:00:04,500\nGracias/);
  assert.throws(() => model.subtitles([cards[0], { ...cards[1], cue: { start: 2, end: 3 } }]), /overlap/);
  assert.throws(() => model.phrase({ ...phrase, cue: { start: 0, end: 0.0004 } }));
});

test('practice progress measures exact written answers and retains diacritics', () => {
  assert.equal(model.review(phrase, '  BUENOS   DÍAS  ', 1000).lastCorrect, true);
  const wrong = model.review(phrase, 'Buenos dias', 1000);
  assert.equal(wrong.lastCorrect, false); assert.equal(wrong.attempts, 1); assert.equal(wrong.nextReviewAt, 601000);
  const corrected = model.review({ ...phrase, progress: wrong }, 'Buenos días', 2000);
  assert.equal(corrected.correct, 1); assert.equal(corrected.attempts, 2);
});

test('translation checks never invent a result or silently trigger a model download', async () => {
  let created = 0;
  assert.equal(await model.translatorStatus(null, 'en', 'es'), 'unsupported');
  for (const state of ['available', 'downloadable', 'downloading', 'unavailable']) {
    const engine = { availability: async options => { assert.equal(options.sourceLanguage, 'en'); return state; }, create: () => { created++; } };
    assert.equal(await model.translatorStatus(engine, 'en', 'es'), state);
  }
  assert.equal(created, 0);
});
