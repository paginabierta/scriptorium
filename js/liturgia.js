// Calendario litúrgico (rito romano, con los traslados de Colombia: Epifanía, Bautismo,
// Ascensión y Corpus Christi al domingo). Calcula tiempo, semana, color, ciclo y las
// principales solemnidades. Cada domingo y solemnidad tiene una "clave" (p. ej. TO-31,
// TODOSSANTOS) que permite encontrar las homilías de ese mismo día en otros años.

const DAY = 86400000;
function d(y, m, day) { return new Date(y, m, day); }
function addDays(date, n) { const r = new Date(date); r.setDate(r.getDate() + n); return r; }
function onlyDate(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function diffDays(a, b) { return Math.round((onlyDate(a) - onlyDate(b)) / DAY); }
function same(a, b) { return diffDays(a, b) === 0; }
function sundayOnOrBefore(date) { return addDays(onlyDate(date), -date.getDay()); }

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
function adventStart(y) {
  const christmas = d(y, 11, 25);
  const sundayBefore = addDays(christmas, -(christmas.getDay() || 7));
  return addDays(sundayBefore, -21);
}
function epiphany(y) { for (let day = 2; day <= 8; day++) { const t = d(y, 0, day); if (t.getDay() === 0) return t; } }
function baptism(y) { const ep = epiphany(y); return ep.getDate() >= 7 ? addDays(ep, 1) : addDays(ep, 7); }
function holyFamily(y) {   // domingo dentro de la octava de Navidad; si no hay, 30 de diciembre
  for (let day = 26; day <= 31; day++) { const t = d(y, 11, day); if (t.getDay() === 0) return t; }
  return d(y, 11, 30);
}

export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII',
  'XVIII', 'XIX', 'XX', 'XXI', 'XXII', 'XXIII', 'XXIV', 'XXV', 'XXVI', 'XXVII', 'XXVIII', 'XXIX', 'XXX', 'XXXI', 'XXXII',
  'XXXIII', 'XXXIV'];

export const COLORES = { verde: '#2F6B3A', morado: '#5B3A78', blanco: '#FFFFFF', rojo: '#A32020', rosa: '#C77B9B' };

// Solemnidades y fiestas principales que tienen nombre propio
function celebration(date) {
  const t = onlyDate(date), y = t.getFullYear();
  const p = easter(y), adv = adventStart(y);
  const list = [
    [d(y, 0, 1), 'MADREDEDIOS', 'Santa María, Madre de Dios', 'blanco'],
    [epiphany(y), 'EPIFANIA', 'Epifanía del Señor', 'blanco'],
    [baptism(y), 'BAUTISMO', 'Bautismo del Señor', 'blanco'],
    [addDays(p, -46), 'CENIZA', 'Miércoles de Ceniza', 'morado'],
    [addDays(p, -7), 'RAMOS', 'Domingo de Ramos', 'rojo'],
    [addDays(p, -3), 'JUEVESSANTO', 'Jueves Santo · Cena del Señor', 'blanco'],
    [addDays(p, -2), 'VIERNESSANTO', 'Viernes Santo · Pasión del Señor', 'rojo'],
    [addDays(p, -1), 'SABADOSANTO', 'Sábado Santo · Vigilia Pascual', 'blanco'],
    [p, 'PASCUA', 'Domingo de Resurrección', 'blanco'],
    [addDays(p, 42), 'ASCENSION', 'Ascensión del Señor', 'blanco'],
    [addDays(p, 49), 'PENTECOSTES', 'Domingo de Pentecostés', 'rojo'],
    [addDays(p, 56), 'TRINIDAD', 'Santísima Trinidad', 'blanco'],
    [addDays(p, 63), 'CORPUS', 'Santísimo Cuerpo y Sangre de Cristo', 'blanco'],
    [addDays(p, 68), 'SAGRADOCORAZON', 'Sagrado Corazón de Jesús', 'blanco'],
    [d(y, 2, 19), 'SANJOSE', 'San José, esposo de la Virgen María', 'blanco'],
    [d(y, 2, 25), 'ANUNCIACION', 'Anunciación del Señor', 'blanco'],
    [d(y, 5, 24), 'SANJUAN', 'Natividad de san Juan Bautista', 'blanco'],
    [d(y, 5, 29), 'SANPEDRO', 'San Pedro y san Pablo, apóstoles', 'rojo'],
    [d(y, 7, 15), 'ASUNCION', 'Asunción de la Virgen María', 'blanco'],
    [d(y, 10, 1), 'TODOSSANTOS', 'Todos los Santos', 'blanco'],
    [d(y, 10, 2), 'DIFUNTOS', 'Conmemoración de todos los fieles difuntos', 'morado'],
    [addDays(adv, -7), 'CRISTOREY', 'Jesucristo, Rey del Universo', 'blanco'],
    [d(y, 11, 8).getDay() === 0 ? d(y, 11, 9) : d(y, 11, 8), 'INMACULADA', 'Inmaculada Concepción de la Virgen María', 'blanco'],
    [d(y, 11, 25), 'NAVIDAD', 'Natividad del Señor', 'blanco'],
    [holyFamily(y), 'SAGRADAFAMILIA', 'Sagrada Familia de Jesús, María y José', 'blanco'],
  ];
  const hit = list.find(([dt]) => same(dt, t));
  return hit ? { clave: hit[1], nombre: hit[2], color: hit[3] } : null;
}

