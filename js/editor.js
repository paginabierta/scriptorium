// Editor por bloques (Editor.js) y conversión de bloques a HTML, texto y Markdown.
import { esc, stripTags, settings } from './core.js';
import { BibliaTool, MagisterioTool, ReferenciaTool, magisterioCita } from './blocks.js';
import { formatAPA } from './apa.js';
import { UnderlineTool, StrikeTool, StyleTool, AlignTune, attachToolbar, formatCSS } from './format.js';

// Estilos de color, resaltado, tamaño y alineación (los mismos que usan las exportaciones)
if (!document.getElementById('fmt-css')) { const st = document.createElement('style'); st.id = 'fmt-css'; st.textContent = formatCSS(); document.head.appendChild(st); }

export const EDITOR_I18N = {
  messages: {
    ui: {
      blockTunes: { toggler: { 'Click to tune': 'Opciones', 'or drag to move': 'o arrastra para mover' } },
      inlineToolbar: { converter: { 'Convert to': 'Convertir en' } },
      toolbar: { toolbox: { Add: 'Añadir' } },
      popover: { Filter: 'Buscar', 'Nothing found': 'Nada encontrado', 'Convert to': 'Convertir en' },
    },
    toolNames: {
      Text: 'Texto', Heading: 'Título', 'Unordered List': 'Lista', 'Ordered List': 'Lista numerada', Checklist: 'Casillas',
      Quote: 'Cita', Delimiter: 'Separador', Bold: 'Negrita', Italic: 'Cursiva', Link: 'Enlace', List: 'Lista', Underline: 'Subrayado', Strike: 'Tachado', Estilo: 'Color y tamaño', Align: 'Alineación', Biblia: 'Cita bíblica', Magisterio: 'Magisterio', Referencia: 'Referencia APA',
    },
    tools: {
      link: { 'Add a link': 'Pega un enlace' },
      header: { 'Heading 1': 'Título 1', 'Heading 2': 'Título 2', 'Heading 3': 'Título 3', 'Heading 4': 'Título 4' },
      list: { Unordered: 'Con viñetas', Ordered: 'Numerada', Checklist: 'Casillas', 'Start with': 'Empezar en', 'Counter type': 'Tipo de número' },
    },
    blockTunes: {
      delete: { Delete: 'Eliminar', 'Click to delete': 'Confirmar' },
      moveUp: { 'Move up': 'Subir' },
      moveDown: { 'Move down': 'Bajar' },
    },
  },
};

export function createEditor(holder, data, { onChange, placeholder, minimal = false, readOnly = false } = {}) {
  const inline = ['bold', 'italic', 'underline', 'strike', 'estilo', 'link'];
  const tools = {
    paragraph: { inlineToolbar: inline, tunes: ['align'] },
    header: { class: Header, inlineToolbar: inline, tunes: ['align'], config: { levels: [1, 2, 3, 4], defaultLevel: 2, placeholder: 'Título' } },
    list: { class: EditorjsList, inlineToolbar: inline, tunes: ['align'], config: { defaultStyle: 'unordered' } },
    quote: { class: Quote, inlineToolbar: inline, tunes: ['align'], config: { quotePlaceholder: 'Cita', captionPlaceholder: 'Fuente' } },
    delimiter: Delimiter,
    underline: { class: UnderlineTool },
    strike: { class: StrikeTool },
    estilo: { class: StyleTool },
    align: { class: AlignTune },
    biblia: { class: BibliaTool, inlineToolbar: inline, tunes: ['align'] },
  };
  if (!minimal) {
    tools.checklist = { class: Checklist, inlineToolbar: inline, tunes: ['align'] };
    tools.magisterio = { class: MagisterioTool, inlineToolbar: inline, tunes: ['align'] };
    tools.referencia = { class: ReferenciaTool };
  }
  const el = typeof holder === 'string' ? document.getElementById(holder) : holder;
  const editor = new EditorJS({
    holder,
    data: data?.blocks?.length ? data : { blocks: [] },
    placeholder: placeholder || 'Escribe aquí… Pulsa Tab para elegir un tipo de bloque',
    i18n: EDITOR_I18N,
    readOnly,
    tools,
    onChange: () => onChange?.(),
  });
  if (!readOnly && el) {
    editor.isReady.then(() => {
      if (!el.isConnected) return;
      const detach = attachToolbar(el, editor);
      const destroy = editor.destroy.bind(editor);
      editor.destroy = () => { detach(); try { destroy(); } catch (e) {} };
    }).catch(() => {});
  }
  return editor;
}

/* ---------- Conversión ---------- */
function listItemsHtml(items, style) {
  const tag = style === 'ordered' ? 'ol' : 'ul';
  return `<${tag}${style === 'checklist' ? ' class="checklist"' : ''}>${(items || []).map(it => {
    if (typeof it === 'string') return `<li>${it}</li>`;
    const box = style === 'checklist' ? `<span class="cbox${it.meta?.checked ? ' on' : ''}"></span>` : '';
    return `<li>${box}${it.content || ''}${it.items?.length ? listItemsHtml(it.items, style) : ''}</li>`;
  }).join('')}</${tag}>`;
}

