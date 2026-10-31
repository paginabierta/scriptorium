// Referencias en formato APA 7.ª edición (adaptación en español).

import { esc, stripTags } from './core.js';

const clean = (s) => String(s ?? '').trim();
const endDot = (s) => (!s || /[.?!]$/.test(stripTags(s))) ? s : s + '.';

function initials(names) {
  return names.split(/\s+/).filter(Boolean).map(n => n.split('-').map(p => p.charAt(0).toUpperCase() + '.').join('-')).join(' ');
}
function oneAuthor(line) {               // "Apellido, Nombres" → "Apellido, N."; sin coma → organización
  const l = clean(line);
  if (!l || !l.includes(',')) return l;
  const [last, first] = l.split(/,(.+)/).map(clean);
  return first ? `${last}, ${initials(first)}` : last;
}
function oneEditor(line) {               // "Apellido, Nombres" → "N. Apellido"
  const l = clean(line);
  if (!l || !l.includes(',')) return l;
  const [last, first] = l.split(/,(.+)/).map(clean);
  return first ? `${initials(first)} ${last}` : last;
}
function joinList(items, conn) {
  const link = conn === '&' ? ', & ' : ' y ';
  if (items.length <= 1) return items[0] || '';
  if (items.length > 20) return items.slice(0, 19).join(', ') + ', . . . ' + items[items.length - 1];
  return items.slice(0, -1).join(', ') + link + items[items.length - 1];
}
const lines = (t) => String(t || '').split(/\n|;/).map(clean).filter(Boolean);

export const TIPOS = {
  libro: 'Libro',
  capitulo: 'Capítulo de libro',
  articulo: 'Artículo de revista',
  web: 'Página web',
  eclesial: 'Documento eclesial',
};

// r: { tipo, autores, anio, titulo, editorial, edicion, editores, libro, paginas, revista, volumen, numero, url, tipoDoc, sitio, fecha }
export function formatAPA(r = {}, conn = 'y') {
  const authors = joinList(lines(r.autores).map(oneAuthor), conn);
  const year = clean(r.anio) || 's. f.';
  const date = r.tipo === 'web' && clean(r.fecha) ? `${year}, ${clean(r.fecha)}` : year;
  const T = esc(clean(r.titulo));
  const italicTitle = !['capitulo', 'articulo'].includes(r.tipo);
  let titlePart = italicTitle ? `<i>${T}</i>` : T;
  let rest = '';

  switch (r.tipo) {
    case 'capitulo': {
      const eds = lines(r.editores).map(oneEditor);
      const edTxt = eds.length ? `${esc(joinList(eds, conn))} (${eds.length > 1 ? 'Eds.' : 'Ed.'}), ` : '';
      const pags = clean(r.paginas) ? ` (pp. ${esc(clean(r.paginas))})` : '';
      rest = `En ${edTxt}<i>${esc(clean(r.libro))}</i>${pags}. ${endDot(esc(clean(r.editorial)))}`;
      break;
    }
    case 'articulo': {
      const vol = clean(r.volumen) ? `, <i>${esc(clean(r.volumen))}</i>` : '';
      const num = clean(r.numero) ? `(${esc(clean(r.numero))})` : '';
      const pags = clean(r.paginas) ? `, ${esc(clean(r.paginas))}` : '';
      rest = `<i>${esc(clean(r.revista))}</i>${vol}${num}${pags}.`;
      break;
    }
    case 'web': {
      const sitio = clean(r.sitio);
      rest = sitio && sitio !== clean(r.autores) ? endDot(esc(sitio)) : '';
      break;
    }
    case 'eclesial': {
      if (clean(r.tipoDoc)) titlePart += ` [${esc(clean(r.tipoDoc))}]`;
      rest = endDot(esc(clean(r.editorial)));
      break;
    }
    default: {
      if (clean(r.edicion)) titlePart += ` (${esc(clean(r.edicion))}.ª ed.)`;
      rest = endDot(esc(clean(r.editorial)));
    }
  }
  const url = clean(r.url);
  const link = url ? ' ' + esc(/^10\./.test(url) ? 'https://doi.org/' + url : url) : '';

  // Con autor: Autor. (Año). Título. Resto. URL — Sin autor: Título. (Año). Resto. URL
  const out = authors
    ? `${endDot(esc(authors))} (${esc(date)}). ${endDot(titlePart)} ${rest}${link}`
    : `${endDot(titlePart)} (${esc(date)}). ${rest}${link}`;
  return out.replace(/\s+/g, ' ').replace(/\.\s*\./g, '.').trim();
}

export const apaText = (html) => stripTags(html);

// Cita en el texto: (Apellido, año) · (Apellido y Apellido, año) · (Apellido et al., año)
export function citaEnTexto(r = {}, conn = 'y') {
  const ls = lines(r.autores).map(l => l.split(',')[0].trim());
  const year = clean(r.anio) || 's. f.';
  let who = clean(r.titulo).split(/[.:]/)[0].slice(0, 50);
  if (ls.length === 1) who = ls[0];
  else if (ls.length === 2) who = `${ls[0]} ${conn === '&' ? '&' : 'y'} ${ls[1]}`;
  else if (ls.length > 2) who = `${ls[0]} et al.`;
  return `(${who}, ${year})`;
}
