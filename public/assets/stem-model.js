(() => {
  const manifest = Object.freeze({ id: 'htdemucs-92e33df6', bytes: 180534758, sha256: 'e5e425c17683f163a472462eb5f5a4ffcd11c31858d57fbd0833b012d8b88077' });
  globalThis.HoleStemModel = Object.freeze({ manifest, revision: '92e33df61cfc9eb820272aaa62d2ef6dcf4d950d', install: blob => HoleModelStore.install(manifest, blob), status: () => HoleModelStore.status(manifest), remove: () => HoleModelStore.remove(manifest) });
})();
