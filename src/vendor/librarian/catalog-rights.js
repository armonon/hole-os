// Direct downloads require permission for the exact location, not an OA flag,
// a filename, a search snippet, or a license attached to another edition.
export const CC0 = 'https://creativecommons.org/publicdomain/zero/1.0/';
export const CC_BY = 'https://creativecommons.org/licenses/by/4.0/';
const doiOf = value => String(value || '').replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').toLowerCase();
export function needsPublisherLicense(work) {
  return /^10\.\d{4,9}\//.test(doiOf(work.doi)) && (work.locations || []).some(l => l.is_oa === true && l.license === 'cc-by' && l.version === 'publishedVersion' && l.pdf_url);
}
export function openAlexDownloads(work, publisher, now = Date.now()) {
  const publisherAllows = doiOf(work.doi) && doiOf(publisher?.DOI) === doiOf(work.doi) && (publisher?.license || []).some(l =>
    l['content-version'] === 'vor' && /^https:\/\/creativecommons\.org\/licenses\/by\/4\.0\/?$/.test(l.URL || '') &&
    Number.isFinite(l.start?.timestamp) && l.start.timestamp <= now);
  return (work.locations || []).flatMap(location => {
    const cc0 = location.license === 'cc0';
    const ccby = location.license === 'cc-by' && location.version === 'publishedVersion' && publisherAllows;
    if ((!cc0 && !ccby) || location.is_oa !== true || !location.pdf_url) return [];
    return [{ url: location.pdf_url, format: 'pdf', license: cc0 ? CC0 : CC_BY,
      publisherEvidenceUrl: ccby ? `https://api.crossref.org/works/${encodeURIComponent(doiOf(work.doi))}` : '',
      sourceUrl: location.landing_page_url || work.id,
      evidenceUrl: work.id, source: 'OpenAlex', title: work.display_name,
      authors: (work.authorships || []).map(a => a.author?.display_name).filter(Boolean) }];
  });
}
export function permittedDownload(download) {
  if (![CC0, CC_BY].includes(download?.license) || download.format !== 'pdf' || download.source !== 'OpenAlex') return false;
  try {
    const file = new URL(download.url), source = new URL(download.sourceUrl), evidence = new URL(download.evidenceUrl);
    return file.protocol === 'https:' && !file.username && !file.password &&
      source.protocol === 'https:' && !source.username && !source.password &&
      evidence.origin === 'https://openalex.org' && /^\/W\d+$/.test(evidence.pathname) &&
      !evidence.search && !evidence.hash && !evidence.username && !evidence.password;
  } catch { return false; }
}
// A shelf bookmark retains identity only; API metadata is refreshed online.
export function shelfRecord(book) {
  if (!book.id?.startsWith('gb:')) return displayRecord(book);
  const id = book.id;
  return { id, title: 'Saved Google Books link', authors: [], subjects: [], ids: [], langs: [],
    cover: '', desc: 'Connect to load current book details, or open the source link.',
    availability: 'Catalog reference', sources: ['Google Books'], googleReference: true,
    links: [{ label: 'Google Books', url: `https://books.google.com/books?id=${encodeURIComponent(id.slice(3))}` }] };
}

// Permission for a catalog's metadata does not automatically cover its images
// or linked full text. Keep provenance when records are merged or saved.
const DESCRIPTION_SOURCES = new Set(['Open Library', 'DPLA', 'Europeana']);
export function displayRecord(book, fresh = false) {
  if (fresh && book.sources?.length === 1 && book.sources[0] === 'Google Books') return book;
  const source = book.sources?.length === 1 ? book.sources[0] : '';
  const descriptionSource = fresh && DESCRIPTION_SOURCES.has(source) ? source : book.descriptionSource;
  const keepDescription = DESCRIPTION_SOURCES.has(descriptionSource) && book.sources?.includes(descriptionSource);
  let keepCover = false;
  try {
    const url = new URL(book.cover);
    keepCover = book.sources?.includes('Open Library') && url.origin === 'https://covers.openlibrary.org' &&
      /^\/b\/(?:id\/\d+|olid\/OL\d+M)-[SML]\.jpg$/.test(url.pathname) && !url.username && !url.password && !url.search && !url.hash;
  } catch { /* An absent or unverified preview uses the title placeholder. */ }
  return { ...book, cover: keepCover ? book.cover : '',
    desc: keepDescription ? book.desc : 'Open a source below for previews and descriptions.',
    descriptionSource: keepDescription ? descriptionSource : '',
    previewAtSource: Boolean(book.previewAtSource || (book.cover && !keepCover) || !keepDescription) };
}

export function downloadCredits(book) {
  if (![CC0, CC_BY].includes(book?.licenseUrl)) return '';
  return [book.title, book.author, `Source: ${book.sourceUrl}`, `License: ${book.licenseUrl}`,
    `License record: ${book.publisherEvidenceUrl || book.licenseEvidenceUrl}`,
    'Original PDF supplied unchanged. Retain its copyright and attribution notices.'].filter(Boolean).join('\n');
}
