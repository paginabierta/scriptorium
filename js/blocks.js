// Bloques propios del editor: cita bíblica, cita del magisterio y referencia APA 7.
import { esc, settings } from './core.js';
import { formatAPA, citaEnTexto, TIPOS } from './apa.js';

/* ---------- Abreviaturas bíblicas (formato litúrgico latinoamericano) ---------- */
const LIBROS = [
  ['Gn', 'génesis gen gn'], ['Ex', 'éxodo exodo ex'], ['Lv', 'levítico levitico lv'], ['Nm', 'números numeros nm'], ['Dt', 'deuteronomio dt'],
  ['Jos', 'josué josue jos'], ['Jc', 'jueces jc jue'], ['Rt', 'rut rt'], ['1 S', '1 samuel 1s 1 sam 1sam'], ['2 S', '2 samuel 2s 2 sam 2sam'],
  ['1 R', '1 reyes 1r 1 re'], ['2 R', '2 reyes 2r 2 re'], ['1 Cro', '1 crónicas 1 cronicas 1cro 1 cr'], ['2 Cro', '2 crónicas 2 cronicas 2cro 2 cr'],
  ['Esd', 'esdras esd'], ['Ne', 'nehemías nehemias ne neh'], ['Tb', 'tobías tobias tb'], ['Jdt', 'judit jdt'], ['Est', 'ester est'],
  ['1 M', '1 macabeos 1m 1 mac'], ['2 M', '2 macabeos 2m 2 mac'], ['Jb', 'job jb'], ['Sal', 'salmo salmos sal sl'], ['Pr', 'proverbios pr prov'],
  ['Qo', 'eclesiastés eclesiastes qohélet qohelet qo ecl'], ['Ct', 'cantar cantares cantar de los cantares ct cant'], ['Sb', 'sabiduría sabiduria sb sab'],
  ['Si', 'eclesiástico eclesiastico sirácida siracida si eclo'], ['Is', 'isaías isaias is'], ['Jr', 'jeremías jeremias jr jer'], ['Lm', 'lamentaciones lm lam'],
  ['Ba', 'baruc ba bar'], ['Ez', 'ezequiel ez'], ['Dn', 'daniel dn'], ['Os', 'oseas os'], ['Jl', 'joel jl'], ['Am', 'amós amos am'],
  ['Abd', 'abdías abdias abd'], ['Jon', 'jonás jonas jon'], ['Mi', 'miqueas mi'], ['Na', 'nahún nahum na'], ['Ha', 'habacuc ha hab'],
  ['So', 'sofonías sofonias so'], ['Ag', 'ageo ag'], ['Za', 'zacarías zacarias za'], ['Ml', 'malaquías malaquias ml'],
  ['Mt', 'mateo mt'], ['Mc', 'marcos mc mr'], ['Lc', 'lucas lc'], ['Jn', 'juan jn'], ['Hch', 'hechos hechos de los apóstoles hch'],
  ['Rm', 'romanos rm rom'], ['1 Co', '1 corintios 1co 1 cor'], ['2 Co', '2 corintios 2co 2 cor'], ['Ga', 'gálatas galatas ga gal'],
  ['Ef', 'efesios ef'], ['Flp', 'filipenses flp fil'], ['Col', 'colosenses col'], ['1 Ts', '1 tesalonicenses 1ts 1 tes'],
  ['2 Ts', '2 tesalonicenses 2ts 2 tes'], ['1 Tm', '1 timoteo 1tm 1 tim'], ['2 Tm', '2 timoteo 2tm 2 tim'], ['Tt', 'tito tt tit'],
  ['Flm', 'filemón filemon flm'], ['Hb', 'hebreos hb heb'], ['St', 'santiago st sant'], ['1 P', '1 pedro 1p 1 pe'], ['2 P', '2 pedro 2p 2 pe'],
  ['1 Jn', '1 juan 1jn'], ['2 Jn', '2 juan 2jn'], ['3 Jn', '3 juan 3jn'], ['Jds', 'judas jds jud'], ['Ap', 'apocalipsis ap apoc'],
];
const LOOKUP = new Map();
LIBROS.forEach(([abbr]) => LOOKUP.set(abbr.toLowerCase().replace(/\s/g, ''), abbr));
// Nombres completos y variantes (también de varias palabras: "cantar de los cantares")
LIBROS.forEach(([abbr, names]) => {
  const words = names.split(' ');
  for (let i = 0; i < words.length; i++) {
    for (let j = i + 1; j <= Math.min(words.length, i + 5); j++) {
      const key = words.slice(i, j).join('').toLowerCase();
      if (/^\d$/.test(key) || ['de', 'los', 'la'].includes(key)) continue;
      if (!LOOKUP.has(key)) LOOKUP.set(key, abbr);
    }
  }
});

