// Formato de texto: barra fija tipo procesador de textos, herramientas en línea y alineación por bloque.
import { esc, toast } from './core.js';

/* ---------- Paletas ---------- */
export const COLORS = [
  ['', 'Automático', '#1E1B16'], ['vino', 'Vino', '#7A2E2A'], ['rojo', 'Rojo', '#B42318'], ['naranja', 'Naranja', '#B54708'],
  ['dorado', 'Dorado', '#8A6A1F'], ['verde', 'Verde', '#3F6B2A'], ['azul', 'Azul', '#2F5D7C'], ['morado', 'Morado', '#5B4A7A'], ['gris', 'Gris', '#6B6257'],
];
export const MARKS = [['', 'Sin resaltado', 'transparent'], ['amarillo', 'Amarillo', '#FBE7A1'], ['verde', 'Verde', '#D7EBC4'], ['rosa', 'Rosa', '#F6D3DC'], ['azul', 'Azul', '#D3E3F1']];
export const SIZES = [['sm', 'Pequeño', 0.85], ['', 'Normal', 1], ['lg', 'Grande', 1.25], ['xl', 'Muy grande', 1.6]];
export const ALIGNS = [['left', 'Alinear a la izquierda'], ['center', 'Centrar'], ['right', 'Alinear a la derecha'], ['justify', 'Justificar']];

const SVG = (p, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
export const FICON = {
  bold: SVG('<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>'),
  italic: SVG('<path d="M14 5h-4M14 19h-4M14 5l-4 14"/>'),
  underline: SVG('<path d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14"/>'),
  strike: SVG('<path d="M5 12h14M16 7a4 3 0 0 0-4-2c-2.5 0-4 1.3-4 3 0 1.4 1 2.3 3 3M8 17a4 3 0 0 0 4 2c2.5 0 4-1.3 4-3"/>'),
  marker: SVG('<path d="M9 11l-5 5v4h4l5-5M14 6l4 4-6 6-4-4z"/><path d="M14 6l2-2 4 4-2 2"/>'),
  color: SVG('<path d="M6 16l6-12 6 12M8 12h8"/><path d="M4 20h16" stroke-width="3"/>'),
  size: SVG('<path d="M3 18l4-11 4 11M4.5 14h5M14 18l3.5-8 3.5 8M15 15.5h5"/>'),
  left: SVG('<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>'),
  center: SVG('<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>'),
  right: SVG('<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>'),
  justify: SVG('<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>'),
  clear: SVG('<path d="M6 5h11M11 5l-3 14M4 20l16-16"/>'),
  undo: SVG('<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'),
  redo: SVG('<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>'),
};

/* ---------- Selección ---------- */
function editableOf(node) {
  let n = node?.nodeType === 3 ? node.parentNode : node;
  while (n && n !== document.body) { if (n.isContentEditable && (!n.parentNode || !n.parentNode.isContentEditable)) return n; n = n.parentNode; }
  return null;
}

function currentRange(holder) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  if (!holder.contains(r.commonAncestorContainer)) return null;
  return r;
}

function selectNode(node) {
  const r = document.createRange();
  r.selectNodeContents(node);
  const sel = window.getSelection();
  sel.removeAllRanges(); sel.addRange(r);
}

function unwrap(el) { const p = el.parentNode; while (el.firstChild) p.insertBefore(el.firstChild, el); p.removeChild(el); }

