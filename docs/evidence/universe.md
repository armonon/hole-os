# Universe implementation and evidence

## Implemented surface

`src/universe.js` mounts over the existing project card DOM. It consumes Core placements (`x`, `y`, `depth`, `rotation`, `scale`) and stores camera/presentation data in `scenes/universe:<projectId>`. Legacy `z` is never interpreted as depth. Real CSS perspective and 3D transforms produce depth-dependent projection and yaw parallax. Editors remain ordinary readable DOM outside this renderer.

Orbit uses empty-surface drag and pinch. Explore is explicitly entered and owns WASD/QE, arrows, Shift and F only while the scene itself has keyboard focus. Escape exits Explore. Pointer cancellation, lost capture, Escape, blur, hidden-tab transitions and unmount revert the complete uncommitted camera gesture, including drag-to-pinch transitions. The renderer installs no wheel listener and never intercepts browser magnification shortcuts or editor input. Buttons provide alternatives to pointer navigation.

An always-visible Return to Flat control is available alongside List view. The material chooser also has a direct Open selected material button; overlapping projected cards do not prevent access to a specific item. Reduced motion forces a stable list. Unsupported CSS 3D uses the same list. Compact displays start with a phone outline and use separate `deviceViews.compact` camera/preferences, preserving `deviceViews.desktop`. Canonical placement changes require the explicit Apply position control and reject a stale placement revision.

Six color/lighting environments, a depth amount, depth-lighting strength, opt-in synthesized ambient tones and named view presets are implemented. Lighting is a CSS depth cue, not a physically based light simulation. Saved presets include camera and visual preferences; they do not replace file content or canonical placements. Ambient audio is never autostarted/restored; it suspends when hidden and is released on unmount.

## Lifecycle and complexity bounds

At most 30 cards are visible in spatial mode. The accessible list reaches every project material, and its chooser can focus any material in the scene. Camera frames run only during explicitly held Explore keys; idle scenes have no animation loop. Hidden surfaces stop the navigation loop. Cleanup removes observers/listeners, releases generated audio, restores the original card nodes and stores the current device camera. Parent integration may call `HoleUniverse.unmountAll()` before replacing a view; removal/hidden observation also cleans up.

The parent project surface currently creates its material cards and preview URLs before mounting Universe. Universe does not claim to virtualize that upstream creation or eliminate its texture memory. A future large-library pass should virtualize upstream card/preview creation while preserving the complete semantic list. This renderer uses no WebGL context, textures, or physics engine of its own.

## Verification

`node --test tests/universe*.test.mjs` passes twelve checks: separate zoom/depth semantics, perspective projection, yaw-dependent parallax, camera-heading movement and bounded inputs, scoped navigation/device profile/lifecycle contracts, six actual DOM-event-harness cancellation paths, and stale placement Apply refusal. These are model, event-harness and source checks, not browser rendering benchmarks.

Reference-device frame time, input latency, GPU memory, Safari, and physical-touch measurements remain unverified at this package handoff. Do not claim universal 60 fps or cross-browser validation. Root integration/browser QA should record the actual runtime, viewport, dataset size, visible count, navigation responsiveness and output screenshot. The required 200-indexed/30-visible performance target remains a measurement gate until those checks are recorded.

Richer furniture, user-defined interactive spatial objects and configurable physics remain later capability packages under the brief. They are not represented by nonfunctional controls in this renderer.