// "juan 3:16-18" → "Jn 3, 16-18" · "1cor 13,4" → "1 Co 13, 4"
export function normalizeRef(input) {
  const s = String(input || '').trim();
  const m = s.match(/^([1-3]?\s*[\p{L}][\p{L}\s.]*?)\s*(\d.*)?$/u);
  if (!m) return s;
  const key = m[1].toLowerCase().replace(/[\s.]/g, '').normalize('NFC');
  const abbr = LOOKUP.get(key) || LOOKUP.get(key.normalize('NFD').replace(/[̀-ͯ]/g, '')) || m[1].trim();
  let rest = (m[2] || '').replace(/\s*:\s*/g, ', ').replace(/\s*,\s*/g, ', ').replace(/\s*[–—]\s*/g, '-').replace(/\s*-\s*/g, '-').replace(/\s*;\s*/g, '; ');
  return rest ? `${abbr} ${rest}` : abbr;
}

const ICONO_BIBLIA = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M12 6v7M9.5 8.5h5"/></svg>';
const ICONO_MAG = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 21V8l6-5 6 5v13"/><path d="M10 21v-5h4v5M12 7v4M10 9h4"/></svg>';
const ICONO_REF = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 4h10v17l-5-3-5 3z"/><path d="M10 9h4"/></svg>';

function editable(html, cls, placeholder, readOnly) {
  const el = document.createElement('div');
  el.className = cls;
  el.contentEditable = readOnly ? 'false' : 'true';
  el.dataset.placeholder = placeholder;
  el.innerHTML = html || '';
  return el;
}

/* ---------- Cita bíblica ---------- */
export class BibliaTool {
  static get toolbox() { return { title: 'Cita bíblica', icon: ICONO_BIBLIA }; }
  static get isReadOnlySupported() { return true; }
  static get enableLineBreaks() { return true; }
  constructor({ data, readOnly }) { this.data = { ref: data?.ref || '', text: data?.text || '', label: data?.label || '' }; this.readOnly = readOnly; }
  render() {
    const w = document.createElement('div');
    w.className = 'blk blk-biblia';
    const ref = document.createElement('input');
    ref.className = 'blk-ref';
    ref.placeholder = 'Cita (por ejemplo: Jn 3, 16)';
    ref.value = this.data.ref;
    ref.readOnly = this.readOnly;
    ref.setAttribute('aria-label', 'Referencia bíblica');
    ref.addEventListener('blur', () => { ref.value = normalizeRef(ref.value); });
    ref.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ref.value = normalizeRef(ref.value); this.textEl.focus(); } e.stopPropagation(); });
    ref.addEventListener('paste', (e) => e.stopPropagation());
    this.refEl = ref;
    this.textEl = editable(this.data.text, 'blk-text', 'Pega aquí el texto bíblico', this.readOnly);
    const lab = document.createElement('input');
    lab.className = 'blk-label';
    lab.value = this.data.label || '';
    lab.placeholder = 'Etiqueta (opcional: Primera lectura, Evangelio…)';
    lab.readOnly = this.readOnly;
    lab.setAttribute('aria-label', 'Etiqueta de la cita');
    lab.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.textEl.focus(); } e.stopPropagation(); });
    lab.addEventListener('paste', (e) => e.stopPropagation());
    this.labEl = lab;
    w.append(lab);
    w.append(this.textEl, ref);
    return w;
  }
  save() { const d = { ref: normalizeRef(this.refEl.value), text: this.textEl.innerHTML }; const l = this.labEl?.value.trim(); if (l) d.label = l; return d; }
  static get sanitize() { return { ref: false, label: false, text: { b: {}, i: {}, u: {}, s: {}, strike: {}, br: {}, a: { href: true }, span: { class: true }, mark: { class: true } } }; }
  validate(d) { return !!(d.ref || d.text || d.label); }
}

