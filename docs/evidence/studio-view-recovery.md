# Studio continuity and explicit recovery

Actual Chrome156.0.8078.48 test `scripts/verify-view-continuity-browser.mjs` opens simultaneous Luma and Glyph native instances. Independent dirty image dimensions and glyph advance survive Desktop→Canvas→Smart Screen→Universe→Desktop while runtime IDs remain stable and committed originals remain unchanged. Resuming/saving Glyph leaves Luma's independent dirty content intact. This is a concrete two-studio view matrix, not every app/device qualification.

The Animate shell test exposed a shared close/reopen gap: native recovery persisted under an old runtime identity but reopening created a fresh identity without offering that draft. The host now checkpoints initial runtime identity, discovers matching closed native recovery, and offers explicit Recover studio draft versus Open selected saved version. Recovery reuses the original instance identity and version grants. A changed head produces a version conflict; neither current content nor the draft is silently overwritten. Arrangements still use fresh identity/current content and do not restore recovery implicitly.

Three recovery tests cover matching app/resource, newest-first selection, live-instance exclusion, saved/no-recovery exclusion, exact input binding and malformed checkpoint skipping. Actual Animate browser checks verify unsaved close→explicit recover→save/reopen and older-draft/newer-head conflict preservation. Recovery remains available separately if the user opens a saved version. Source format bounds and each editor's own errors remain in force.

This does not imply that all canonical local tools are independently resizable runtime windows, that every historical checkpoint is valid, or that physical touch/assistive-technology/browser coverage is complete.
