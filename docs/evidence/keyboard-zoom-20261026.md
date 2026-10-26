# Keyboard, browser zoom and reduced-motion qualification — 26 October 2026

`node scripts/verify-accessibility-browser.mjs` exercises the integrated static preview at `http://127.0.0.1:5193` without building or deploying. It uses an installed Chrome for Testing 153 browser and a disposable profile/extension. The extension only requests the tabs capability to call `chrome.tabs.setZoom`; the harness verifies the returned zoom and device-pixel ratio. This is real browser zoom, not CSS scaling or a simulated pinch.

At 100%, 200% and 400% of a 1280×900 browser viewport, the CSS viewports are 1280×900, 640×450 and 320×225. The matrix covers Librarian text reading/page control, Bounce, Smart composition controls, Crew source/plan review, package review, WebLab's isolated preview and studio window-layout controls. Enter activates selected controls, Tab cannot move to background controls while native dialogs are modal, Escape closes dialogs and restores the originating control. Browser chrome remains reachable through normal native Tab behavior. Focused dialog controls have an outline or shadow. Reduced-motion checks confirm no nonzero workspace animation durations. These checks do not claim every application control was traversed, nor do programmatic initial focus and keyboard activation prove end-to-end keyboard discovery.

The first expanded run found a real 400% zoom defect: `.hc-studio-host` had a 300px CSS minimum height despite a 225px viewport and a correctly fitted requested height. The resulting host bounds were 320×300, extending 75px below the viewport. The coordinator was given the exact source rule and a viewport-bounded minimum-size fix; final rerun status is recorded below.

## Safari availability and remaining limits

macOS has Safari 26.0.1 and `/usr/bin/safaridriver`. An actual WebDriver session request was rejected: “You must enable 'Allow remote automation' in the Developer section of Safari Settings to control Safari via WebDriver.” The driver was stopped and the setting was not changed. Safari behavior is therefore unqualified; a Chromium run is not Safari/WebKit evidence.

No physical touch device, screen reader, visual contrast measurement, full keyboard audit, macOS accessibility permission change, production service or external send was used. The browser contexts and test content are disposable. This evidence supplements functional tests and does not close all P11 release gates.

Final rerun: PASS after the coordinator changed the studio minimum dimensions to `min(300px,100dvh)` and `min(260px,100vw)` and rebuilt the static preview. All 21 view/zoom cases completed with no reported overflow or JavaScript page errors; the keyboard dialog checks and fitted studio bounds passed at all three zoom levels. Browser: Chrome for Testing 153.0.8010.12.
