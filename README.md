# GO MetaHub

Guía personal del meta de Pokémon GO, en español. Es una aplicación web instalable (PWA), sin servidor y pensada para
el móvil, que se mantiene al día consultando fuentes de la comunidad.

**Abrir:** https://ismaeldmsdev.github.io/go-metahub/

[![Datos de gimnasios](https://github.com/ismaeldmsdev/go-metahub/actions/workflows/gimnasios.yml/badge.svg)](https://github.com/ismaeldmsdev/go-metahub/actions/workflows/gimnasios.yml)

## Qué incluye

- **PvP:** clasificaciones completas de Liga Super, Ultra y Máster, con tiers, movimientos, buscador y filtros; rankings
  propios de las ligas Mega y de las copas, con calendario y restricciones.
- **Incursiones:** qué hay **ahora** (con su fecha de fin), lo **próximo** y lo anunciado sin confirmar; PC, tipos y
  debilidades. Al abrir un jefe, sus mejores counters con movimientos, Estimator, eDPS y TDO. Atacantes por cada uno de los
  18 tipos.
- **Combates Max:** jefes con fecha anunciada, catálogo sin fecha, counters por jefe, fichas con estadísticas base y enlaces
  por papel.
- **Gimnasios:** atacantes con el tier, el percentil y los movimientos que publica doctorpokegogo, con filtros; y
  defensores ordenados por resistencia teórica, con sus debilidades.
- **Eventos:** activos, próximos y sin fecha confirmada, en hora peninsular y con cuenta atrás.
- **Team GO Rocket:** alineaciones actuales de Giovanni, los líderes y los reclutas, con sus frases; debilidades de cada
  Pokémon, opciones con ventaja de tipo y los mejores atacantes generales según doctorpokegogo.
- **Fuentes:** cuándo se consultó cada una, cuándo publicó y cuándo cambió de verdad.

## Cómo se mantiene al día

- PvP, traducciones y lista de imágenes cada 24 horas. Incursiones, eventos, calendario de la Liga Combates GO, alineaciones
  de Rocket y lista de jefes de Pokébattler cada 6 horas.
- Los counters se piden solo al abrir un jefe, y los rankings de copas y ligas Mega al abrirlos. Se guardan 24 horas.
- Se comprueba al abrir, al volver a primer plano y cada minuto con la aplicación visible.
- Toda descarga se valida. Si falla, se conservan los últimos datos válidos y se avisa.
- Los datos se guardan en IndexedDB. El service worker guarda la aplicación y las imágenes ya vistas, con límite.

## Tiers PvP

Son categorías propias sobre la puntuación original de PvPoke, **no oficiales**: S desde 90, A desde 85, B desde 80 y
C desde 70. El puesto, la puntuación y los movimientos son los de PvPoke, sin recalcular.

## Copas y ligas Mega

- El calendario es el de LeekDuck, en hora peninsular. A veces deja de listar la semana en curso: si ya se conocía, se conserva
  hasta que termina.
- Cada liga o copa se empareja con el formato de PvPoke por su nombre y su límite de PC, sin contar los años. Si no hay una
  coincidencia exacta y visible, se muestra su información **sin ranking**: nunca el de otra.
- Puesto, puntuación y movimientos son los de PvPoke, **sin tiers**. Las restricciones salen de sus filtros; si difieren,
  manda la página oficial, que va enlazada.

## Incursiones por tipo

- Datos originales de doctorpokegogo. Hay **una sola combinación por Pokémon**, así que cada uno sale únicamente en el tipo de ese
  ataque: **no es un ranking completo**. Sin puestos; por el percentil de la fuente. Se enlaza a listas externas completas.
- `npm run incursiones` genera [`public/data/incursiones.json`](public/data/incursiones.json) (unos 50 KB comprimido), en la
  misma tarea diaria que los de Rocket.

## Qué incursiones hay ahora

- Se cruzan la lista de jefes de LeekDuck (vía ScrapedDuck, sin fechas), su [calendario de incursiones](https://leekduck.com/raids/manifest.json)
  con hora local y los jefes del periodo en curso, y las rotaciones de cada jefe con el resumen de su página.
- **Ahora** solo incluye lo que respalda una rotación o el periodo en curso, con su fecha de fin. Lo que solo está en la
  lista queda como «sin fecha de fin».
- Si el anuncio dice expresamente «every weekend», solo se muestra disponible el sábado y el domingo (hora peninsular).
  No se suponen otras condiciones; si el texto limita los días de otra forma, se avisa sin confirmar.
- Lo que una rotación anuncia y no está en la lista va aparte, «Anunciado, sin confirmar», con el motivo. Si la lista es
  anterior a un cambio del calendario, lo que ya nada respalda pasa a «Puede que ya no estén».
- Sin calendario, nada que dependa de una rotación se confirma. Con la lista sin comprobar más de 12 horas, se conserva
  sin darla por confirmada.
- Las páginas de LeekDuck se leen desde el dispositivo (admiten CORS): como máximo 4 periodos y 12 eventos cada 6 horas o
  en cada cambio de periodo. Sus fechas sustituyen a las de ScrapedDuck cuando este las pierde.
- Los disfraces (por ejemplo, «Pikachu con corona de sol») llevan su nombre oficial en español solo si está en la tabla de
  [`names.ts`](src/domain/names.ts), tomada del anuncio oficial; si no, se muestra el original.

## Combates Max

- **Confirmados** y **anunciados** son solo los eventos Max de LeekDuck con principio y fin. El **catálogo** es el de Pokébattler,
  que no indica fechas: figurar en él no significa estar activo.
- Los counters usan la misma API documentada que las incursiones, ordenados por Estimator. **No separan papeles**: para eso se
  enlaza a las páginas de Pokébattler.
- Las fichas muestran estadísticas base de PvPoke. **No son un ranking** de atacantes, tanques ni apoyo.

## Gimnasios

- **Atacantes:** datos originales de doctorpokegogo, sin recalcular y sin orden global: su puntuación depende del defensor
  de referencia de cada tipo. Los empates de percentil se presentan juntos, por tipo
  de ataque. Hay un solo conjunto de movimientos por Pokémon.
- **Defensores:** resistencia = defensa base × aguante base. No es una simulación: no cuenta movimientos, motivación ni
  enfrentamientos. Los oscuros pueden defender, pero no llevan ficha propia: la fuente no distingue su resistencia. Las
  exclusiones y su origen están en [`scripts/gyms.ts`](scripts/gyms.ts) y en la propia aplicación.
- `npm run gimnasios` descarga el dataset (7,6 MB), lo valida y genera
  [`public/data/gimnasios.json`](public/data/gimnasios.json), el único que descarga el móvil (unos 45 KB comprimido). Solo
  se aceptan las fichas cuyo número, forma, tipos y estadísticas coinciden con los de PvPoke. Si algo no cuadra, el
  archivo no cambia. Con `-- --comprobar` no escribe nada.
- [`gimnasios.yml`](.github/workflows/gimnasios.yml) lo hace cada día a las 05:20 UTC. Solo hay commit y publicación si los
  datos cambian, pasan todas las pruebas y la variable `GIMNASIOS_AUTOMATICO` vale `si` (Settings › Secrets and variables ›
  Actions › Variables); al borrarla, sigue comprobando sin publicar. Si algo falla, se conserva lo publicado y GitHub avisa
  por correo. Se detiene en Actions › Datos de gimnasios › Disable workflow. Tras 60 días sin actividad en el repositorio,
  GitHub la desactiva; se reactiva con Enable workflow, en la misma página.

## Team GO Rocket

- **Alineaciones:** se leen de WatWowMap desde el propio dispositivo, sin volver a publicar la aplicación, y se contrastan
  con LeekDuck. Si no coinciden, se avisa y se muestra lo que dice cada una. Solo se comparan especie y región.
- **Frases:** las del juego en español, de WatWowMap/pogo-translations. Se enlazan por el número de cada entrenador. Si no hay
  traducción, no se muestran. No se copian a este repositorio: las de las pruebas son inventadas.
- **Atacantes generales:** tier, puntuación y movimientos originales de doctorpokegogo, sin puestos. Valoran a cada Pokémon
  contra el Team GO Rocket en conjunto, **no contra un rival concreto**.
- **Opciones con ventaja de tipo:** selección de GO MetaHub, **no son counters exactos ni una simulación**. Entran los de tier
  general S+, S o A con ataque cargado eficaz, rápido no resistido y sin debilidad a los tipos del rival. No se consideran los
  escudos, la resistencia, los ataques del rival ni el equipo. Se ven primero unas pocas especies. Con menos de tres especies, o si no se conocen los tipos del rival, no se sugiere nada.
- `npm run rocket` genera [`public/data/rocket.json`](public/data/rocket.json) (unos 30 KB comprimido) con las mismas
  comprobaciones que el de gimnasios. [`rocket.yml`](.github/workflows/rocket.yml) lo hace cada día a las 05:50 UTC y solo
  publica si cambian los datos y la variable `ROCKET_AUTOMATICO` vale `si`. Un cambio de fecha sin cambios de contenido no se
  publica hasta pasados 30 días.

## Fuentes y créditos

| Contenido | Fuente | Condiciones |
|---|---|---|
| Clasificaciones PvP, copas y estadísticas base | [PvPoke](https://github.com/pvpoke/pvpoke) | MIT, © 2019 pvpoke |
| Incursiones, eventos y calendario PvP | [LeekDuck](https://leekduck.com), a través de [ScrapedDuck](https://github.com/bigfoott/ScrapedDuck) | Sin anuncios ni pago, con atribución |
| Calendario de incursiones y páginas de eventos | [LeekDuck](https://leekduck.com/raid-bosses/), leído desde el dispositivo | Sin anuncios ni pago, con atribución |
| Counters de incursiones y Max, catálogo Max | [Pokébattler](https://www.pokebattler.com/developers) | API pública: con atribución, caché y uso ocasional |
| Gimnasios e incursiones por tipo | [doctorpokegogo.com](https://doctorpokegogo.com/) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); datos transformados y resumidos por GO MetaHub |
| Alineaciones de Rocket | [WatWowMap/event-info](https://github.com/WatWowMap/event-info) | [MIT](https://github.com/WatWowMap/event-info/blob/main/LICENSE), © 2022 WatWowMap |
| Contraste de Rocket | [LeekDuck](https://leekduck.com/rocket-lineups/), a través de [ScrapedDuck](https://github.com/bigfoott/ScrapedDuck) | Sin anuncios ni pago, con atribución |
| Atacantes para Rocket | [doctorpokegogo.com](https://doctorpokegogo.com/) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); datos transformados y resumidos por GO MetaHub |
| Nombres y frases en español | [WatWowMap/pogo-translations](https://github.com/WatWowMap/pogo-translations) | ISC según su `package.json`; textos de sus titulares |
| Lista de formas | [PokéAPI](https://github.com/PokeAPI/pokeapi) | BSD-3-Clause |
| Ilustraciones y sprites | [PokeAPI/sprites](https://github.com/PokeAPI/sprites) | Imágenes © The Pokémon Company |

Las imágenes no se incluyen en este repositorio: se cargan desde su origen al verlas.

Las copias de datos de `tests/fixtures` proceden de esas mismas fuentes, se tomaron el 23 de noviembre de 2026 y solo
se usan en las pruebas. Las de gimnasios son del 22 de noviembre y están recortadas. Las de Pokébattler son sintéticas.
Las de Rocket, copas e incursiones por tipo son del 25 de noviembre, con frases inventadas.

Proyecto personal sin ánimo de lucro, no afiliado a Niantic, Scopely, Nintendo ni The Pokémon Company. Pokémon y sus
nombres, imágenes y frases pertenecen a sus titulares.

## Desarrollo

```
npm ci
npm run dev         # desarrollo
npm run build       # compilación de producción
npm run preview     # http://localhost:4173
```

| Orden | Qué comprueba |
|---|---|
| `npm test` | Lógica, con copias reales de las fuentes |
| `npm run build` y `npm run test:e2e` | Navegación, adaptación y modo sin conexión, con Microsoft Edge |
| `npm run test:live` | Que las fuentes reales conservan su estructura |

Cada cambio en `main` se prueba, se compila y se publica en GitHub Pages mediante
[`.github/workflows/pages.yml`](.github/workflows/pages.yml).

| Carpeta | Contenido |
|---|---|
| `src/data` | Direcciones, descarga, validación, guardado y sincronización |
| `src/domain` | Reglas sin interfaz: fechas, vigencia, tiers, nombres, imágenes y enlaces |
| `src/ui` | Pantallas |
| `scripts` | Generación y validación de los datos de gimnasios, de incursiones y de los atacantes para Rocket |
| `tests` | Pruebas |
