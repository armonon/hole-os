# Hole OS project

- Edit the interface in `src/hole-fluid-os.html`; build `public/index.html` with `npm run build`.
- Keep the shared movement language consistent across the desktop, workspace overview, and App Drawer.
- Selected desktops use small upright icons. The bubble universe belongs to the App Drawer.
- Preserve mouse, keyboard, wheel, touch swipe, long-press file movement, pinch anchors, and reduced-motion behavior.
- Keep the standalone runtime's browser persistence separate from the interface. No account sync or remote native-app execution exists yet; describe prototype screens truthfully.
- Use `npm run dev` for local or Codespaces preview on port 5173. Check the affected interactions and phone layout after meaningful UI changes.
- Deploy only this project's `public/` directory to the Hole Netlify site. Other projects in the parent directory are unrelated.

