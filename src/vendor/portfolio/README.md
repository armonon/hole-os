# Retained owned Portfolio renderer

Owned portfolio-studio source revision ae9a10e30204bcb9771272a48dc34a887b478693. No open-source license is asserted. Source copies and SHA-256 pins are retained in source/ and manifest.json. Reproduce with `node scripts/vendor-portfolio.mjs <owned-source-checkout>` using the already retained esbuild compiler.

engine.js bundles unchanged types.ts, site-builder.ts and data-url.ts into a browser global. Hole uses the original three template renderers and data-url codec. It replaces the JSZip orchestration with the existing Hole ZIP writer, with fixed safe asset paths, exact native source and lineage manifest. No model-viewer or external runtime is needed for the supported image/video export subset. Unsupported native model/SVG data is preserved, but cannot be exported through this adapter.

The native upstream parser deliberately reconstructs known fields. Hole does not use it because it would discard unknown extension fields. The isolated wrapper validates known structure while retaining unknown JSON fields, normalizes only temporary rendered project anchor IDs, and checks URLs/media before invoking the unchanged renderer. These checks are wrapper changes, not claims that the original editor already enforced this policy.
