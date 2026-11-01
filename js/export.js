// Exportar a Word (.docx), PDF (impresión), Markdown y EPUB.
import { esc, downloadBlob, safeFilename } from './core.js';
import { blocksToHtml, blocksToMarkdown } from './editor.js';
import { formatAPA } from './apa.js';
import { settings } from './core.js';
import { magisterioCita } from './blocks.js';
import { colorHex, markHex, sizeFactor, formatCSS } from './format.js';

/* ---------- Word (.docx) hecho a mano con JSZip ---------- */
const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Convierte HTML en línea (b, i, a, br) a "runs" de Word
function runs(html = '', base = {}) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const out = [];
  const walk = (node, fmt) => {
    node.childNodes.forEach(n => {
      if (n.nodeType === 3) { if (n.textContent) out.push({ text: n.textContent, ...fmt }); return; }
      if (n.nodeType !== 1) return;
      const tag = n.tagName.toLowerCase();
      if (tag === 'br') { out.push({ br: true }); return; }
      const f = { ...fmt };
      if (tag === 'b' || tag === 'strong') f.b = true;
      if (tag === 'i' || tag === 'em') f.i = true;
      if (tag === 'u') f.u = true;
      if (tag === 's' || tag === 'strike' || tag === 'del') f.st = true;
      if (tag === 'mark') f.hl = markHex([...n.classList].find(c => c.startsWith('mark-'))) || '#FBE7A1';
      n.classList?.forEach(c => { if (colorHex(c)) f.color = colorHex(c); if (sizeFactor(c)) f.size = sizeFactor(c); });
      walk(n, f);
    });
  };
  walk(doc.body.firstChild, base);
  return out.map(r => r.br ? '<w:r><w:br/></w:r>' :
    `<w:r><w:rPr>${r.b ? '<w:b/>' : ''}${r.i ? '<w:i/>' : ''}${r.st ? '<w:strike/>' : ''}${r.color ? `<w:color w:val="${r.color.slice(1)}"/>` : ''}${r.size ? `<w:sz w:val="${Math.round(24 * r.size)}"/>` : ''}${r.u ? '<w:u w:val="single"/>' : ''}${r.hl ? `<w:shd w:val="clear" w:color="auto" w:fill="${r.hl.slice(1)}"/>` : ''}</w:rPr><w:t xml:space="preserve">${xmlEsc(r.text)}</w:t></w:r>`).join('');
}
let curJc = '';
const JC = { center: 'center', right: 'right', justify: 'both' };
const para = (html, style, extra = '') => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${extra}${curJc ? `<w:jc w:val="${curJc}"/>` : ''}</w:pPr>${runs(html)}</w:p>`;

function blocksToDocx(blocks = []) {
  const conn = settings().apaConnector || 'y';
  const out = [];
  const list = (items, style, depth = 0) => (items || []).forEach((it, i) => {
    const content = typeof it === 'string' ? it : it.content;
    const mark = style === 'ordered' ? `${i + 1}. ` : style === 'checklist' ? (it.meta?.checked ? '☑ ' : '☐ ') : '• ';
    out.push(para(esc(mark) + (content || ''), 'Lista', `<w:ind w:left="${360 + depth * 360}" w:hanging="280"/>`));
    if (it.items?.length) list(it.items, style, depth + 1);
  });
  for (const b of blocks) {
    const d = b.data || {};
    curJc = JC[b.tunes?.align?.alignment] || '';
    switch (b.type) {
      case 'paragraph': out.push(para(d.text || '', 'Normal')); break;
      case 'header': out.push(para(d.text || '', `Ttulo${Math.min(3, Math.max(1, d.level || 2))}`)); break;
      case 'list': list(d.items, d.style); break;
      case 'checklist': (d.items || []).forEach(i => out.push(para((i.checked ? '☑ ' : '☐ ') + (i.text || ''), 'Lista', '<w:ind w:left="360" w:hanging="280"/>'))); break;
      case 'quote': out.push(para(d.text || '', 'Cita')); if (d.caption) out.push(para('— ' + d.caption, 'Fuente')); break;
      case 'biblia': if (!d.text && !d.ref) break; if (d.label) out.push(para(`<b>${esc(d.label)}</b>`, 'Normal')); out.push(para(d.text || '', 'Lectura')); if (d.ref) out.push(para(`(${esc(d.ref)})`, 'Fuente')); break;
      case 'magisterio': out.push(para(d.text || '', 'Cita')); out.push(para(`(${esc(magisterioCita(d))})`, 'Fuente')); break;
      case 'referencia': out.push(para(formatAPA(d, conn), 'Referencia')); break;
      case 'delimiter': out.push(para('* * *', 'Centro')); break;
    }
  }
  curJc = '';
  return out.join('');
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/><w:lang w:val="es-CO"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Titulo"><w:name w:val="Title"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="360"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Ttulo1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Ttulo2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="200"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Ttulo3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:i/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Lista"><w:name w:val="Lista"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Cita"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720" w:right="720"/><w:spacing w:after="40"/></w:pPr><w:rPr><w:i/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Lectura"><w:name w:val="Lectura"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720" w:right="720"/><w:spacing w:after="40"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Fuente"><w:name w:val="Fuente"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720" w:right="720"/><w:jc w:val="right"/></w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Referencia"><w:name w:val="Referencia"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720" w:hanging="720"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Centro"><w:name w:val="Centro"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/></w:pPr></w:style>
</w:styles>`;

