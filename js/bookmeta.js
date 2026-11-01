// Metadatos de libros: lectura completa del EPUB y campos {{libro.*}} para las plantillas.
import { esc, stripTags } from './core.js';

const parseXML = (txt) => new DOMParser().parseFromString(txt, 'application/xml');
const byLocal = (root, name) => [...root.getElementsByTagName('*')].filter(e => e.localName === name);
const attr = (el, name) => el.getAttribute(name) ?? el.getAttributeNS('http://www.idpf.org/2007/opf', name.replace(/^opf:/, '')) ?? el.getAttribute('opf:' + name);

// "Gabriel García Márquez" no se convierte a ciegas: solo se usa la forma "Apellido, Nombre" cuando el EPUB la trae (file-as).
function authorFromCreator(el, refines) {
  const id = el.getAttribute('id');
  const fileAs = attr(el, 'file-as') || (id && refines[`#${id}`]?.['file-as']);
  const role = attr(el, 'role') || (id && refines[`#${id}`]?.role) || '';
  const name = el.textContent.trim();
  return { name, fileAs: fileAs?.trim() || '', role };
}

export async function readEpubMeta(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const container = parseXML(await zip.file('META-INF/container.xml').async('string'));
  const opfPath = byLocal(container, 'rootfile')[0]?.getAttribute('full-path');
  if (!opfPath) throw new Error('EPUB sin OPF');
  const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const opf = parseXML(await zip.file(opfPath).async('string'));
  const md = byLocal(opf, 'metadata')[0] || opf;
  const text = (n) => byLocal(md, n).map(e => e.textContent.trim()).filter(Boolean);

  // EPUB 3: <meta refines="#id" property="file-as">…</meta>
  const refines = {};
  byLocal(md, 'meta').forEach(m => {
    const r = m.getAttribute('refines'), p = m.getAttribute('property');
    if (r && p) { refines[r] = refines[r] || {}; refines[r][p] = m.textContent.trim(); }
  });

  const creators = byLocal(md, 'creator').map(el => authorFromCreator(el, refines));
  const authors = creators.filter(c => !c.role || c.role === 'aut');
  const ids = byLocal(md, 'identifier').map(e => e.textContent.trim());
  const isbn = (ids.find(i => /97[89][\d-]{10,}/.test(i.replace(/^urn:isbn:/i, ''))) || ids.find(i => /isbn/i.test(i)) || '').replace(/^urn:isbn:/i, '').replace(/[^\dXx-]/g, '');
  const date = text('date')[0] || '';
  const year = (date.match(/\d{4}/) || [''])[0];

  // Páginas impresas: lista de páginas del EPUB 3 (nav page-list) o del EPUB 2 (pageList del NCX)
  let pages = '';
  try {
    const items = byLocal(opf, 'item');
    const nav = items.find(i => (i.getAttribute('properties') || '').split(' ').includes('nav'));
    const ncx = items.find(i => i.getAttribute('media-type') === 'application/x-dtbncx+xml');
    let labels = [];
    if (nav) {
      const doc = parseXML(await zip.file(base + nav.getAttribute('href'))?.async('string') || '<x/>');
      const pl = byLocal(doc, 'nav').find(n => (n.getAttribute('epub:type') || n.getAttributeNS('http://www.idpf.org/2007/ops', 'type') || '').includes('page-list'));
      if (pl) labels = byLocal(pl, 'a').map(a => a.textContent.trim());
    }
    if (!labels.length && ncx) {
      const doc = parseXML(await zip.file(base + ncx.getAttribute('href'))?.async('string') || '<x/>');
      labels = byLocal(doc, 'pageTarget').map(p => byLocal(p, 'text')[0]?.textContent.trim() || '');
    }
    const nums = labels.map(l => parseInt(l, 10)).filter(n => !isNaN(n));
    if (nums.length) pages = String(Math.max(...nums));
  } catch (e) { /* sin lista de páginas */ }

  return {
    title: text('title')[0] || '',
    authors: authors.map(a => a.fileAs || a.name),
    authorsNeedReview: authors.some(a => !a.fileAs && !a.name.includes(',') && a.name.includes(' ')),
    publisher: text('publisher')[0] || '',
    year, isbn, pages,
    language: text('language')[0] || '',
    description: stripTags(text('description')[0] || '').slice(0, 1200),
    subjects: text('subject').slice(0, 8),
  };
}

