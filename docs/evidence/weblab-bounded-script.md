# WebLab opt-in bounded script console

Implemented a separate synchronous JavaScript console using the retained MIT QuickJS WASM artifact. Normal WebLab HTML/CSS/browser-preview source and routes remain independent. This mode does not promise DOM compatibility or full browser JS behavior. No authored source executes merely by importing, opening, or mounting the console.

## Interface and lifecycle

Load `assets/weblab-script.js` before mounting. `HoleWebLabScript.mount(host,{getSource,onResult})` returns `{dispose()}`. Read current authored JS through `getSource` on explicit Run click. Stop and dispose abort the run; output is rendered through textContent. The module never writes Core, drafts, source, placements or storage. The integration owner must dispose on navigation/re-render.

`HoleWebLabScript.run(source,{input=null,signal,timeoutMs=1000})` resolves `{result,logs,outputBytes,engine}`. Source is a function body with `input` and `console.log/warn/error`; return a JSON-compatible value. Undefined return becomes null. Promises/async results are rejected. Each run creates one disposable module Worker and QuickJS realm. The host Worker never evaluates source as host JS. An allowlisted bridge accepts only log/result/error records, validates their shape, and never exposes fetch, DOM, storage or Core handles. The intrinsic bridge is reachable by guest code, so every channel is independently checked; logs/results remain untrusted guest data.

Admission: at most 100000 source characters and 16384 serialized JSON input characters. One active run. Default deadline 1000 ms, configurable 50–5000 ms, includes startup. Main-thread timer and AbortSignal terminate the Worker, including non-yielding loops. Accepted output totals at most 32768 UTF-8 bytes and 100 log records. Unsupported values and syntax errors fail explicitly. Runtime diagnostics are separately capped to eight 1000-character records.

These are bounded accepted output and execution lifetime limits, not a guarantee about browser process memory or OS scheduling. Guest serialization may allocate before the host validates output size; native engine heap constants were not independently calibrated. Worker termination is independent of guest cooperation. Very slow devices may need a longer deadline within the cap. No browser DOM, timers, events, imports, network or persistence capabilities are supported. No results are automatically saved or executed.

## Reproducible qualification

- `node --test tests/weblab-script.test.mjs`: 6/6 pass. Covers admission, no host evaluation, fresh Worker, concurrency, deadlines, cancellation, errors and exact retained binary/loader hashes.
- `node scripts/verify-weblab-script-browser.mjs`: PASS in Chromium 156.0.8078.48 against the actual shell at localhost:5193 with owned source/Worker routes overridden, strict Worker CSP `default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'` and service workers disabled for the initial isolated-control run. Set `HOLE_QA_SOURCE_OVERRIDE=0` to qualify built files instead. Optional HOLE_QA_URL/HOLE_CHROME/HOLE_PLAYWRIGHT_MODULE select environment.
- Actual QuickJS JSON arithmetic and logs passed. Sixteen host API probes were undefined, including Function-constructor lookup of fetch. Direct bridge request for fetch was rejected. No remote requests or page errors occurred.
- `while(true){}` hit the 300 ms deadline in 302.3 ms; a host interval advanced 30 times. Abort stopped a second loop in 102.3 ms. A subsequent run returned 42 successfully.
- 101 log records and a >32KiB result failed OUTPUT_LIMIT; malformed syntax, BigInt and Promise output failed SCRIPT_ERROR. Actual mount Run and Stop controls worked and source text remained unchanged.

This initial evidence qualifies the isolated runner and mounted controls on the real shell, not a claim that every WebLab route has been wired. Parent integration owns the normal WebLab page placement. The runtime is local only, uses no paid service, requires no remote CSP origin, and adds no authored-code grants.

Exact artifact provenance and license notices: `src/vendor/weblab-quickjs/README.md`. There is no copied GPL code or native parity claim.

## Built integrated WebLab qualification

`HOLE_QA_SOURCE_OVERRIDE=0 node scripts/verify-weblab-script-browser.mjs` passed against the current built shell on port 5193 (Chromium 156.0.8078.48), with no source overrides. Imported a real WebLab source containing `while(true){}`; opening it did not execute browser source. The preview showed its explicit Update instruction. Changed the actual script.js editor to `return 2+2;`, clicked Run, observed 4, saved a version and verified its exact JS/HTML/CSS source. Changed JS to an infinite loop and separately verified deadline, Stop, and Back-to-projects navigation: the active worker was terminated exactly once on navigation. Reload and reopen recovered the unchanged infinite-loop draft without executing it. Zero remote requests and page errors.

The integrated test uses a fresh context with service workers allowed: Playwright's service-worker blocking injector itself throws inside opaque sandboxed iframe documents, so that test harness setting was removed rather than filtering browser errors. The initial strict Worker CSP source-override qualification remains separate evidence; the built dev server does not prove deployed headers.