// sections: [{ title, blocks }]; si hay varias, cada una empieza en página nueva
export async function exportDocx(title, sections, { refs = [] } = {}) {
  const zip = new JSZip();
  const conn = settings().apaConnector || 'y';
  let body = para(esc(title), 'Titulo');
  sections.forEach((s, i) => {
    if (sections.length > 1) body += `<w:p><w:pPr><w:pStyle w:val="Ttulo1"/>${i > 0 ? '<w:pageBreakBefore/>' : ''}</w:pPr>${runs(esc(s.title || ''))}</w:p>`;
    body += blocksToDocx(s.blocks);
  });
  if (refs.length) {
    body += `<w:p><w:pPr><w:pStyle w:val="Ttulo1"/><w:pageBreakBefore/><w:jc w:val="center"/></w:pPr>${runs('Referencias')}</w:p>`;
    refs.forEach(r => { body += para(formatAPA(r, conn), 'Referencia'); });
  }
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}
<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file('word/document.xml', docXml);
  zip.file('word/styles.xml', STYLES);
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  downloadBlob(blob, safeFilename(title) + '.docx');
}

/* ---------- PDF: se imprime con el diálogo del navegador ("Guardar como PDF") ---------- */
const PRINT_CSS = `
  @page { margin: 2.2cm; }
  body { font-family: 'EB Garamond', Georgia, serif; font-size: 13pt; line-height: 1.55; color: #1E1B16; }
  h1 { font-size: 24pt; font-weight: 500; text-align: center; margin: 0 0 24pt; }
  h1.sec { text-align: left; font-size: 19pt; page-break-before: always; }
  h1.sec.first { page-break-before: auto; }
  h2 { font-size: 16pt; font-weight: 600; margin: 18pt 0 6pt; }
  h3 { font-size: 14pt; font-weight: 600; margin: 14pt 0 4pt; }
  h4 { font-size: 13pt; font-style: italic; margin: 12pt 0 4pt; }
  blockquote { margin: 10pt 1.2cm; font-style: italic; }
  blockquote cite { display: block; text-align: right; font-style: normal; font-size: 11pt; }
  .apa { padding-left: 1.27cm; text-indent: -1.27cm; }
  blockquote.biblia { font-style: normal; }
  blockquote small { display: block; font-size: 10pt; text-transform: uppercase; letter-spacing: 1px; font-style: normal; }
  ${formatCSS()}
  ul.checklist { list-style: none; padding-left: 0; }
  .cbox { display: inline-block; width: 9pt; height: 9pt; border: 1px solid #666; margin-right: 6pt; vertical-align: -1pt; }
  .cbox.on { background: #666; }
  hr { border: 0; text-align: center; margin: 16pt 0; } hr::after { content: '* * *'; }
  a { color: inherit; }
`;

