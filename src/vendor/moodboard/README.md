# Retained Moodboard codec and renderer

Owned private source: `tcc-operations/repos/moodboard`, commit `b2a54d1acaa902a06c2fd99a367deb7bbe5e42cf`. The exact five TypeScript source modules are retained under `source/`. No separate public source license is asserted. `engine.js` exposes the actual native serializer/parser, layout helpers, canvas PNG/PDF renderer, and original-images/layout ZIP exporter. It is a standalone IIFE bundle generated with esbuild from the owned checkout, including its installed JSZip 3.10.2. JSZip is used under its MIT option; its notice and bundled Pako notice are retained.

Hole validates a bounded safe subset before calling this retained renderer. The original full Moodboard application remains available. This bundle does not import its origin's IndexedDB or claim all editing parity.
