# Retained Ghost garment engine

Selected source from the locally owned Ghost Studio repository, revision `5a6356b92626c29a3122b7c81db52d85f8522283`. `manifest.json` records exact source file hashes. App source ownership is retained; no open-source license is asserted for the app. Three.js and fflate MIT notices accompany their selected dependencies.

Regenerate with `node scripts/vendor-ghost.mjs` against that exact local revision. The bundler substitutes only `engine/client.js`: cloth requests travel to the scoped host computation transport rather than creating a worker inside the opaque editor. Document validation, photo preparation, cloth algorithms, rendering, GLB writer and loader remain retained source. No repository metadata, original sample photographs or full application deployment is included.

The host creates only this same-origin bundled worker: `/assets/vendor/ghost/drape-worker.js`. Recommended response CSP: `default-src 'none'; script-src 'self'; connect-src 'none'; worker-src 'none'; base-uri 'none'`. The worker has no runtime imports or network fetches. The opaque editor retains `connect-src 'none'; worker-src 'none'`.

The generated garment is inferred visual drape. It is not measured fit, recovered sewing patterns or calibrated cloth simulation. Original Ghost remains available for its broader workflows.
