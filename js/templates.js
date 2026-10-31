// Plantillas iniciales. Quedan como plantillas editables: puedes cambiarlas, borrarlas o crear nuevas.
const P = (text) => ({ type: 'paragraph', data: { text } });
const H = (text, level = 2) => ({ type: 'header', data: { text, level } });
const L = (...items) => ({ type: 'list', data: { style: 'unordered', meta: {}, items: items.map(content => ({ content, meta: {}, items: [] })) } });
const C = (...items) => ({ type: 'checklist', data: { items: items.map(text => ({ text, checked: false })) } });
const B = (label = '') => ({ type: 'biblia', data: { ref: '', text: '', label } });

export const DEFAULT_TEMPLATES = [
  { key: 'homilia', name: 'Homilía', blocks: [
    H('Lecturas'), B('Primera lectura'), B('Salmo'), B('Segunda lectura'), B('Evangelio'),
    H('Idea central'), P('Una sola frase que la gente se lleve a casa.'),
    H('Desarrollo'), P('Qué dice la Palabra · Qué nos dice hoy · Qué nos pide.'),
    H('Ejemplo o historia'), P(''),
    H('Aplicación para la semana'), P(''),
    H('Notas para después'), P('Cómo la recibió la comunidad, qué cambiaría.'),
  ] },
  { key: 'radio', name: 'Guion radial', blocks: [
    H('Datos'), L('Programa:', 'Emisión (fecha y hora):', 'Duración:', 'Locución:'),
    H('Entrada'), P('CONTROL: cortina de entrada (10 s) y baja a fondo.'), P('LOCUTOR: saludo y presentación del tema.'),
    H('Bloque 1'), P(''),
    H('Pausa musical'), P('CONTROL: tema musical —título, intérprete, duración—.'),
    H('Bloque 2'), P(''),
    H('Cierre'), P('LOCUTOR: idea final y despedida.'), P('CONTROL: cortina de salida.'),
  ] },
  { key: 'merrill', name: 'Sesión de formación (Merrill)', blocks: [
    H('Nombre de la sesión'), P(''),
    L('Duración:', 'Objetivo:'),
    H('Ambientación (__ min)'), P(''),
    H('Presentación del tema (~20 min)'), P(''),
    H('Momento práctico (~30 min)'), P(''),
    H('Retroalimentación (~10 min)'), P(''),
    H('Conclusiones (~10 min)'), P(''),
    H('Recursos'), L(''),
    H('Referencias'), P('Agrega aquí bloques de «Referencia APA».'),
  ] },
  { key: 'acta', name: 'Acta de reunión', blocks: [
    L('Fecha y lugar:', 'Asistentes:', 'Moderador:'),
    H('Orden del día'), { type: 'list', data: { style: 'ordered', meta: {}, items: [{ content: '', meta: {}, items: [] }] } },
    H('Desarrollo'), P(''),
    H('Acuerdos y responsables'), C(''),
    H('Próxima reunión'), P(''),
  ] },
  { key: 'catequesis', name: 'Plan de catequesis', blocks: [
    L('Grupo:', 'Fecha:', 'Catequista:'),
    H('Objetivo'), P(''),
    H('Palabra de Dios'), B(''),
    H('Catecismo'), { type: 'magisterio', data: { doc: 'CEC', num: '', text: '' } },
    H('Momentos'), L('Oración inicial', 'Experiencia de vida', 'Iluminación', 'Compromiso', 'Oración final'),
    H('Materiales'), C(''),
  ] },
  { key: 'ficha', name: 'Ficha de lectura', blocks: [
    { type: 'referencia', data: { tipo: 'libro' } },
    H('De qué trata'), P(''),
    H('Ideas principales'), L(''),
    H('Citas que me quedaron'), P(''),
    H('Lo que me deja (pastoral, personal, académico)'), P(''),
  ] },
  { key: 'club', name: 'Sesión del club de lectura', blocks: [
    L('Libro:', 'Capítulos de la sesión:', 'Fecha:'),
    H('Preguntas para conversar'), { type: 'list', data: { style: 'ordered', meta: {}, items: [{ content: '', meta: {}, items: [] }] } },
    H('Fragmentos para leer en voz alta'), P(''),
    H('Lo que salió en la conversación'), P(''),
    H('Para la próxima sesión'), C(''),
  ] },
  { key: 'diario', name: 'Diario / examen del día', blocks: [
    H('Gracias por…'), P(''),
    H('Dónde estuvo Dios hoy'), P(''),
    H('Qué me pide para mañana'), P(''),
  ] },
];
