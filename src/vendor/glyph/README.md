# Retained Glyph native engine

Owned source: `tcc-operations/repos/glyph-studio` at `e699025f624a29ed122a38b4bee6286157d91dfa`. This bundle exports its unchanged native project parser/serializer/validation, glyph model/geometry and actual OTF/TTF compilers. Rebuild explicitly with `node scripts/vendor-glyph.mjs /absolute/path/to/glyph-studio`; normal builds copy the committed engine.

The bounded Hole surface preserves native strokes, metrics and kerning while exposing brush drawing, family/advance edits, native checkpoint/save and font export. It is not the full retained pen/curve/kerning editor or full studio parity. Keep that external route. The real compiler includes legacy kerning in TTF; its OTF export omits kerning and the mounted UI discloses this.

The private owned source has no separate public license here. Dependency notices are retained in THIRD-PARTY-NOTICES.txt and generated legal comments. No external studio deployment is modified.
