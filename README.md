# GO MetaHub

Guía personal del meta de Pokémon GO, en español. Es una aplicación web instalable (PWA), sin servidor y pensada para
el móvil, que se mantiene al día consultando fuentes de la comunidad.

**Abrir:** https://ismaeldmsdev.github.io/go-metahub/

## Qué incluye

- **PvP:** clasificaciones completas de Liga Super, Ultra y Máster, con tiers, movimientos, buscador y filtros.
- **Incursiones:** jefes listados actualmente, PC, tipos, vigencia conocida y debilidades. Al abrir un jefe, sus mejores
  counters con movimientos, Estimator, eDPS y TDO. Enlaces a los mejores atacantes de cada tipo.
- **Eventos:** activos, próximos y sin fecha confirmada, en hora peninsular y con cuenta atrás.
- **Fuentes:** cuándo se consultó cada una, cuándo publicó y cuándo cambió de verdad.

## Cómo se mantiene al día

- PvP, traducciones y lista de imágenes cada 24 horas. Incursiones, eventos y lista de jefes de Pokébattler cada 6 horas.
- Los counters se piden solo al abrir un jefe y se guardan 24 horas por jefe y clima.
- Se comprueba al abrir, al volver a primer plano y cada minuto con la aplicación visible.
- Toda descarga se valida. Si falla, se conservan los últimos datos válidos y se avisa.
- Los datos se guardan en IndexedDB. El service worker guarda la aplicación y las imágenes ya vistas, con límite.

## Tiers PvP

Son categorías propias sobre la puntuación original de PvPoke, **no oficiales**: S desde 90, A desde 85, B desde 80 y
C desde 70. El puesto, la puntuación y los movimientos son los de PvPoke, sin recalcular.

## Fuentes y créditos

| Contenido | Fuente | Condiciones |
|---|---|---|
| Clasificaciones PvP | [PvPoke](https://github.com/pvpoke/pvpoke) | MIT, © 2019 pvpoke |
| Incursiones y eventos | [LeekDuck](https://leekduck.com), a través de [ScrapedDuck](https://github.com/bigfoott/ScrapedDuck) | Sin anuncios ni pago, con atribución |
| Counters de incursiones | [Pokébattler](https://www.pokebattler.com/developers) | API pública: con atribución, caché y uso ocasional |
| Nombres en español | [WatWowMap/pogo-translations](https://github.com/WatWowMap/pogo-translations) | Textos de sus titulares |
| Lista de formas | [PokéAPI](https://github.com/PokeAPI/pokeapi) | BSD-3-Clause |
| Ilustraciones y sprites | [PokeAPI/sprites](https://github.com/PokeAPI/sprites) | Imágenes © The Pokémon Company |

Las imágenes no se incluyen en este repositorio: se cargan desde su origen al verlas.

Las copias de datos de `tests/fixtures` proceden de esas mismas fuentes, se tomaron el 23 de noviembre de 2026 y solo
se usan en las pruebas. Las de Pokébattler son sintéticas.

Proyecto personal sin ánimo de lucro, no afiliado a Niantic, Scopely, Nintendo ni The Pokémon Company. Pokémon y sus
nombres e imágenes pertenecen a sus titulares.

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
| `tests` | Pruebas |
