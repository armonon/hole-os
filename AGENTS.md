# Hole OS project

- Edit the shared shell and gestures in `src/hole-fluid-os.html`, and the matching window-system, file-platform, welcome, and ecosystem modules in `src/`. Build `public/index.html` and `public/assets/` with `npm run build`; run `npm test` for state, file-model, and gesture checks.
- Keep the shared movement language consistent across the desktop, workspace overview, and App Drawer.
- Selected desktops use small upright icons. The bubble universe belongs to the App Drawer.
- Preserve mouse, keyboard, wheel, touch swipe, long-press file movement, pinch anchors, and reduced-motion behavior.
- Keep the standalone runtime's browser persistence separate from the interface. No account sync or remote native-app execution exists yet; describe prototype screens truthfully.
- Use `npm run dev` for local or Codespaces preview on port 5173. Check the affected interactions and phone layout after meaningful UI changes.
- Deploy only this project's `public/` directory to the Hole Netlify site. Other projects in the parent directory are unrelated.