// Envuelve la selección con un elemento de una "familia" (color, tamaño, resaltado), quitando antes los de la misma familia.
export function applyStyle(holder, family, value, range = currentRange(holder)) {
  if (!range || range.collapsed) { toast('Primero selecciona el texto'); return false; }
  const a = editableOf(range.startContainer), b = editableOf(range.endContainer);
  if (!a || a !== b) { toast('Selecciona texto dentro de un mismo párrafo'); return false; }
  const frag = range.extractContents();
  const match = family === 'mark' ? 'mark' : `span.${family}-`;
  if (family === 'mark') frag.querySelectorAll('mark').forEach(unwrap);
  else frag.querySelectorAll('span').forEach(s => { if ([...s.classList].some(c => c.startsWith(family + '-'))) { s.classList.forEach(c => { if (c.startsWith(family + '-')) s.classList.remove(c); }); if (!s.classList.length) unwrap(s); } });
  // Si la selección estaba dentro de un elemento de la misma familia, partirlo
  let node;
  if (value) {
    node = document.createElement(family === 'mark' ? 'mark' : 'span');
    node.className = `${family}-${value}`;
    node.appendChild(frag);
    range.insertNode(node);
  } else {
    node = document.createElement('span');
    node.appendChild(frag);
    range.insertNode(node);
  }
  const outer = node.parentElement?.closest(family === 'mark' ? 'mark' : `span[class*="${family}-"]`);
  if (outer && a.contains(outer)) splitAround(outer, node, family);
  if (!value) { const kids = [...node.childNodes]; unwrap(node); if (kids.length) { const r = document.createRange(); r.setStartBefore(kids[0]); r.setEndAfter(kids[kids.length - 1]); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); } }
  else selectNode(node);
  a.dispatchEvent(new Event('input', { bubbles: true }));
  void match;
  return true;
}

// Saca "inner" de "outer" partiendo outer en dos (antes y después)
function splitAround(outer, inner, family) {
  const before = outer.cloneNode(false), after = outer.cloneNode(false);
  let n = outer.firstChild;
  let pastInner = false;
  const path = [];
  for (let p = inner; p && p !== outer; p = p.parentNode) path.unshift(p);
  const top = path[0];
  while (n) {
    const next = n.nextSibling;
    if (n === top) pastInner = true;
    else (pastInner ? after : before).appendChild(n);
    n = next;
  }
  const parent = outer.parentNode;
  if (before.childNodes.length) parent.insertBefore(before, outer);
  parent.insertBefore(top, outer);
  if (after.childNodes.length) parent.insertBefore(after, outer);
  parent.removeChild(outer);
  // dentro de top puede quedar el estilo heredado: no hace falta tocarlo
  void family;
}

export function clearFormat(holder) {
  const range = currentRange(holder);
  if (!range || range.collapsed) { toast('Selecciona el texto al que quieres quitarle el formato'); return; }
  const a = editableOf(range.startContainer);
  if (!a || a !== editableOf(range.endContainer)) { toast('Selecciona texto dentro de un mismo párrafo'); return; }
  document.execCommand('removeFormat');
  const r2 = currentRange(holder);
  if (r2 && !r2.collapsed) {
    const frag = r2.extractContents();
    frag.querySelectorAll('mark, span, u, s, strike, b, i, strong, em, font').forEach(unwrap);
    const tmp = document.createElement('span'); tmp.appendChild(frag); r2.insertNode(tmp);
    const kids = [...tmp.childNodes]; unwrap(tmp);
    if (kids.length) { const r = document.createRange(); r.setStartBefore(kids[0]); r.setEndAfter(kids[kids.length - 1]); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }
  }
  a.dispatchEvent(new Event('input', { bubbles: true }));
}

/* ---------- Herramientas en línea para Editor.js (también definen qué etiquetas se conservan) ---------- */
class SimpleInline {
  static get isInline() { return true; }
  constructor() { this.button = null; }
  render() {
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.classList.add('ce-inline-tool');
    this.button.innerHTML = this.constructor.icon;
    this.button.title = this.constructor.title;
    return this.button;
  }
  surround() { document.execCommand(this.constructor.command); }
  checkState() { const on = document.queryCommandState(this.constructor.command); this.button?.classList.toggle('ce-inline-tool--active', on); return on; }
}
export class UnderlineTool extends SimpleInline {
  static get title() { return 'Subrayado'; }
  static get icon() { return FICON.underline; }
  static get command() { return 'underline'; }
  static get sanitize() { return { u: {} }; }
  static get shortcut() { return 'CMD+U'; }
}
export class StrikeTool extends SimpleInline {
  static get title() { return 'Tachado'; }
  static get icon() { return FICON.strike; }
  static get command() { return 'strikeThrough'; }
  static get sanitize() { return { s: {}, strike: {} }; }
}

