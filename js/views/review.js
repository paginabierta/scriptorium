// Repaso espaciado: las notas marcadas «Repasar» vuelven en el momento justo para no olvidarlas.
import { S, $, $$, esc, icon, save, liveNotes, isoDate, parseISO, refresh, toast } from '../core.js';
import { blocksToHtml } from '../editor.js';

const today = () => isoDate(new Date());
const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return isoDate(d); };

export function dueNotes() {
  const t = today();
  return liveNotes().filter(n => n.review && n.review.due <= t && !S.spaces.get(n.spaceId)?.archived);
}

export async function reviewToggle(note) {
  if (note.review) { delete note.review; await save(note); return false; }
  note.review = { due: today(), interval: 0, ease: 2.5, reps: 0 };
  await save(note);
  return true;
}

// Calificación: 0 Otra vez · 1 Difícil · 2 Bien · 3 Fácil
export function schedule(r, grade) {
  let { interval = 0, ease = 2.5, reps = 0 } = r;
  if (grade === 0) { reps = 0; interval = 1; ease = Math.max(1.3, ease - 0.2); }
  else {
    if (reps === 0) interval = grade === 3 ? 3 : 1;
    else if (reps === 1) interval = grade === 1 ? 2 : grade === 3 ? 7 : 4;
    else interval = Math.round(interval * (grade === 1 ? 1.2 : grade === 3 ? ease * 1.3 : ease));
    if (grade === 1) ease = Math.max(1.3, ease - 0.15);
    if (grade === 3) ease += 0.15;
    reps += 1;
  }
  return { interval, ease: Math.round(ease * 100) / 100, reps, due: addDays(today(), interval), last: today() };
}

const label = (days) => days <= 1 ? 'mañana' : days < 30 ? `en ${days} días` : days < 365 ? `en ${Math.round(days / 30)} meses` : 'en más de un año';

export function viewReview() {
  const queue = dueNotes().sort((a, b) => a.review.due.localeCompare(b.review.due));
  const total = liveNotes().filter(n => n.review).length;
  const v = $('#view');
  if (!queue.length) {
    const next = liveNotes().filter(n => n.review).sort((a, b) => a.review.due.localeCompare(b.review.due))[0];
    v.innerHTML = `<div class="page narrow">
      <header class="page-head"><div><h1 class="display">Repaso</h1><p class="lead">${total ? `Tienes ${total} nota${total > 1 ? 's' : ''} en repaso.` : 'Marca cualquier nota con «Repasar» y aparecerá aquí.'}</p></div></header>
      <section class="card"><p class="empty">${total ? `Nada pendiente por hoy.${next ? ` La próxima vuelve el ${esc(next.review.due.split('-').reverse().join('/'))}.` : ''}` : 'Sirve para conceptos de psicología, teología o cualquier cosa que quieras recordar: lees, intentas recordar, y la app decide cuándo volver a mostrártela.'}</p></section>
    </div>`;
    return;
  }
  let i = 0;
  const show = () => {
    const n = queue[i];
    if (!n) {
      v.innerHTML = `<div class="page narrow"><header class="page-head"><div><h1 class="display">Repaso</h1></div></header>
        <section class="card center-card"><p class="big-ok">Listo por hoy</p><p class="hint">Repasaste ${queue.length} nota${queue.length > 1 ? 's' : ''}.</p><a class="btn primary" href="#/hoy">Volver a Hoy</a></section></div>`;
      refresh();
      return;
    }
    const sp = S.spaces.get(n.spaceId);
    const preview = (g) => label(schedule(n.review, g).interval);
    v.innerHTML = `<div class="page narrow">
      <header class="page-head"><div><div class="eyebrow">${i + 1} de ${queue.length}</div><h1 class="display">Repaso</h1></div></header>
      <section class="card review-card">
        <div class="eyebrow">${sp ? `<span class="dot" style="background:${esc(sp.color)}"></span>${esc(sp.name)}` : ''}</div>
        <h2 class="review-title">${esc(n.title || 'Sin título')}</h2>
        <p class="hint" id="rvHint">Intenta recordar de qué trata antes de mostrarla.</p>
        <div id="rvBody" class="review-body" hidden>${blocksToHtml(n.content?.blocks || [])}</div>
        <div class="review-actions" id="rvShow"><button type="button" class="btn primary" id="showBtn">${icon('ojo', 14)}Mostrar</button></div>
        <div class="review-actions grades" id="rvGrades" hidden>
          <button type="button" class="btn" data-g="0">Otra vez<small>${preview(0)}</small></button>
          <button type="button" class="btn" data-g="1">Difícil<small>${preview(1)}</small></button>
          <button type="button" class="btn primary" data-g="2">Bien<small>${preview(2)}</small></button>
          <button type="button" class="btn" data-g="3">Fácil<small>${preview(3)}</small></button>
        </div>
        <p class="hint center"><a href="#/nota/${n.id}">Abrir la nota</a></p>
      </section></div>`;
    $('#showBtn').addEventListener('click', () => { $('#rvBody').hidden = false; $('#rvShow').hidden = true; $('#rvGrades').hidden = false; $('#rvHint').hidden = true; });
    $$('[data-g]').forEach(b => b.addEventListener('click', async () => {
      n.review = schedule(n.review, Number(b.dataset.g));
      await save(n);
      i += 1; show();
    }));
  };
  show();
}
