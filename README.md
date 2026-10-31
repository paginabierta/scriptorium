# Scriptorium

Tu cuaderno de pastoral, teología, psicología, estudio, lectura y escritura. Funciona en el computador, la tablet y el teléfono, sin conexión, y guarda una copia en tu Google Drive.

## Qué trae la Fase 1

- **Espacios editables:** puedes renombrarlos, cambiarles el color, reordenarlos, archivarlos, unirlos y crear nuevos.
- **Notas por bloques:** texto, títulos, listas, casillas, citas y separadores.
- **Organización:** subpáginas, etiquetas y buscador.
- **Hoy:** saludo, tiempo litúrgico, pendientes sacados de las casillas de tus notas, notas recientes y tus espacios.
- **Seguridad de tus datos:** papelera para recuperar notas y copia de seguridad descargable.
- **Sin conexión y sincronizada:** funciona sin internet y se sincroniza con Google Drive (carpeta «Scriptorium»).

## Publicar en GitHub Pages

1. Sube todo el contenido de esta carpeta a la raíz del repositorio `scriptorium`.
2. En el repositorio ve a *Settings → Pages*. En *Source* elige la rama `main` y la carpeta `/ (root)`, y guarda.
3. En un par de minutos la app queda en `https://TU-CUENTA.github.io/scriptorium/`.

## Conectar Google Drive

1. Abre `js/config.js` y pega tu ID de cliente entre las comillas de `GOOGLE_CLIENT_ID`.
2. En Google Cloud, el ID de cliente debe tener `https://TU-CUENTA.github.io` como origen de JavaScript autorizado.
3. Sube el cambio. Luego, en la app, ve a *Ajustes → Conectar con Google*.

Cada vez que publiques cambios, sube el número de `VERSION` en `sw.js`. Así los aparatos descargan la versión nueva.

## Instalar en cada aparato

- **Computador (Chrome o Edge):** usa el ícono de instalar en la barra de direcciones.
- **Android:** en el menú ⋮ de Chrome, elige *Agregar a la pantalla principal* o *Instalar app*.
- **iPad o iPhone:** en Safari, toca *Compartir → Agregar a inicio*.

## Créditos

El editor por bloques usa Editor.js (Apache-2.0) y sus complementos (MIT), incluidos en `vendor/`.
