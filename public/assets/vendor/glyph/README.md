# Retained Glyph native engine

Owned source: `tcc-operations/repos/glyph-studio` at `e699025f624a29ed122a38b4bee6286157d91dfa`. This bundle exports its unchanged native project parser/serializer/validation, glyph model/geometry, pair editing/type layout and actual OTF/TTF compilers. Rebuild explicitly with `node scripts/vendor-glyph.mjs /absolute/path/to/glyph-studio`; normal builds copy the committed engine.

The bounded Hole surface preserves native strokes, metrics and kerning while exposing brush drawing, family/advance edits, bounded kerning pairs and type preview, native checkpoint/save and font export. It is not the full retained pen/curve/kerning editor or full studio parity. Keep that external route. The real compiler includes legacy kerning in TTF; its OTF export omits kerning and the mounted UI discloses this.

The private owned source has no separate public license here. Dependency notices are retained in THIRD-PARTY-NOTICES.txt and generated legal comments. No external studio deployment is modified.

Wave13 adds only named exports `layoutText`, `setKerningPair` and `removeKerningPair` from the same unchanged retained source revision; no external source files were modified. Refreshed bundle SHA-256: `8a9b1150374929da4d65eb80eb1714e150bc7690afa62d8f81acf2c76e6073ae`. Dependency notice SHA-256 remains `8ce16e35c35632c6a52dd9fa4b96e6b2fa6f01dfa521cf262c5e0ec1354668ad`. Existing parser, serializer, validation, model and compiler exports remain present.
