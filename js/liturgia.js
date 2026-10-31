// Calendario litúrgico básico (rito romano, calendario de Colombia para Epifanía y Bautismo).
// Calcula tiempo, semana, color y ciclo. Las fiestas y solemnidades concretas llegan en la Fase 2.

const DAY = 86400000;

function d(y, m, day) { return new Date(y, m, day); }           // m: 0-11
function addDays(date, n) { const r = new Date(date); r.setDate(r.getDate() + n); return r; }
function onlyDate(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function diffDays(a, b) { return Math.round((onlyDate(a) - onlyDate(b)) / DAY); }
function sundayOnOrBefore(date) { return addDays(onlyDate(date), -date.getDay()); }

// Domingo de Pascua (algoritmo anónimo gregoriano)
export function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const dd = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - dd - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return d(y, month - 1, day);
}

// Primer domingo de Adviento: el domingo entre el 27 de nov y el 3 de dic
function adventStart(y) {
  const christmas = d(y, 11, 25);
  const sundayBefore = addDays(christmas, -(christmas.getDay() || 7));
  return addDays(sundayBefore, -21);
}

// Epifanía en Colombia: domingo entre el 2 y el 8 de enero
function epiphany(y) {
  for (let day = 2; day <= 8; day++) { const t = d(y, 0, day); if (t.getDay() === 0) return t; }
}

// Bautismo del Señor: domingo después de Epifanía; si Epifanía cae 7 u 8, el lunes siguiente
function baptism(y) {
  const ep = epiphany(y);
  return ep.getDate() >= 7 ? addDays(ep, 1) : addDays(ep, 7);
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII',
  'XVIII', 'XIX', 'XX', 'XXI', 'XXII', 'XXIII', 'XXIV', 'XXV', 'XXVI', 'XXVII', 'XXVIII', 'XXIX', 'XXX', 'XXXI', 'XXXII',
  'XXXIII', 'XXXIV'];

export const COLORES = {
  verde: '#2F6B3A', morado: '#5B3A78', blanco: '#FFFFFF', rojo: '#A32020', rosa: '#C77B9B'
};

export function liturgicalDay(date = new Date()) {
  const today = onlyDate(date);
  const y = today.getFullYear();

  // Año litúrgico: empieza en Adviento
  const adv = adventStart(y);
  const litYearEnd = today >= adv ? y + 1 : y;     // año civil en que termina este año litúrgico
  const ciclo = ['C', 'A', 'B'][litYearEnd % 3];
  const anoFerial = litYearEnd % 2 === 0 ? 'Año par' : 'Año impar';

  const res = { tiempo: '', semana: '', color: 'verde', ciclo, anoFerial, etiqueta: '' };

  const pascua = easter(y);
  const ceniza = addDays(pascua, -46);
  const ramos = addDays(pascua, -7);
  const pentecostes = addDays(pascua, 49);
  const bautismo = baptism(y);
  const cristoRey = addDays(adv, -7);

  if (today >= adv && today < d(y, 11, 25)) {
    const sem = Math.floor(diffDays(today, adv) / 7) + 1;
    Object.assign(res, { tiempo: 'Adviento', semana: `Semana ${ROMAN[sem]} de Adviento`, color: 'morado' });
    if (today.getDay() === 0 && sem === 3) res.color = 'rosa';
  } else if (today >= d(y, 11, 25) || today <= bautismo) {
    Object.assign(res, { tiempo: 'Navidad', semana: 'Tiempo de Navidad', color: 'blanco' });
    if (today.getMonth() === 11 && today.getDate() <= 31 && diffDays(today, d(y, 11, 25)) <= 7) res.semana = 'Octava de Navidad';
    if (today.getMonth() === 0 && today.getDate() === 1) res.semana = 'Octava de Navidad';
    if (diffDays(today, bautismo) === 0) res.etiqueta = 'Bautismo del Señor';
    if (diffDays(today, epiphany(y)) === 0) res.etiqueta = 'Epifanía del Señor';
  } else if (today > bautismo && today < ceniza) {
    const ref = sundayOnOrBefore(bautismo);
    const sem = Math.floor(diffDays(today, ref) / 7) + 1;
    Object.assign(res, { tiempo: 'Tiempo Ordinario', semana: `Semana ${ROMAN[sem]} del Tiempo Ordinario`, color: 'verde' });
  } else if (today >= ceniza && today < pascua) {
    if (today < addDays(ceniza, 4)) {
      Object.assign(res, { tiempo: 'Cuaresma', semana: 'Después de Ceniza', color: 'morado' });
      if (diffDays(today, ceniza) === 0) res.etiqueta = 'Miércoles de Ceniza';
    } else if (today >= ramos) {
      Object.assign(res, { tiempo: 'Semana Santa', semana: 'Semana Santa', color: 'morado' });
      const n = diffDays(today, ramos);
      if (n === 0) { res.etiqueta = 'Domingo de Ramos'; res.color = 'rojo'; }
      if (n === 4) { res.etiqueta = 'Jueves Santo'; res.color = 'blanco'; }
      if (n === 5) { res.etiqueta = 'Viernes Santo'; res.color = 'rojo'; }
      if (n === 6) { res.etiqueta = 'Sábado Santo'; }
    } else {
      const sem = Math.floor(diffDays(today, addDays(ceniza, 4)) / 7) + 1;
      Object.assign(res, { tiempo: 'Cuaresma', semana: `Semana ${ROMAN[sem]} de Cuaresma`, color: 'morado' });
      if (today.getDay() === 0 && sem === 4) res.color = 'rosa';
    }
  } else if (today >= pascua && today <= pentecostes) {
    const sem = Math.floor(diffDays(today, pascua) / 7) + 1;
    Object.assign(res, { tiempo: 'Pascua', semana: sem === 1 ? 'Octava de Pascua' : `Semana ${ROMAN[sem]} de Pascua`, color: 'blanco' });
    if (diffDays(today, pascua) === 0) res.etiqueta = 'Domingo de Resurrección';
    if (diffDays(today, pentecostes) === 0) { res.etiqueta = 'Domingo de Pentecostés'; res.color = 'rojo'; }
  } else {
    const ref = sundayOnOrBefore(today);
    const sem = 34 - Math.round(diffDays(cristoRey, ref) / 7);
    Object.assign(res, { tiempo: 'Tiempo Ordinario', semana: `Semana ${ROMAN[sem] || sem} del Tiempo Ordinario`, color: 'verde' });
    if (diffDays(today, cristoRey) === 0) { res.etiqueta = 'Jesucristo, Rey del Universo'; res.color = 'blanco'; }
  }
  return res;
}
