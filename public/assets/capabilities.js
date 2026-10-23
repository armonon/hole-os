/* Capabilities describe implemented Hole behavior, not the ambition of a tile.
 * External routes never transfer bytes or imply processing has completed.
 * Public declarations reviewed 2026-10-23; see CATALOG.md for evidence/limits. */
(() => {
  'use strict';
  const labels = Object.freeze({ local: 'Local utility', external: 'External app', partial: 'Partial preview', concept: 'Concept', future: 'Future capability' });
  const entry = (status, description) => Object.freeze({ status, label: labels[status], description });
  const catalog = Object.freeze({
    Notes: entry('local', 'A browser-saved scratchpad that can save a separate text snapshot to Files.'),
    Files: entry('local', 'Browser-local files, text creation and version editing, supported previews, history and image conversion.'),
    Music: entry('partial', 'A soundless playback interface preview. Use Files to play your own supported audio.'),
    Photos: entry('partial', 'A sample color gallery, with no user photo library. Preview imported images in Files.'),
    Browser: entry('external', 'Opens the existing Hole search workspace in another tab. No embedded browsing or query handoff.'),
    Messages: entry('concept', 'A messaging interface concept. Open NOW or Circle for their external services.'),
    Calendar: entry('concept', 'A calendar concept; no calendar account or events are connected.'),
    Studio: entry('concept', 'A creative workspace concept; open a named external studio for its current tools.'),
    Clock: entry('local', 'Shows local time captured when opened; this tile is not a live clock.'),
    Camera: entry('concept', 'A camera concept; no capture is implemented.'),
    Maps: entry('concept', 'A maps concept; no map or location service is connected.'),
    Mail: entry('concept', 'A mail concept; no inbox is connected.'),
    Tasks: entry('concept', 'A task-list concept; task management is not implemented.'),
    Phone: entry('concept', 'A phone concept; no calling service is connected.'),
    Weather: entry('concept', 'A weather concept; no forecast service is connected.'),
    Recorder: entry('concept', 'An audio-recorder concept; recording is not implemented.'),
    Canvas: entry('concept', 'A drawing concept; this tile is not the external Creating Co tool with the same name.'),
    Calculator: entry('concept', 'A calculator concept; calculations are not implemented.'),
    Contacts: entry('concept', 'A contacts concept; no address book is connected.'),
    Books: entry('concept', 'A reading concept. Open Librarian for its separate browser PDF reader.'),
    Terminal: entry('concept', 'A terminal concept; no shell commands are executed.'),
    Windows: entry('future', 'No Windows computer is connected. Native execution and remote streaming are future capabilities.'),
    Linux: entry('future', 'No Linux computer is connected. Native execution and remote streaming are future capabilities.'),
    Mac: entry('future', 'No Mac computer is connected. Native execution and remote streaming are future capabilities.'),
    Store: entry('concept', 'An app-store concept; installs and purchases are not implemented.'),
    Settings: entry('concept', 'A settings tile concept. Use Control Center for working workspace preferences.'),
    Compass: entry('concept', 'A compass concept; no device heading is read.'),
    Translate: entry('concept', 'A translation concept; no translation service is connected.'),
    Drive: entry('concept', 'A drive concept; no cloud storage or synchronization is connected.'),
    Meet: entry('concept', 'A meeting concept; no call service is connected.'),
    Code: entry('concept', 'A code-editor concept; code editing and execution are not implemented here.'),
    Docs: entry('concept', 'A document-editor concept; it does not edit documents.'),
    Wallet: entry('concept', 'A wallet concept; no accounts, payments or funds are connected.'),
    Shortcuts: entry('concept', 'An automation concept; workflows are not executed.'),
    Health: entry('concept', 'A health concept; no records or device data are connected.'),
    Play: entry('concept', 'A game-launcher concept; no playable game is included.'),
    Home: entry('concept', 'A home-control concept; no devices are connected.'),
    Luma: entry('external', 'A separate browser image editor. Native RAW and desktop print capabilities vary by edition.'),
    Glyph: entry('external', 'A separate public-alpha font editor; it is distinct from the lettering tool inside Luma.'),
    Form: entry('external', 'A separate browser 3D/CAD studio. Desktop geometry and manufacturing capabilities vary.'),
    ScenePilot: entry('external', 'Opens Browser Lite video editing. Native media processing belongs to a separate edition.'),
    StemDeck: entry('external', 'A separate online stem-remix studio. Hole does not separate stems or run its processing.'),
    Bounce: entry('external', 'A separate browser audio player. Browser codecs determine playback; no processed-audio return is promised.'),
    Librarian: entry('external', 'A separate PDF reader and book-discovery app. No edited-PDF return is promised.'),
    Locker: entry('external', 'A separate browser-local file library. It does not share Hole storage or provide account sync.'),
    NOW: entry('external', 'A separate messaging service; account features may require sign-in. Messages are not end-to-end encrypted.'),
    Circle: entry('external', 'A separate community for profiles, projects and discussions; contribution features may require sign-in.'),
    Ghost: entry('external', 'A separate garment-visualization studio. Its models are not measured fit or sewing patterns.'),
    Moodboard: entry('external', 'A separate reference canvas. Check its current persistence and export support before relying on it.'),
    Animate: entry('external', 'A separate animation alpha. Check its current save and export support before relying on it.'),
    Portfolio: entry('external', 'A separate portfolio builder. Exporting a portfolio does not publish a website.'),
    Converter: entry('external', 'A separate browser converter. Supported formats and codec limits are shown in that app.')
  });
  const TEXT_LIMIT = 262144;
  const routes = Object.freeze({
    text: Object.freeze({ id: 'text-editor', name: 'Text editor', mode: 'local', description: 'Edit a separate text version in Hole. Your original stays unchanged.' }),
    luma: Object.freeze({ id: 'luma', name: 'Luma', mode: 'external', url: 'https://luma.thecreatingco.com/studio', description: 'Edit PNG, JPEG or WebP in a separate app. Download your source and choose it there yourself; Hole does not send it.' }),
    bounce: Object.freeze({ id: 'bounce', name: 'Bounce', mode: 'external', url: 'https://bounce.thecreatingco.com/browser/', description: 'Listen in a separate browser player. Download your source and choose it there yourself. Playback depends on browser codecs; this is not audio processing.' }),
    librarian: Object.freeze({ id: 'librarian', name: 'Librarian', mode: 'external', url: 'https://librarian.thecreatingco.com/', description: 'Read a PDF in a separate app. Download your source and choose it there yourself; no edited PDF is promised.' })
  });
  function get(name) {
    return typeof name === 'string' && Object.hasOwn(catalog, name) ? catalog[name] : null;
  }
  function list() {
    return Object.entries(catalog).map(([name, metadata]) => ({ name, ...metadata }));
  }
  function forFile(file) {
    if (!file || typeof file.type !== 'string' || !Number.isSafeInteger(file.size) || file.size < 0) return [];
    if (['text/plain', 'text/markdown'].includes(file.type) && file.size <= TEXT_LIMIT) return [routes.text];
    if (['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return [routes.luma];
    if (['audio/mpeg', 'audio/wav', 'audio/x-wav'].includes(file.type)) return [routes.bounce];
    if (file.type === 'application/pdf') return [routes.librarian];
    return [];
  }
  globalThis.HoleCapabilities = Object.freeze({ get, list, forFile, TEXT_LIMIT });
})();