export function blocksToHtml(blocks = []) {
  const conn = settings().apaConnector || 'y';
  return blocks.map(b => {
    const al = b.tunes?.align?.alignment;
    const html = blockHtml(b, conn);
    return al && al !== 'left' && html ? `<div data-align="${al}">${html}</div>` : html;
  }).join('\n');
}

function blockHtml(b, conn) {
    const d = b.data || {};
    switch (b.type) {
      case 'paragraph': return `<p>${d.text || ''}</p>`;
      case 'header': return `<h${d.level || 2}>${d.text || ''}</h${d.level || 2}>`;
      case 'list': return listItemsHtml(d.items, d.style);
      case 'checklist': return `<ul class="checklist">${(d.items || []).map(i => `<li><span class="cbox${i.checked ? ' on' : ''}"></span>${i.text || ''}</li>`).join('')}</ul>`;
      case 'quote': return `<blockquote><p>${d.text || ''}</p>${d.caption ? `<cite>${d.caption}</cite>` : ''}</blockquote>`;
      case 'delimiter': return '<hr>';
      case 'biblia': return (d.text || d.ref) ? `<blockquote class="biblia">${d.label ? `<small>${esc(d.label)}</small>` : ''}<p>${d.text || ''}</p><cite>${esc(d.ref || '')}</cite></blockquote>` : '';
      case 'magisterio': return `<blockquote class="magisterio"><p>${d.text || ''}</p><cite>${esc(magisterioCita(d))}</cite></blockquote>`;
      case 'referencia': return `<p class="apa">${formatAPA(d, conn)}</p>`;
      default: return d.text ? `<p>${d.text}</p>` : '';
    }
}

export function blocksToText(blocks = []) {
  const out = [];
  const walk = (items) => (items || []).forEach(it => {
    if (typeof it === 'string') out.push(stripTags(it));
    else { out.push(stripTags(it.text || it.content || '')); walk(it.items); }
  });
  for (const b of blocks) {
    const d = b.data || {};
    if (b.type === 'referencia') { out.push(stripTags(formatAPA(d, settings().apaConnector))); continue; }
    if (d.text) out.push(stripTags(d.text));
    if (d.caption) out.push(stripTags(d.caption));
    if (d.ref) out.push(d.ref);
    if (b.type === 'magisterio') out.push(magisterioCita(d));
    walk(d.items);
  }
  return out.filter(Boolean).join(' ');
}

const mdInline = (html = '') => String(html)
  .replace(/<(b|strong)>(.*?)<\/\1>/gi, '**$2**')
  .replace(/<(i|em)>(.*?)<\/\1>/gi, '*$2*')
  .replace(/<a [^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
  .replace(/<br\s*\/?>/gi, '  \n')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');

export function blocksToMarkdown(blocks = []) {
  const conn = settings().apaConnector || 'y';
  const list = (items, style, depth = 0) => (items || []).map((it, i) => {
    const pad = '  '.repeat(depth);
    if (typeof it === 'string') return `${pad}- ${mdInline(it)}`;
    const mark = style === 'ordered' ? `${i + 1}.` : style === 'checklist' ? `- [${it.meta?.checked ? 'x' : ' '}]` : '-';
    return `${pad}${mark} ${mdInline(it.content)}` + (it.items?.length ? '\n' + list(it.items, style, depth + 1) : '');
  }).join('\n');
  return blocks.map(b => {
    const d = b.data || {};
    switch (b.type) {
      case 'paragraph': return mdInline(d.text);
      case 'header': return `${'#'.repeat((d.level || 2))} ${mdInline(d.text)}`;
      case 'list': return list(d.items, d.style);
      case 'checklist': return (d.items || []).map(i => `- [${i.checked ? 'x' : ' '}] ${mdInline(i.text)}`).join('\n');
      case 'quote': return `> ${mdInline(d.text)}${d.caption ? `\n> — ${mdInline(d.caption)}` : ''}`;
      case 'delimiter': return '* * *';
      case 'biblia': return `> ${mdInline(d.text)}\n> (${d.ref})`;
      case 'magisterio': return `> ${mdInline(d.text)}\n> (${magisterioCita(d)})`;
      case 'referencia': return mdInline(formatAPA(d, conn));
      default: return mdInline(d.text || '');
    }
  }).filter(s => s !== '').join('\n\n');
}

// Todas las referencias APA de un conjunto de bloques
export function collectReferences(blocks = []) {
  return blocks.filter(b => b.type === 'referencia' && (b.data?.titulo || b.data?.autores)).map(b => b.data);
}
