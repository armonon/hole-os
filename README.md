# Hole OS

A fluid browser desktop with a spatial workspace overview, small upright desktop icons, and a bubble App Drawer. The same gestures work across the desktop and App Drawer: drag or swipe to pan, pinch or Ctrl-scroll to zoom, and hold a file on touch to move it.

The drawer and dock share colored circular app icons. Home and App Drawer stay fixed beside a scrollable app row: Notes, Music, and Files are pinned, every running app stays available, and the three most recently used closed apps remain as shortcuts. Drag, swipe, or scroll the row; arrow keys move between dock buttons. Running dots belong to the current tab, while recent shortcuts are saved in this browser.

## Open Hole

- Live app: https://hole-os-armonon.netlify.app
- Source: https://github.com/armonon/hole-os
- Browser code editor: https://github.dev/armonon/hole-os

The source repository is private. Sign in to the owning GitHub account to edit it. The published prototype is publicly accessible; each visitor's sample notes, file placements, and camera views are stored only in that browser.

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

The canonical interface is `src/hole-fluid-os.html`. Keep the desktop, overview, and App Drawer on the shared gesture system. Build the standalone site with:

```sh
npm run build
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

## Current scope

This is an interactive interface prototype. Notes, workspace arrangement, navigation, window controls, and view persistence work locally. App tiles include representative utilities and concept screens. There is no account system, cross-device file sync, cloud computer, or Windows/macOS/Linux application execution yet. Publishing the UI does not add those backend services.

## Interaction verification

The shared gesture implementation passed 27 simulated touch/wheel assertions covering swipe, hold-and-drag, pinch anchors, second-pointer transitions, cancellation, and app-body wheel isolation. Mouse dragging, native scrolling inside Notes, state restoration, and 320-pixel layouts were also checked. Physical touch-device testing remains outstanding.

The recent-app dock was checked at desktop, Pocket, and 320-pixel widths: six running apps, three closed recents, pinned-app deduplication, minimize/restore, immediate close/reopen, keyboard reveal, wheel/drag isolation, reload, and cross-tab persistence. The updated app produced no browser console errors during these checks.

## References

- [GitHub browser editing](https://docs.github.com/en/codespaces/the-githubdev-web-based-editor)
- [Creating a Codespace](https://docs.github.com/en/codespaces/developing-in-a-codespace/creating-a-codespace-for-a-repository)
