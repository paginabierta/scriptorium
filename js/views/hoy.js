// Pantalla «Hoy».
import * as drive from '../drive.js';
import { S, $, esc, icon, fechaLarga, fechaCorta, isoDate, parseISO, liveNotes, spacesOrdered, notesIn, settings } from '../core.js';
import { liturgicalDay, nextCelebration, COLORES } from '../liturgia.js';
import { createNote, noteRow, pendientes } from './notes.js';
import { prepararHomilia } from './calendar.js';
import { dueNotes } from './review.js';
import { lastBook } from './library.js';
import { lastProject, todayWords, streak } from './writing.js';

const fmt = (n) => Number(n || 0).toLocaleString('es-CO');
const dot = (color) => `<span class="lit-dot" style="background:${COLORES[color]};${color === 'blanco' ? 'border:1.5px solid #B9AC96;' : ''}"></span>`;

function userName() {
  return (settings().userName || '').trim() || drive.account().name.split(' ')[0] || '';
}

export function viewHoy() {
  const now = new Date();
  const lit = liturgicalDay(now);
  const h = now.getHours();
  const saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  const nombre = userName();
  const pend = pendientes().slice(0, 7);
  const recientes = liveNotes().sort((a, b) => b.updated - a.updated).slice(0, 6);
  const nx = nextCelebration(now);
  const nxIso = nx ? isoDate(nx.fecha) : '';
  const yaHay = nx ? liveNotes().filter(n => n.fecha === nxIso && n.litKey === nx.clave) : [];
  const antes = nx ? liveNotes().filter(n => n.litKey === nx.clave && n.fecha !== nxIso).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')).slice(0, 4) : [];
  const due = dueNotes();
  const book = lastBook();
  const proj = lastProject();
  const cuando = nx ? (nxIso === isoDate(now) ? 'Hoy' : (() => { const t = new Date(now); t.setDate(t.getDate() + 1); return isoDate(t) === nxIso ? 'Mañana' : ''; })()) : '';

  $('#view').innerHTML = `
    <div class="page">
      <header class="page-head">
        <div>
          <div class="eyebrow">${esc(fechaLarga(now))}</div>
          <h1 class="display">${saludo}${nombre ? ', ' + esc(nombre) : ''}</h1>
        </div>
        <div class="head-actions">
          <a class="pill" href="#/calendario">${dot(lit.color)}${esc(lit.etiqueta || lit.semana)}</a>
          <span class="pill">Ciclo ${lit.ciclo} · ${lit.anoFerial}</span>
          <button type="button" class="btn primary" id="newNote">${icon('mas', 14)}Nueva nota</button>
        </div>
      </header>

      ${nx ? `<section class="card feature">
        <div class="feature-main">
          <div class="eyebrow accent">${dot(nx.color)}${cuando ? cuando + ' · ' : ''}${esc(fechaCorta(nx.fecha))}</div>
          <h2 class="feature-title">${esc(nx.etiqueta)}</h2>
          <p class="hint">${esc(nx.tiempo)} · Ciclo ${nx.ciclo}</p>
          <div class="btn-row">
            ${yaHay.length ? `<a class="btn primary" href="#/nota/${yaHay[0].id}">${icon('pluma', 14)}Seguir con la homilía</a>` : `<button type="button" class="btn primary" id="prepHom">${icon('pluma', 14)}Preparar homilía</button>`}
            <a class="btn" href="#/calendario">${icon('calendario', 14)}Calendario</a>
          </div>
        </div>
        <aside class="feature-side">
          <div class="mini-label">Lo que escribiste antes para este día</div>
          ${antes.length ? antes.map(n => `<a class="prev-hom" href="#/nota/${n.id}"><span>${esc(n.title || 'Sin título')}</span><small>${n.fecha?.slice(0, 4)} · ciclo ${liturgicalDay(parseISO(n.fecha)).ciclo}</small></a>`).join('')
            : `<p class="hint">Aún nada. Cuando prepares homilías con fecha, aquí verás las de años anteriores.</p>`}
        </aside>
      </section>` : ''}

      <div class="grid">
        <section class="card">
          <h2 class="card-title">Pendientes</h2>
          ${pend.length ? `<ul class="plain">${pend.map(p => `<li><a href="#/nota/${p.note.id}" class="pend"><span class="box" aria-hidden="true"></span><span><span>${esc(p.text)}</span><span class="pend-src">${esc(p.note.title || 'Sin título')}</span></span></a></li>`).join('')}</ul>`
            : `<p class="empty">Nada pendiente. Las casillas sin marcar de tus notas aparecen aquí.</p>`}
        </section>

        ${book ? `<section class="card">
          <h2 class="card-title">Seguir leyendo</h2>
          <a class="book-row" href="#/leer/${book.id}">
            ${book.cover ? `<img src="${book.cover}" alt="" class="mini-cover">` : `<span class="mini-cover fake">${esc(book.title.slice(0, 20))}</span>`}
            <span class="grow"><strong>${esc(book.title)}</strong><span class="hint">${esc(book.author || '')}</span>
              <span class="bar"><span style="width:${Math.round(book.percent || 0)}%"></span></span>
              <span class="hint">${Math.round(book.percent || 0)} %${book.highlights?.length ? ` · ${book.highlights.length} subrayados` : ''}</span></span>
          </a>
        </section>` : ''}

        ${proj ? `<section class="card">
          <h2 class="card-title">${esc(proj.title)}</h2>
          <div class="stat-row">
            <div class="stat"><span class="stat-n">${fmt(todayWords(proj))}</span><span class="stat-l">palabras hoy${proj.dailyGoal ? ` de ${fmt(proj.dailyGoal)}` : ''}</span></div>
            <div class="stat"><span class="stat-n">${streak(proj)}</span><span class="stat-l">días seguidos</span></div>
          </div>
          ${proj.dailyGoal ? `<div class="bar"><div style="width:${Math.min(100, Math.round(todayWords(proj) / proj.dailyGoal * 100))}%"></div></div>` : ''}
          <div class="btn-row"><a class="btn" href="#/escritura/${proj.id}">${icon('pluma', 14)}Seguir escribiendo</a></div>
        </section>` : ''}

        <section class="card">
          <h2 class="card-title">Para repasar</h2>
          ${due.length ? `<p><span class="big-n">${due.length}</span> nota${due.length > 1 ? 's' : ''} para hoy.</p><div class="btn-row"><a class="btn primary" href="#/repaso">${icon('repaso', 14)}Empezar repaso</a></div>`
            : `<p class="empty">Nada para hoy. Marca una nota con «Repasar» para que vuelva cuando toque.</p>`}
        </section>

        <section class="card">
          <h2 class="card-title">Notas recientes</h2>
          ${recientes.length ? `<div class="rows">${recientes.map(n => noteRow(n)).join('')}</div>` : `<p class="empty">Aún no hay notas.</p>`}
        </section>

        <section class="card">
          <h2 class="card-title">Tus espacios</h2>
          <div class="space-grid">
            ${spacesOrdered().map(s => `<a href="#/espacio/${s.id}" class="space-tile"><span class="dot lg" style="background:${esc(s.color)}"></span><span class="grow">${esc(s.name)}</span><span class="count">${notesIn(s.id).length}</span></a>`).join('')}
          </div>
        </section>
      </div>
    </div>`;
  $('#newNote').addEventListener('click', () => createNote({ ask: true }));
  $('#prepHom')?.addEventListener('click', () => prepararHomilia(nxIso));
}
