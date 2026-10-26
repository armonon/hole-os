/* Small, dependency-free codecs used by actual Hole actions. ZIP uses STORE:
 * packaging does not claim to reduce already-compressed media size. */
(() => {
  'use strict';
  const fail = (message, code = 'INVALID_PARAMETERS') => Object.assign(new Error(message), { code });
  const finite = (value, label, min, max) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw fail(`${label} must be between ${min} and ${max}.`);
    return value;
  };
  function dimensions(width, height) {
    finite(width, 'Width', 1, 16384); finite(height, 'Height', 1, 16384);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width * height > 40000000) throw fail('Image dimensions must be whole pixels, up to 40 megapixels.');
    return { width, height };
  }
  function focalCrop(sourceWidth, sourceHeight, width, height, focalPoint) {
    dimensions(sourceWidth, sourceHeight); dimensions(width, height);
    if (!focalPoint || typeof focalPoint !== 'object') throw fail('Choose a focal point before cropping.');
    const x = finite(focalPoint.x, 'Focal point x', 0, 1), y = finite(focalPoint.y, 'Focal point y', 0, 1);
    const scale = Math.max(width / sourceWidth, height / sourceHeight);
    const cropWidth = width / scale, cropHeight = height / scale;
    const sx = Math.max(0, Math.min(sourceWidth - cropWidth, sourceWidth * x - cropWidth / 2));
    const sy = Math.max(0, Math.min(sourceHeight - cropHeight, sourceHeight * y - cropHeight / 2));
    return { x: sx, y: sy, width: cropWidth, height: cropHeight, outputWidth: width, outputHeight: height, scale, needsUpscale: scale > 1 + 1e-8 };
  }
  function resizeGeometry(sourceWidth, sourceHeight, width, height) {
    dimensions(sourceWidth, sourceHeight);
    if (width == null && height == null) throw fail('Choose an output width or height.');
    if (width != null) finite(width, 'Width', 1, 16384);
    if (height != null) finite(height, 'Height', 1, 16384);
    // Fit within the requested bounds while preserving the original ratio.
    const scale = Math.min(width == null ? Infinity : width / sourceWidth, height == null ? Infinity : height / sourceHeight);
    const result = dimensions(Math.max(1, Math.round(sourceWidth * scale)), Math.max(1, Math.round(sourceHeight * scale)));
    return { x: 0, y: 0, width: sourceWidth, height: sourceHeight, outputWidth: result.width, outputHeight: result.height, scale, needsUpscale: scale > 1 + 1e-8 };
  }
  function explicitCrop(sourceWidth, sourceHeight, crop, width, height) {
    dimensions(sourceWidth, sourceHeight);
    if (!crop || typeof crop !== 'object') throw fail('Choose a crop rectangle.');
    const x = finite(crop.x, 'Crop x', 0, sourceWidth - 1), y = finite(crop.y, 'Crop y', 0, sourceHeight - 1);
    const cw = finite(crop.width, 'Crop width', 1, sourceWidth - x), ch = finite(crop.height, 'Crop height', 1, sourceHeight - y);
    const ow = width == null ? Math.round(cw) : width, oh = height == null ? Math.round(ch) : height;
    dimensions(ow, oh);
    if (Math.abs(ow / oh - cw / ch) > Math.max(1 / oh, 1 / ch)) throw fail('Crop output must keep its aspect ratio; adjust the crop instead of stretching it.');
    const scale = Math.max(ow / cw, oh / ch);
    return { x, y, width: cw, height: ch, outputWidth: ow, outputHeight: oh, scale, needsUpscale: scale > 1 + 1e-8 };
  }
  function safeName(value, fallback = 'untitled') {
    const name = String(value || '').normalize('NFKC').replace(/\.[a-z0-9]{1,8}$/i, '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 90);
    return name || fallback;
  }
  const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
    for (let i = 0; i < 8; i++) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    return value >>> 0;
  });
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  function zipDate(timestamp) {
    const date = new Date(timestamp || 0);
    const year = Math.min(2107, Math.max(1980, date.getUTCFullYear() || 1980));
    return { time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2), date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate() };
  }
  async function zip(entries, options = {}) {
    if (!Array.isArray(entries) || entries.length > 1000) throw fail('A package may contain up to 1000 files.');
    const chunks = [], directory = [], seen = new Set(), encoder = new TextEncoder();
    let offset = 0, total = 0;
    const stamp = zipDate(options.timestamp);
    for (const entry of entries) {
      if (options.signal?.aborted) throw fail('Packaging cancelled.', 'CANCELLED');
      const name = String(entry.name || '');
      if (!name || name.includes('\\') || name.startsWith('/') || name.split('/').some(part => !part || part === '.' || part === '..') || /[\x00-\x1f]/.test(name) || seen.has(name)) throw fail('Archive filenames must be unique, safe relative paths.');
      seen.add(name);
      const filename = encoder.encode(name);
      if (entry.blob instanceof Blob && (entry.blob.size > 268435456 || total + entry.blob.size > 536870912)) throw fail('Package exceeds the 512 MiB browser packaging limit.', 'RESOURCE_LIMIT');
      const bytes = entry.blob instanceof Blob ? new Uint8Array(await entry.blob.arrayBuffer()) : entry.bytes instanceof Uint8Array ? entry.bytes : encoder.encode(String(entry.text ?? ''));
      if (filename.length > 65535 || bytes.length > 268435456 || (total += bytes.length) > 536870912) throw fail('Package exceeds the 512 MiB browser packaging limit.', 'RESOURCE_LIMIT');
      let accumulator = 0xffffffff;
      for (let start = 0; start < bytes.length; start += 1048576) {
        if (options.signal?.aborted) throw fail('Packaging cancelled.', 'CANCELLED');
        const end = Math.min(bytes.length, start + 1048576);
        for (let index = start; index < end; index++) accumulator = crcTable[(accumulator ^ bytes[index]) & 255] ^ (accumulator >>> 8);
        if (end < bytes.length) await new Promise(resolve => setTimeout(resolve, 0));
      }
      const crc = (accumulator ^ 0xffffffff) >>> 0;
      const local = new Uint8Array(30 + filename.length), ld = new DataView(local.buffer);
      ld.setUint32(0, 0x04034b50, true); ld.setUint16(4, 20, true); ld.setUint16(6, 0x800, true); // UTF-8, STORE.
      ld.setUint16(10, stamp.time, true); ld.setUint16(12, stamp.date, true); ld.setUint32(14, crc, true);
      ld.setUint32(18, bytes.length, true); ld.setUint32(22, bytes.length, true); ld.setUint16(26, filename.length, true); local.set(filename, 30);
      const central = new Uint8Array(46 + filename.length), cd = new DataView(central.buffer);
      cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x800, true);
      cd.setUint16(12, stamp.time, true); cd.setUint16(14, stamp.date, true); cd.setUint32(16, crc, true);
      cd.setUint32(20, bytes.length, true); cd.setUint32(24, bytes.length, true); cd.setUint16(28, filename.length, true); cd.setUint32(42, offset, true); central.set(filename, 46);
      chunks.push(local, bytes); directory.push(central); offset += local.length + bytes.length;
      options.onProgress?.(seen.size / Math.max(1, entries.length));
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    if (options.signal?.aborted) throw fail('Packaging cancelled.', 'CANCELLED');
    const directorySize = directory.reduce((sum, item) => sum + item.length, 0), end = new Uint8Array(22), ed = new DataView(end.buffer);
    ed.setUint32(0, 0x06054b50, true); ed.setUint16(8, entries.length, true); ed.setUint16(10, entries.length, true);
    ed.setUint32(12, directorySize, true); ed.setUint32(16, offset, true);
    return new Blob([...chunks, ...directory, end], { type: 'application/zip' });
  }
  function wav(channels, sampleRate) {
    if (!Array.isArray(channels) || channels.length < 1 || channels.length > 8) throw fail('WAV export supports one to eight channels.');
    finite(sampleRate, 'Sample rate', 8000, 192000);
    const frames = channels[0]?.length;
    if (!frames || channels.some(channel => !(channel instanceof Float32Array) || channel.length !== frames)) throw fail('Audio channels must have the same non-zero length.');
    const size = frames * channels.length * 2;
    if (size > 268435456) throw fail('WAV output exceeds the 256 MiB limit.', 'RESOURCE_LIMIT');
    const bytes = new Uint8Array(44 + size), view = new DataView(bytes.buffer);
    const text = (at, value) => { for (let i = 0; i < value.length; i++) bytes[at + i] = value.charCodeAt(i); };
    text(0, 'RIFF'); view.setUint32(4, 36 + size, true); text(8, 'WAVE'); text(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels.length, true); view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channels.length * 2, true); view.setUint16(32, channels.length * 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, size, true);
    let at = 44;
    for (let i = 0; i < frames; i++) for (const channel of channels) {
      const sample = Math.max(-1, Math.min(1, Number.isFinite(channel[i]) ? channel[i] : 0));
      view.setInt16(at, Math.round(sample * (sample < 0 ? 32768 : 32767)), true); at += 2;
    }
    return new Blob([bytes], { type: 'audio/wav' });
  }
  globalThis.HoleActionCodecs = Object.freeze({ dimensions, focalCrop, resizeGeometry, explicitCrop, safeName, crc32, zip, wav });
})();