// Color, resaltado y tamaño desde el menú flotante: abre la misma paleta que la barra fija
export class StyleTool {
  static get isInline() { return true; }
  static get title() { return 'Color y tamaño'; }
  static get sanitize() { return { span: { class: true }, mark: { class: true } }; }
  render() {
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.classList.add('ce-inline-tool');
    this.button.innerHTML = FICON.color;
    this.button.title = 'Color, resaltado y tamaño';
    return this.button;
  }
  surround(range) {
    const holder = this.button.closest('.codex-editor')?.parentElement || document.body;
    const rect = range.getBoundingClientRect();
    openPalette(holder, range.cloneRange(), { x: rect.left, y: rect.bottom + 8 });
  }
  checkState() { return false; }
}

/* ---------- Paleta (color, resaltado, tamaño) ---------- */
let paletteEl = null;
function closePalette() { paletteEl?.remove(); paletteEl = null; document.removeEventListener('mousedown', onDocDown, true); }
function onDocDown(e) { if (paletteEl && !paletteEl.contains(e.target)) closePalette(); }

export function openPalette(holder, range, pos, only = null) {
  closePalette();
  const p = document.createElement('div');
  p.className = 'fmt-palette';
  p.setAttribute('role', 'dialog');
  p.setAttribute('aria-label', 'Formato de texto');
  const sec = (key, title, html) => (!only || only === key) ? `<div class="fp-sec"><div class="fp-title">${title}</div><div class="fp-row">${html}</div></div>` : '';
  p.innerHTML =
    sec('c', 'Color del texto', COLORS.map(([k, label, hex]) => `<button type="button" class="fp-swatch" data-f="c" data-v="${k}" title="${label}" aria-label="${label}" style="--sw:${hex}"><span>A</span></button>`).join('')) +
    sec('mark', 'Resaltar', MARKS.map(([k, label, hex]) => `<button type="button" class="fp-swatch mark${k ? '' : ' none'}" data-f="mark" data-v="${k}" title="${label}" aria-label="${label}" style="--sw:${hex}"></button>`).join('')) +
    sec('fs', 'Tamaño', SIZES.map(([k, label, f]) => `<button type="button" class="fp-size" data-f="fs" data-v="${k}" style="font-size:${Math.round(13 * f)}px">${label}</button>`).join(''));
  document.body.appendChild(p);
  const w = p.offsetWidth, h = p.offsetHeight;
  const x = Math.max(8, Math.min(pos.x, window.innerWidth - w - 8));
  const y = pos.y + h > window.innerHeight - 8 ? Math.max(8, pos.y - h - 40) : pos.y;
  p.style.left = x + 'px'; p.style.top = y + 'px';
  p.addEventListener('mousedown', (e) => e.preventDefault());
  p.querySelectorAll('[data-f]').forEach(btn => btn.addEventListener('click', () => {
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    applyStyle(holder, btn.dataset.f, btn.dataset.v, range);
    closePalette();
  }));
  paletteEl = p;
  setTimeout(() => document.addEventListener('mousedown', onDocDown, true), 0);
}

