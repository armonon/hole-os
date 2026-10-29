/* Bounded comparison and immutable Carry resolution shared by workspace views. */
(() => {
  function textDiff(before, after, maxCells = 250000) {
    const a = String(before).split('\n'), b = String(after).split('\n');
    let prefix = 0, suffix = 0;
    while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
    while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
    const left = a.slice(prefix, a.length - suffix), right = b.slice(prefix, b.length - suffix);
    const rows = a.slice(0, prefix).map(text => ({ type: 'same', text }));
    if ((left.length + 1) * (right.length + 1) > maxCells) {
      rows.push(...left.map(text => ({ type: 'removed', text })), ...right.map(text => ({ type: 'added', text })));
    } else {
      const table = Array.from({ length: left.length + 1 }, () => new Uint32Array(right.length + 1));
      for (let i = left.length - 1; i >= 0; i--) for (let j = right.length - 1; j >= 0; j--) table[i][j] = left[i] === right[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
      let i = 0, j = 0;
      while (i < left.length || j < right.length) {
        if (i < left.length && j < right.length && left[i] === right[j]) { rows.push({ type: 'same', text: left[i++] }); j++; }
        else if (i < left.length && (j === right.length || table[i + 1][j] >= table[i][j + 1])) rows.push({ type: 'removed', text: left[i++] });
        else rows.push({ type: 'added', text: right[j++] });
      }
    }
    rows.push(...a.slice(a.length - suffix).map(text => ({ type: 'same', text })));
    let oldLine = 0, newLine = 0;
    return rows.map(row => ({ ...row, oldLine: row.type === 'added' ? null : ++oldLine, newLine: row.type === 'removed' ? null : ++newLine }));
  }
  async function resolveCarry(core, item, options = {}) {
  if (item.revokedAt) throw new Error('This Carry reference was revoked.');
  if (!item.assetId && item.kind === 'snippet') return { snippet: String(item.text || '') };
  const isCurrent = options.isCurrent ?? (() => true);
  if (!isCurrent()) throw new DOMException('Cancelled', 'AbortError');
  const read = await core.readAsset(item.assetId, item.versionId);
  if (!isCurrent()) throw new DOMException('Cancelled', 'AbortError');
  if (read.asset.state !== 'active') throw new Error('This material is in Trash. Restore it before using Carry.');
  return read;
}
  globalThis.HoleContinuityModel = Object.freeze({ textDiff, resolveCarry });
})();
