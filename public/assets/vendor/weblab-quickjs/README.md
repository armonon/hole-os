# Retained QuickJS sandbox binary

`quickjs-eval.js` and `quickjs-eval.wasm` are exact, unmodified copies from the already installed `pdfjs-dist@6.4.299/wasm/` distribution (PDF.js build `d0991a0d5`). No runtime package or compiler installation was needed. The application wrapper is separate in `../../weblab-script-worker.js`.

| Artifact | SHA-256 |
| --- | --- |
| quickjs-eval.js | fe7930418e869791ce892567dbd0bc4698152b7e550b5cefa553992c56ddc325 |
| quickjs-eval.wasm | 7bcacc9f22cacf7e9b23866d2a6d1639693d40c7f144e41b7c69ed37ba9cbe8f |

Primary upstream sources:
- Distribution: https://www.npmjs.com/package/pdfjs-dist/v/6.4.299
- PDF.js integration/license explanation: https://github.com/mozilla/pdf.js/blob/master/external/quickjs/README.md
- Adapter source and build tooling: https://github.com/mozilla/pdf.js.quickjs
- Interpreter source: https://github.com/bellard/quickjs

Both QuickJS and the PDF.js QuickJS adapter use MIT licenses. Retained notices are `LICENSE-QUICKJS` (Bellard/Gordon) and `LICENSE-MOZILLA` (Mozilla), retrieved from the respective primary repositories on 2026-10-26. PDF.js itself is Apache-2.0; the linked integration README explicitly identifies this component's MIT licensing.

The installed distribution does not identify a separate exact QuickJS source commit. These hashes pin the actual shipped artifacts; current upstream C source is explanatory, not a reproducible binary build claim. In particular, upstream memory and interrupt constants are not claimed as qualified limits of this binary. The wrapper's independently enforced timeout terminates the containing Worker.

No guest source reaches JavaScript eval in the host Worker. The Emscripten loader uses same-origin WebAssembly loading; required Worker policy is `default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'`. No external origin is required.