/* ---------- Alineación por bloque (Block Tune) ---------- */
const tunes = new Map();
export class AlignTune {
  static get isTune() { return true; }
  constructor({ data, block }) {
    this.block = block;
    this.data = { alignment: data?.alignment || 'left' };
    this.wrapper = null;
    if (block?.id) tunes.set(block.id, this);
  }
  wrap(content) {
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'align-wrap';
    this.wrapper.appendChild(content);
    this.apply();
    return this.wrapper;
  }
  apply() { if (this.wrapper) this.wrapper.dataset.align = this.data.alignment; }
  set(a) { this.data.alignment = a; this.apply(); try { this.block.dispatchChange(); } catch (e) {} }
  render() {
    return ALIGNS.map(([k, label]) => ({ icon: FICON[k], title: label, isActive: this.data.alignment === k, closeOnActivate: true, onActivate: () => this.set(k) }));
  }
  save() { return this.data; }
}
export const tuneFor = (blockId) => tunes.get(blockId);

/* ---------- Barra fija ---------- */
export function attachToolbar(holderEl, editor) {
  const bar = document.createElement('div');
  bar.className = 'fmt-bar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Formato');
  const b = (cmd, label, extra = '') => `<button type="button" class="fmt-btn" data-cmd="${cmd}" title="${label}" aria-label="${label}" ${extra}>${FICON[cmd] || ''}</button>`;
  bar.innerHTML = `
    <label class="sr" for="fmtStyle-${holderEl.id}">Estilo de párrafo</label>
    <select class="fmt-style" id="fmtStyle-${holderEl.id}">
      <option value="p">Texto normal</option><option value="1">Título 1</option><option value="2">Título 2</option><option value="3">Título 3</option><option value="4">Título 4</option>
    </select>
    <span class="fmt-sep"></span>
    ${b('bold', 'Negrita (Ctrl+B)')}${b('italic', 'Cursiva (Ctrl+I)')}${b('underline', 'Subrayado (Ctrl+U)')}${b('strike', 'Tachado')}
    <span class="fmt-sep"></span>
    ${b('color', 'Color del texto')}${b('marker', 'Resaltar')}${b('size', 'Tamaño de letra')}
    <span class="fmt-sep"></span>
    ${b('left', 'Alinear a la izquierda')}${b('center', 'Centrar')}${b('right', 'Alinear a la derecha')}${b('justify', 'Justificar')}
    <span class="fmt-sep"></span>
    ${b('clear', 'Quitar formato')}${b('undo', 'Deshacer (Ctrl+Z)')}${b('redo', 'Rehacer (Ctrl+Y)')}`;
  holderEl.parentNode.insertBefore(bar, holderEl);

  let savedRange = null;
  let lastBlockId = null;
  const trackSel = () => {
    if (!bar.isConnected) { document.removeEventListener('selectionchange', trackSel); return; }
    const r = currentRange(holderEl);
    if (r) savedRange = r.cloneRange();
    const node = r?.startContainer || document.activeElement;
    const blockEl = (node?.nodeType === 3 ? node.parentNode : node)?.closest?.('.ce-block');
    if (blockEl && holderEl.contains(blockEl)) lastBlockId = blockEl.dataset.id;
    refreshState();
  };
  const refreshState = () => {
    if (!bar.isConnected) return;
    const inside = !!currentRange(holderEl);
    [['bold', 'bold'], ['italic', 'italic'], ['underline', 'underline'], ['strike', 'strikeThrough']].forEach(([c, q]) => {
      let on = false; try { on = inside && document.queryCommandState(q); } catch (e) {}
      bar.querySelector(`[data-cmd="${c}"]`).classList.toggle('on', on);
    });
    const tune = lastBlockId && tunes.get(lastBlockId);
    ALIGNS.forEach(([k]) => bar.querySelector(`[data-cmd="${k}"]`).classList.toggle('on', !!tune && tune.data.alignment === k));
    const blockEl = lastBlockId && holderEl.querySelector(`.ce-block[data-id="${lastBlockId}"]`);
    const h = blockEl?.querySelector('h1.ce-header, h2.ce-header, h3.ce-header, h4.ce-header');
    const sel = bar.querySelector('.fmt-style');
    if (blockEl) { sel.value = h ? h.tagName.slice(1) : 'p'; sel.disabled = !h && !blockEl.querySelector('.ce-paragraph'); }
  };
  document.addEventListener('selectionchange', trackSel);
  holderEl.addEventListener('focusin', trackSel);
  holderEl.addEventListener('keyup', trackSel);
  holderEl.addEventListener('mouseup', trackSel);

  const restore = () => { if (savedRange) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(savedRange); } };
  bar.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });

  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cmd]');
    if (!btn) return;
    const cmd = btn.dataset.cmd;
    restore();
    const execMap = { bold: 'bold', italic: 'italic', underline: 'underline', strike: 'strikeThrough', undo: 'undo', redo: 'redo' };
    if (execMap[cmd]) {
      if (!currentRange(holderEl) && !['undo', 'redo'].includes(cmd)) { toast('Primero haz clic en el texto'); return; }
      document.execCommand(execMap[cmd]);
      editableOf(window.getSelection().anchorNode)?.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (['color', 'marker', 'size'].includes(cmd)) {
      const r = currentRange(holderEl);
      if (!r || r.collapsed) { toast('Primero selecciona el texto'); return; }
      const rect = btn.getBoundingClientRect();
      openPalette(holderEl, r.cloneRange(), { x: rect.left, y: rect.bottom + 6 }, cmd === 'color' ? 'c' : cmd === 'marker' ? 'mark' : 'fs');
    } else if (ALIGNS.some(([k]) => k === cmd)) {
      const tune = lastBlockId && tunes.get(lastBlockId);
      if (!tune) { toast('Haz clic en el párrafo que quieres alinear'); return; }
      tune.set(cmd);
    } else if (cmd === 'clear') clearFormat(holderEl);
    setTimeout(refreshState, 0);
  });

  bar.querySelector('.fmt-style').addEventListener('change', async (e) => {
    const v = e.target.value;
    const id = lastBlockId;
    const block = id && editor.blocks.getById(id);
    if (!block) { toast('Haz clic en el párrafo que quieres cambiar'); return; }
    if (!['paragraph', 'header'].includes(block.name)) { toast('Ese bloque no se puede convertir en título'); refreshState(); return; }
    const saved = await block.save();
    const text = saved?.data?.text || '';
    const align = tunes.get(id)?.data.alignment || 'left';
    const index = editor.blocks.getBlockIndex(id);
    const nb = v === 'p'
      ? editor.blocks.insert('paragraph', { text }, {}, index, true, true)
      : editor.blocks.insert('header', { text, level: Number(v) }, {}, index, true, true);
    lastBlockId = nb.id;
    setTimeout(() => {
      const t = tunes.get(nb.id); if (t && align !== 'left') t.set(align);
      try { editor.caret.setToBlock(index, 'end'); } catch (err) {}
      refreshState();
    }, 30);
  });

  return () => { document.removeEventListener('selectionchange', trackSel); closePalette(); bar.remove(); };
}

/* ---------- Para exportar ---------- */
export const colorHex = (cls) => (COLORS.find(([k]) => k && cls === 'c-' + k) || [])[2];
export const markHex = (cls) => (MARKS.find(([k]) => k && cls === 'mark-' + k) || [])[2];
export const sizeFactor = (cls) => (SIZES.find(([k]) => k && cls === 'fs-' + k) || [])[2];
export function formatCSS(prefix = '') {
  return COLORS.filter(c => c[0]).map(([k, , hex]) => `${prefix} .c-${k}{color:${hex}}`).join('') +
    MARKS.filter(c => c[0]).map(([k, , hex]) => `${prefix} mark.mark-${k}{background:${hex};color:inherit}`).join('') +
    SIZES.filter(c => c[0]).map(([k, , f]) => `${prefix} .fs-${k}{font-size:${f}em}`).join('') +
    `${prefix} [data-align="center"]{text-align:center}${prefix} [data-align="right"]{text-align:right}${prefix} [data-align="justify"]{text-align:justify}`;
}
export { esc };
