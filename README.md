# Hole OS

A fluid browser workspace with a circular spaces manager, small upright desktop icons, and a circular App Drawer. Drag or swipe to pan, pinch or Ctrl-scroll to zoom. Zoom far enough out of a desktop to return to your spaces; tap a space to enter. Empty canvas taps gently focus that area, and a sustained hold increases the zoom. Single-click opens files; right-click or a stationary long-press opens Quick Tools. Continue a touch hold and drag to move a desktop file.

The drawer and dock share colored circular app icons. Spaces and App Drawer stay fixed beside a scrollable app row: Notes, Music, and Files are pinned, every running app stays available, and the three most recently used closed apps remain as shortcuts. Drag, swipe, or scroll the row; arrow keys move between dock buttons. Running dots belong to the current tab, while recent shortcuts are saved in this browser.

## Open Hole

- Live app: https://hole-os-armonon.netlify.app
- Source: https://github.com/armonon/hole-os
- Browser code editor: https://github.dev/armonon/hole-os

The source repository is private. Sign in to the owning GitHub account to edit it. The published workspace is publicly accessible. Notes, layouts, and window geometry are saved in browser storage; imported file bytes and version history use IndexedDB on that browser. Clearing site data removes those local files, so export anything you need to keep.

## Work from another computer

For quick code changes, open the browser code editor above, edit the source, then commit and push.

For a full terminal and running preview, open the repository, select **Code → Codespaces → Create codespace on main**, then run:

```sh
npm run dev
```

Open the forwarded **5173** port. The repository includes the Codespaces configuration; no application dependencies need installing. Codespaces availability and compute usage follow your GitHub account settings.

For local development:

```sh
git clone https://github.com/armonon/hole-os.git
cd hole-os
npm run dev
```

## Edit and build

The shell and shared gestures live in `src/hole-fluid-os.html`. `window-system.js` handles resizing, fullscreen, and the dock gesture; `file-platform.js` handles files and real jobs; `welcome.js` handles Welcome, About, and Control Center; `browser.js` connects the Browser window to the existing Hole search workspace. Each module has a matching stylesheet. `ecosystem.js` lists the verified Creating Co destinations. Keep the desktop, overview, and App Drawer on the shared gesture system. Build and test with:

```sh
npm run build
npm test
```

Netlify publishes `public/`. The original interface source is retained separately from the browser runtime so it can also remain usable in the conversation preview.

## Publish remote changes

Push a commit to `main` and Netlify automatically runs `npm run build` and updates the live site. The connection uses a read-only deploy key scoped to this repository and a push webhook; no hosting credentials are stored in the source.

```sh
git add src scripts public
git commit -m "Refine Hole workspace"
git push
```

Use the GitHub web editor's **Commit & Push** action for browser-only edits. Check build status in the [Netlify dashboard](https://app.netlify.com/projects/hole-os-armonon/deploys). The live site changes only after a successful deployment.

## Current features and scope

- Create up to twelve custom project spaces. Camera views, file placements, pinned imported files, recent apps, and open/minimized app sessions survive reloads.
- Resize windows with the corner handle or its arrow-key controls. Fullscreen reduces the dock to a handle; hover or press Enter to reveal it. Start an upward swipe on that handle: 10% reveals the dock, 30% returns to the desktop, and 50% opens all spaces. Release commits the selected stage; reversing the gesture changes it before release.
- Import files, preview supported media/text, rename, duplicate, download, place on a desktop, and inspect version history. PNG/JPEG/WebP conversion creates a new real file while preserving its original. Activity shows actual conversion work and outcomes. Files stay in this browser.
- Welcome offers an expanding full-app launcher, Circle and NOW messaging shortcuts, and a Hole Browser search launcher. Discover Creating Co and its product stories live in the in-Hole About page, reachable from Welcome and Control Center. Files and actual job activity remain accessible through Control Center. Control Center also provides appearance, quiet motion, focus, layout, and portable setup JSON. Setup files contain layout metadata, not private files or notes; they are not account sync.
- The drawer includes fifteen verified Creating Co destinations alongside the existing utility and concept apps. External apps open in another tab and require manual file handoff. The Hole Browser card opens the existing searchable Hole workspace; it does not submit a query from the OS because the upstream app currently has no supported query handoff. Audio stem separation is an explicit external workflow, not a built-in processing service.

There is no account authentication, live phone pairing, cross-device file sync, cloud computer, or native Windows/macOS/Linux application execution yet. Welcome is a public start screen, not a security lock. Some existing app tiles remain concept screens. Remote code editing is available through GitHub and Codespaces above.

## Verification

Run `npm test` for production-code checks of gesture thresholds and reversibility, file names/formats/limits, and saved-state validation. The overhaul was also checked in the browser at desktop and 320-pixel widths: circular navigation, zoom-out return, keyboard resizing, fullscreen dock gestures, recent apps, real image import/conversion/history, previews, pinned-file reload, quiet motion, and appearance controls. Physical touch-device testing remains outstanding.

## References

- [GitHub browser editing](https://docs.github.com/en/codespaces/the-githubdev-web-based-editor)
- [Creating a Codespace](https://docs.github.com/en/codespaces/developing-in-a-codespace/creating-a-codespace-for-a-repository)