/* ---------- Cita del magisterio ---------- */
export const DOCUMENTOS = [
  ['CEC', 'Catecismo de la Iglesia Católica'], ['LG', 'Lumen gentium'], ['GS', 'Gaudium et spes'], ['DV', 'Dei Verbum'],
  ['SC', 'Sacrosanctum concilium'], ['DH', 'Dignitatis humanae'], ['AA', 'Apostolicam actuositatem'], ['AG', 'Ad gentes'],
  ['PO', 'Presbyterorum ordinis'], ['EN', 'Evangelii nuntiandi'], ['RH', 'Redemptor hominis'], ['DM', 'Dives in misericordia'],
  ['FC', 'Familiaris consortio'], ['VS', 'Veritatis splendor'], ['EV', 'Evangelium vitae'], ['FR', 'Fides et ratio'],
  ['PDV', 'Pastores dabo vobis'], ['NMI', 'Novo millennio ineunte'], ['DCE', 'Deus caritas est'], ['SpS', 'Spe salvi'],
  ['CiV', 'Caritas in veritate'], ['VD', 'Verbum Domini'], ['LF', 'Lumen fidei'], ['EG', 'Evangelii gaudium'],
  ['LS', 'Laudato si’'], ['AL', 'Amoris laetitia'], ['GE', 'Gaudete et exsultate'], ['CV', 'Christus vivit'],
  ['FT', 'Fratelli tutti'], ['DN', 'Dilexit nos'], ['DA', 'Documento de Aparecida'], ['CDSI', 'Compendio de la Doctrina Social de la Iglesia'],
  ['CIC', 'Código de Derecho Canónico'],
];

export class MagisterioTool {
  static get toolbox() { return { title: 'Magisterio', icon: ICONO_MAG }; }
  static get isReadOnlySupported() { return true; }
  static get enableLineBreaks() { return true; }
  constructor({ data, readOnly }) { this.data = { doc: data?.doc || 'CEC', otro: data?.otro || '', num: data?.num || '', text: data?.text || '' }; this.readOnly = readOnly; }
  render() {
    const w = document.createElement('div');
    w.className = 'blk blk-mag';
    this.textEl = editable(this.data.text, 'blk-text', 'Pega aquí el texto del documento', this.readOnly);
    const row = document.createElement('div');
    row.className = 'blk-row';
    row.innerHTML = `<select aria-label="Documento" ${this.readOnly ? 'disabled' : ''}>${DOCUMENTOS.map(([s, n]) => `<option value="${s}">${s} · ${esc(n)}</option>`).join('')}<option value="OTRO">Otro documento…</option></select>
      <input class="blk-otro" placeholder="Nombre o sigla" aria-label="Otro documento" ${this.readOnly ? 'readonly' : ''}>
      <input class="blk-num" placeholder="n.º" aria-label="Número" ${this.readOnly ? 'readonly' : ''}>`;
    this.sel = row.querySelector('select'); this.otro = row.querySelector('.blk-otro'); this.num = row.querySelector('.blk-num');
    this.sel.value = this.data.doc; this.otro.value = this.data.otro; this.num.value = this.data.num;
    const toggle = () => { this.otro.hidden = this.sel.value !== 'OTRO'; };
    this.sel.addEventListener('change', toggle); toggle();
    w.append(this.textEl, row);
    return w;
  }
  save() { return { doc: this.sel.value, otro: this.otro.value.trim(), num: this.num.value.trim(), text: this.textEl.innerHTML }; }
  static get sanitize() { return { doc: false, otro: false, num: false, text: { b: {}, i: {}, u: {}, s: {}, strike: {}, br: {}, a: { href: true }, span: { class: true }, mark: { class: true } } }; }
  validate(d) { return !!(d.text || d.num); }
}

export function magisterioCita(d) {
  const sigla = d.doc === 'OTRO' ? (d.otro || 'Documento') : d.doc;
  return d.num ? `${sigla} ${d.num}` : sigla;
}