export function liturgicalDay(date = new Date()) {
  const today = onlyDate(date);
  const y = today.getFullYear();
  const adv = adventStart(y);
  const litYearEnd = today >= adv ? y + 1 : y;
  const ciclo = ['C', 'A', 'B'][litYearEnd % 3];
  const anoFerial = litYearEnd % 2 === 0 ? 'Año par' : 'Año impar';
  const res = { tiempo: '', semana: '', semanaNum: 0, color: 'verde', ciclo, anoFerial, etiqueta: '', clave: '', domingo: today.getDay() === 0, nombreDomingo: '' };

  const pascua = easter(y), ceniza = addDays(pascua, -46), ramos = addDays(pascua, -7);
  const pentecostes = addDays(pascua, 49), bautismo = baptism(y), cristoRey = addDays(adv, -7);
  let pre = '';

  if (today >= adv && today < d(y, 11, 25)) {
    const sem = Math.floor(diffDays(today, adv) / 7) + 1;
    Object.assign(res, { tiempo: 'Adviento', semana: `Semana ${ROMAN[sem]} de Adviento`, semanaNum: sem, color: 'morado' });
    pre = 'ADV'; res.nombreDomingo = `${ROMAN[sem]} Domingo de Adviento`;
    if (res.domingo && sem === 3) res.color = 'rosa';
  } else if (today >= d(y, 11, 25) || today <= bautismo) {
    Object.assign(res, { tiempo: 'Navidad', semana: 'Tiempo de Navidad', color: 'blanco' });
    if (today.getMonth() === 11 || (today.getMonth() === 0 && today.getDate() === 1)) res.semana = 'Octava de Navidad';
    pre = 'NAV'; res.nombreDomingo = 'Domingo del tiempo de Navidad';
  } else if (today > bautismo && today < ceniza) {
    const sem = Math.floor(diffDays(today, sundayOnOrBefore(bautismo)) / 7) + 1;
    Object.assign(res, { tiempo: 'Tiempo Ordinario', semana: `Semana ${ROMAN[sem]} del Tiempo Ordinario`, semanaNum: sem, color: 'verde' });
    pre = 'TO'; res.nombreDomingo = `${ROMAN[sem]} Domingo del Tiempo Ordinario`;
  } else if (today >= ceniza && today < pascua) {
    if (today < addDays(ceniza, 4)) Object.assign(res, { tiempo: 'Cuaresma', semana: 'Después de Ceniza', color: 'morado' });
    else if (today >= ramos) Object.assign(res, { tiempo: 'Semana Santa', semana: 'Semana Santa', color: 'morado' });
    else {
      const sem = Math.floor(diffDays(today, addDays(ceniza, 4)) / 7) + 1;
      Object.assign(res, { tiempo: 'Cuaresma', semana: `Semana ${ROMAN[sem]} de Cuaresma`, semanaNum: sem, color: 'morado' });
      pre = 'CUA'; res.nombreDomingo = `${ROMAN[sem]} Domingo de Cuaresma`;
      if (res.domingo && sem === 4) res.color = 'rosa';
    }
  } else if (today >= pascua && today <= pentecostes) {
    const sem = Math.floor(diffDays(today, pascua) / 7) + 1;
    Object.assign(res, { tiempo: 'Pascua', semana: sem === 1 ? 'Octava de Pascua' : `Semana ${ROMAN[sem]} de Pascua`, semanaNum: sem, color: 'blanco' });
    pre = 'PAS'; res.nombreDomingo = `${ROMAN[sem]} Domingo de Pascua`;
  } else {
    const sem = 34 - Math.round(diffDays(cristoRey, sundayOnOrBefore(today)) / 7);
    Object.assign(res, { tiempo: 'Tiempo Ordinario', semana: `Semana ${ROMAN[sem] || sem} del Tiempo Ordinario`, semanaNum: sem, color: 'verde' });
    pre = 'TO'; res.nombreDomingo = `${ROMAN[sem] || sem} Domingo del Tiempo Ordinario`;
  }

  const cel = celebration(today);
  if (cel) {
    res.etiqueta = cel.nombre; res.color = cel.color; res.clave = cel.clave;
  } else if (res.domingo && pre && res.semanaNum) {
    res.etiqueta = res.nombreDomingo;
    res.clave = `${pre}-${res.semanaNum}`;
  } else if (res.domingo && pre === 'NAV') {
    res.etiqueta = 'Domingo del tiempo de Navidad'; res.clave = 'NAV-DOM';
  }
  return res;
}

// Próximo domingo o solemnidad (incluye hoy). Devuelve { fecha, ...liturgicalDay }
export function nextCelebration(from = new Date()) {
  for (let i = 0; i < 8; i++) {
    const dt = addDays(onlyDate(from), i);
    const lit = liturgicalDay(dt);
    if (lit.clave && (lit.domingo || celebration(dt))) return { fecha: dt, ...lit };
  }
  return null;
}