// Autores en el formato que usa la app: uno por línea, "Apellido, Nombres"
export const authorLines = (b) => String(b.author || '').split(/\n|;/).map(s => s.trim()).filter(Boolean);
export const authorDisplay = (b) => authorLines(b).map(a => a.includes(',') ? a.split(',').map(s => s.trim()).reverse().join(' ') : a).join(', ');
export const authorNeedsReview = (b) => authorLines(b).some(a => !a.includes(',') && a.includes(' '));

/* ---------- Campos para plantillas ---------- */
export const BOOK_FIELDS = [
  ['titulo', 'Título'], ['autor', 'Autor (como se lee)'], ['autor_apa', 'Autor (Apellido, Nombre)'], ['anio', 'Año'],
  ['editorial', 'Editorial'], ['paginas', 'Número de páginas'], ['isbn', 'ISBN'], ['edicion', 'Edición'],
  ['idioma', 'Idioma'], ['temas', 'Temas'], ['sinopsis', 'Sinopsis'], ['progreso', 'Progreso de lectura'],
];

export function bookValues(b) {
  return {
    titulo: b.title || '', autor: authorDisplay(b), autor_apa: authorLines(b).join('; '), anio: b.year || '',
    editorial: b.publisher || '', paginas: b.pages || '', isbn: b.isbn || '', edicion: b.edition || '',
    idioma: b.language || '', temas: (b.subjects || []).join(', '), sinopsis: b.description || '',
    progreso: b.percent ? `${Math.round(b.percent)} %` : '',
  };
}

const PH = /\{\{\s*libro\.([a-z_]+)\s*\}\}/g;
export const hasBookPlaceholders = (blocks = []) => JSON.stringify(blocks).includes('{{libro.') || JSON.stringify(blocks).includes('{{ libro.');

// Llena los bloques de una plantilla con los datos del libro
export function fillBlocks(blocks = [], b) {
  const v = bookValues(b);
  const fill = (s) => typeof s === 'string' ? s.replace(PH, (m, k) => esc(v[k] ?? '')) : s;
  const walk = (items) => (items || []).map(it => typeof it === 'string' ? fill(it)
    : { ...it, content: fill(it.content), text: fill(it.text), items: walk(it.items) });
  return blocks.map(bl => {
    const d = { ...(bl.data || {}) };
    for (const k of ['text', 'caption', 'label']) if (typeof d[k] === 'string') d[k] = fill(d[k]);
    if (Array.isArray(d.items)) d.items = walk(d.items);
    // Referencia APA vacía (o con campos de libro) → datos del libro
    if (bl.type === 'referencia' && (!d.titulo || d.titulo.includes('{{'))) {
      Object.assign(d, { tipo: 'libro', autores: authorLines(b).join('\n'), anio: b.year || '', titulo: b.title || '', editorial: b.publisher || '', edicion: b.edition || '' });
    }
    // Listas de la plantilla antigua: "Libro:" → "Libro: Título — Autor"
    if (Array.isArray(d.items)) d.items = d.items.map(it => (typeof it === 'object' && /^\s*Libro:\s*$/i.test(stripTags(it.content || ''))) ? { ...it, content: `Libro: ${esc(b.title)}${authorDisplay(b) ? ' — ' + esc(authorDisplay(b)) : ''}` } : it);
    return { ...bl, data: d };
  });
}

// ¿Esta plantilla pide un libro?
export function isBookTemplate(t) {
  if (!t) return false;
  if (t.book === true) return true;
  if (t.book === false) return false;
  if (['ficha', 'club'].includes(t.builtin)) return true;
  const blocks = t.content?.blocks || [];
  return hasBookPlaceholders(blocks) || blocks.some(b => b.type === 'referencia' && !b.data?.titulo);
}