/* ---------- Referencia APA 7 ---------- */
const CAMPOS = {
  libro: [['autores', 'Autores (uno por línea: Apellido, Nombres)', 'area'], ['anio', 'Año'], ['titulo', 'Título del libro'], ['edicion', 'Edición (número, si no es la 1.ª)'], ['editorial', 'Editorial'], ['url', 'URL o DOI (opcional)']],
  capitulo: [['autores', 'Autores del capítulo (uno por línea)', 'area'], ['anio', 'Año'], ['titulo', 'Título del capítulo'], ['editores', 'Editores del libro (uno por línea)', 'area'], ['libro', 'Título del libro'], ['paginas', 'Páginas (ej. 45-67)'], ['editorial', 'Editorial'], ['url', 'URL o DOI (opcional)']],
  articulo: [['autores', 'Autores (uno por línea)', 'area'], ['anio', 'Año'], ['titulo', 'Título del artículo'], ['revista', 'Revista'], ['volumen', 'Volumen'], ['numero', 'Número'], ['paginas', 'Páginas'], ['url', 'DOI o URL']],
  web: [['autores', 'Autor u organización', 'area'], ['anio', 'Año'], ['fecha', 'Día y mes (opcional, ej. 12 de marzo)'], ['titulo', 'Título de la página'], ['sitio', 'Nombre del sitio'], ['url', 'URL']],
  eclesial: [['autores', 'Autor (ej. Francisco; Concilio Vaticano II)', 'area'], ['anio', 'Año'], ['titulo', 'Título del documento'], ['tipoDoc', 'Tipo (ej. Carta encíclica, Exhortación apostólica)'], ['editorial', 'Editorial (ej. Libreria Editrice Vaticana)'], ['url', 'URL (opcional)']],
};

export class ReferenciaTool {
  static get toolbox() { return { title: 'Referencia APA', icon: ICONO_REF }; }
  static get isReadOnlySupported() { return true; }
  static get enableLineBreaks() { return true; }
  constructor({ data, readOnly }) { this.data = { tipo: 'libro', ...(data || {}) }; this.readOnly = readOnly; this.open = !data?.titulo; }
  render() {
    const w = document.createElement('div');
    w.className = 'blk blk-refapa';
    this.wrap = w;
    this.draw();
    return w;
  }
  draw() {
    const conn = settings().apaConnector || 'y';
    const d = this.data;
    const preview = formatAPA(d, conn);
    if (this.readOnly || !this.open) {
      this.wrap.innerHTML = `<div class="apa-out">${preview || '<span class="muted">Referencia vacía</span>'}</div>
        <div class="apa-meta"><span>${esc(TIPOS[d.tipo] || '')} · cita en el texto: ${esc(citaEnTexto(d, conn))}</span>${this.readOnly ? '' : '<button type="button" class="apa-edit">Editar</button>'}</div>`;
      this.wrap.querySelector('.apa-edit')?.addEventListener('click', () => { this.open = true; this.draw(); });
      return;
    }
    const fields = CAMPOS[d.tipo] || CAMPOS.libro;
    this.wrap.innerHTML = `<div class="apa-form">
      <label class="apa-f"><span>Tipo de fuente</span><select data-k="tipo">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}"${k === d.tipo ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
      ${fields.map(([k, label, kind]) => `<label class="apa-f${kind === 'area' ? ' wide' : ''}"><span>${label}</span>${kind === 'area'
        ? `<textarea data-k="${k}" rows="2">${esc(d[k] || '')}</textarea>`
        : `<input data-k="${k}" value="${esc(d[k] || '')}">`}</label>`).join('')}
      </div>
      <div class="apa-out live">${preview}</div>
      <div class="apa-meta"><span>Así quedará en APA 7</span><button type="button" class="apa-done">Listo</button></div>`;
    const out = this.wrap.querySelector('.apa-out');
    this.wrap.querySelectorAll('[data-k]').forEach(el => {
      el.addEventListener('input', () => {
        this.data[el.dataset.k] = el.value;
        if (el.dataset.k === 'tipo') { this.draw(); return; }
        out.innerHTML = formatAPA(this.data, conn);
      });
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && el.tagName === 'INPUT') e.preventDefault(); e.stopPropagation(); });
      el.addEventListener('paste', (e) => e.stopPropagation());
    });
    this.wrap.querySelector('.apa-done').addEventListener('click', () => { this.open = false; this.draw(); });
  }
  save() {
    this.wrap.querySelectorAll('[data-k]').forEach(el => { this.data[el.dataset.k] = el.value; });
    return { ...this.data };
  }
  validate(d) { return !!(d.titulo || d.autores); }
}