export function printDocument(title, sections, { refs = [] } = {}) {
  const conn = settings().apaConnector || 'y';
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap">
    <style>${PRINT_CSS}</style></head><body>
    <h1>${esc(title)}</h1>
    ${sections.map((s, i) => `${sections.length > 1 ? `<h1 class="sec${i === 0 ? ' first' : ''}">${esc(s.title || '')}</h1>` : ''}${blocksToHtml(s.blocks)}`).join('')}
    ${refs.length ? `<h1 class="sec">Referencias</h1>${refs.map(r => `<p class="apa">${formatAPA(r, conn)}</p>`).join('')}` : ''}
    </body></html>`;
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);
  frame.srcdoc = html;
  frame.onload = () => {
    setTimeout(() => {
      try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) {}
      setTimeout(() => frame.remove(), 60000);
    }, 600);
  };
}

/* ---------- Markdown ---------- */
export function exportMarkdown(title, sections) {
  const md = `# ${title}\n\n` + sections.map(s => (sections.length > 1 ? `## ${s.title}\n\n` : '') + blocksToMarkdown(s.blocks)).join('\n\n');
  downloadBlob(new Blob([md], { type: 'text/markdown;charset=utf-8' }), safeFilename(title) + '.md');
}

/* ---------- EPUB 3 ---------- */
const xhtml = (title, body) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="es" xml:lang="es">
<head><meta charset="UTF-8"/><title>${xmlEsc(title)}</title><link rel="stylesheet" type="text/css" href="estilo.css"/></head><body>${body}</body></html>`;

// Limpia el HTML de Editor.js para que sea XHTML válido
function toXhtml(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  return new XMLSerializer().serializeToString(doc.body.firstChild).replace(/^<div[^>]*>|<\/div>$/g, '');
}

export async function buildEpub({ title, author = '', chapters, lang = 'es' }) {
  const zip = new JSZip();
  const id = 'urn:uuid:' + crypto.randomUUID();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
  zip.file('OEBPS/estilo.css', `body{font-family:Georgia,serif;line-height:1.6;margin:0 5%}h1{font-weight:normal;text-align:center;margin:2em 0 1.5em}h2{font-size:1.2em}blockquote{font-style:italic;margin:1em 1.5em}cite{display:block;text-align:right;font-style:normal;font-size:.9em}.portada{text-align:center;margin-top:30%}.portada .autor{font-style:italic}hr{border:0;text-align:center}hr::after{content:"* * *"}`);
  zip.file('OEBPS/portada.xhtml', xhtml(title, `<div class="portada"><h1>${xmlEsc(title)}</h1>${author ? `<p class="autor">${xmlEsc(author)}</p>` : ''}</div>`));
  chapters.forEach((c, i) => zip.file(`OEBPS/cap${i + 1}.xhtml`, xhtml(c.title, `<h1>${xmlEsc(c.title)}</h1>${toXhtml(blocksToHtml(c.blocks))}`)));
  zip.file('OEBPS/nav.xhtml', xhtml('Índice', `<nav epub:type="toc" id="toc"><h1>Índice</h1><ol>${chapters.map((c, i) => `<li><a href="cap${i + 1}.xhtml">${xmlEsc(c.title)}</a></li>`).join('')}</ol></nav>`));
  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${lang}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">${id}</dc:identifier><dc:title>${xmlEsc(title)}</dc:title><dc:language>${lang}</dc:language>${author ? `<dc:creator>${xmlEsc(author)}</dc:creator>` : ''}<meta property="dcterms:modified">${new Date().toISOString().slice(0, 19)}Z</meta></metadata>
<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="estilo.css" media-type="text/css"/><item id="portada" href="portada.xhtml" media-type="application/xhtml+xml"/>${chapters.map((c, i) => `<item id="cap${i + 1}" href="cap${i + 1}.xhtml" media-type="application/xhtml+xml"/>`).join('')}</manifest>
<spine><itemref idref="portada"/><itemref idref="nav"/>${chapters.map((c, i) => `<itemref idref="cap${i + 1}"/>`).join('')}</spine></package>`);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
}
