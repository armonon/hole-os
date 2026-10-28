import test from 'node:test';
import assert from 'node:assert/strict';
import * as pdfLib from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import { fileURLToPath } from 'node:url';
import '../src/pdf-tools.js';

const packageRoot = new URL('../node_modules/pdfjs-dist/', import.meta.url);
const pdfOptions = { standardFontDataUrl: fileURLToPath(new URL('standard_fonts/', packageRoot)), cMapUrl: fileURLToPath(new URL('cmaps/', packageRoot)), cMapPacked: true, wasmUrl: fileURLToPath(new URL('wasm/', packageRoot)), useSystemFonts: true };
const engine = globalThis.HolePDFModel.createEngine({ pdfLib, pdfjs, canvasFactory: createCanvas, pngBytes: async canvas => new Uint8Array(await canvas.encode('png')), pdfOptions });
async function original() {
  const doc = await pdfLib.PDFDocument.create();
  doc.setTitle('Private original title'); doc.setSubject('Secret metadata');
  const page = doc.addPage([400, 400]);
  page.drawText('SECRET 123456', { x: 40, y: 330, size: 20 });
  page.drawText('Public content', { x: 40, y: 140, size: 20 });
  await doc.attach(new TextEncoder().encode('SECRET ATTACHMENT'), 'secret.txt', { mimeType: 'text/plain' });
  const page2 = doc.addPage([300, 200]); page2.drawText('Second page', { x: 20, y: 100, size: 16 });
  return new Blob([await doc.save()], { type: 'application/pdf' });
}
async function open(blob) { return pdfjs.getDocument({ ...pdfOptions, data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false }).promise; }

test('real PDF annotation and drawn signature generate a reopenable document with original text preserved', async () => {
  const source = await original();
  const result = await engine.annotate(source, [{ type: 'text', page: 1, x: .1, y: .5, text: 'Reviewed locally', size: 12 }, { type: 'ink', page: 2, paths: [[[.1, .6], [.2, .7], [.3, .5]]] }]);
  assert.equal(result.type, 'application/pdf'); assert.ok(result.size > source.size);
  const parsed = await open(result);
  try {
    assert.equal(parsed.numPages, 2);
    const text = (await (await parsed.getPage(1)).getTextContent()).items.map(item => item.str).join(' ');
    assert.match(text, /SECRET 123456/); assert.match(text, /Reviewed locally/);
    const rendered = await engine.renderPage(result, 2, 1); const ctx = rendered.canvas.getContext('2d');
    const pixel = ctx.getImageData(60, 140, 1, 1).data;
    assert.ok(pixel[0] < 230, 'the signature stroke has visible pixels');
  } finally { await parsed.loadingTask.destroy(); }
});

test('real raster redaction removes underlying text, annotations, attachments and original metadata', async () => {
  const source = await original();
  const result = await engine.redact(source, [{ type: 'redact', page: 1, x: .075, y: .09, width: .65, height: .12 }]);
  const parsed = await open(result);
  try {
    assert.equal(parsed.numPages, 2);
    for (let p = 1; p <= parsed.numPages; p++) {
      const page = await parsed.getPage(p);
      assert.equal((await page.getTextContent()).items.length, 0);
      assert.equal((await page.getAnnotations({ intent: 'any' })).length, 0);
    }
    assert.equal(await parsed.getAttachments(), null);
    assert.equal(await parsed.getJSActions(), null);
    const metadata = await parsed.getMetadata();
    assert.equal(metadata.info.Title, 'Redacted document'); assert.notEqual(metadata.info.Subject, 'Secret metadata');
    const rendered = await engine.renderPage(result, 1, 1), ctx = rendered.canvas.getContext('2d');
    for (const [x, y] of [[40, 50], [100, 65], [280, 80]]) assert.deepEqual([...ctx.getImageData(x, y, 1, 1).data], [0, 0, 0, 255]);
    let visiblePublicPixels = 0;
    const image = ctx.getImageData(35, 240, 180, 35).data;
    for (let i = 0; i < image.length; i += 4) if (image[i] < 128) visiblePublicPixels++;
    assert.ok(visiblePublicPixels > 30, 'public text remains visible in the generated page image');
    assert.equal(new TextDecoder().decode(await result.arrayBuffer()).includes('SECRET'), false);
  } finally { await parsed.loadingTask.destroy(); }
  const untouched = await open(source);
  assert.match((await (await untouched.getPage(1)).getTextContent()).items.map(i => i.str).join(' '), /SECRET 123456/);
  await untouched.loadingTask.destroy();
});

test('redaction handles rotated pages and rejects invalid regions without generating a result', async () => {
  const doc = await pdfLib.PDFDocument.create(), page = doc.addPage([300, 200]); page.setRotation(pdfLib.degrees(90)); page.drawText('Rotated secret', { x: 20, y: 100, size: 14 });
  const blob = new Blob([await doc.save()], { type: 'application/pdf' });
  const result = await engine.redact(blob, [{ type: 'redact', page: 1, x: 0, y: 0, width: 1, height: 1 }]);
  const parsed = await open(result); const viewport = (await parsed.getPage(1)).getViewport({ scale: 1 });
  assert.equal(viewport.width, 200); assert.equal(viewport.height, 300); await parsed.loadingTask.destroy();
  await assert.rejects(engine.redact(blob, [{ type: 'redact', page: 1, x: .9, y: .1, width: .2, height: .2 }]), /within/);
  await assert.rejects(engine.annotate(blob, [{ type: 'text', page: 1, x: .1, y: .1, text: 'Note', size: 12 }]), /unrotated/);
});

test('redaction cancellation returns no output and malformed/non-PDF input is rejected', async () => {
  const source = await original(), controller = new AbortController(); controller.abort();
  await assert.rejects(engine.redact(source, [{ type: 'redact', page: 1, x: 0, y: 0, width: 1, height: 1 }], { signal: controller.signal }), { name: 'AbortError' });
  await assert.rejects(engine.inspect(new Blob(['not a PDF'])), /header/);
  await assert.rejects(engine.annotate(source, [{ type: 'text', page: 1, x: .9, y: .9, text: 'This does not fit in this region', size: 48 }]), /fit/);
});
