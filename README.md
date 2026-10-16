# Country Guesser

Name all 197 countries on a world map against a 15 minute clock. Everything
still unguessed carries a yellow question mark; type a name and that country
pops, fills with its continent's colour and takes a label. Everything runs client
side — open `index.html` in a browser and play. No build step, no network.

    open index.html                 # or: python3 -m http.server, then visit it

## Layout

    index.html           markup
    css/styles.css       dark theme, with a light one via prefers-color-scheme
    js/app.js            the whole app: rendering, zoom, guessing, scoring
    data/mapdata.js      generated - pre-projected SVG paths + the answer list
    build/build_map.py   generates data/mapdata.js
    build/countries_table.py   the 197 countries, their regions and aliases
    build/countries-50m.json   source geometry (Natural Earth 1:50m)

## Rebuilding the map data

    python3 build/build_map.py build/countries-50m.json data/mapdata.js

The browser gets no mapping library. The build projects Natural Earth geometry
with **Equal Earth** (equal-area, so no country looks bigger than it is), bakes
the result into SVG path strings, and the page just moves a viewBox around.
`data/mapdata.js` is ~400 KB and sets `window.MAP_DATA`; because it is a plain
script rather than a fetch, the game works straight off `file://`.

Source geometry is [world-atlas](https://github.com/topojson/world-atlas)
`countries-50m.json`, derived from Natural Earth, public domain.

## How the map is put together

**The 197.** 193 UN members plus Vatican City, Palestine, Taiwan and Kosovo.
`build/countries_table.py` is the single source of truth: each row carries the
Natural Earth feature name, the display name, a continent, and any extra
accepted answers (USA, Holland, Burma, Ivory Coast, DRC, Swaziland, Zaire...).

**Continents are kept separate** all the way through: each country has a
`region`, each region is its own `<g data-region="...">` in the SVG and its own
row in the sidebar, and `views` holds a framing box per continent. Regional
quizzes only need a filter on top of this, not new data.

Transcontinental countries are each in exactly one region, so the six add up to
197: Russia and Cyprus count as Europe, Turkey and the Caucasus as Asia.

**Non-countries are inert.** Greenland, Puerto Rico, Western Sahara, Antarctica
and the rest are drawn in flat grey; they are not answers and never label.
Somaliland, Northern Cyprus, Hong Kong and Macao are merged into the country
that administers them, so one guess fills the whole shape.

**The date line.** Natural Earth cuts land at +-180, which leaves rings that
jump from 179.9 to -179.9; drawn naively, Fiji smears a stripe across the
Atlantic. The build splits rings at that jump, then draws the Pacific a second
time east of 180 — ocean, islands and all — so Oceania can be framed in one
piece instead of being torn in half.

That continuation is its own layer (`frameEast`, `territoriesEast`, each
country's `d2`), marked `.east` in the SVG and hidden by `#map.no-east`
whenever the view does not actually reach past 180. Otherwise it squares off
the right edge of the world view, and its labels float in the void beyond the
globe. Only Pacific countries earn a copy — wrapping Hawaii and Chukotka too
just parked a stray "United States" out in the ocean — and of a country's two
anchors only the one nearest the middle of the view is ever labelled, so no
name appears twice.

**The pop.** A correct guess swells the country by a roughly fixed number of
screen pixels rather than by a flat percentage, so the United States does not
heave across the Atlantic while Monaco barely twitches, and it scales about
the country's own middle rather than the centre of its bounding box — for the
United States that box runs from Hawaii to Wake Island, so scaling about it
slid the country sideways. Outlying islands are capped so they cannot drift
far. `POP_PIXELS`, `POP_MAX` and `POP_DRIFT` in `js/app.js` tune it.

**Small countries.** Anything too thin to see at the current zoom gets a
locator dot, which disappears as you zoom in and the shape becomes visible.
Labels are placed at each country's pole of inaccessibility (so they sit inside
Norway and Chile rather than in the sea), and collide-checked largest first:
zoom in and the small ones appear as room opens up. Zoom goes to 600x, enough
to look at Vatican City.

## Playing

- 15 minutes on the clock, counting down. It starts on your first keystroke.
- Type a name; it is accepted as soon as it matches, no Enter needed.
- Names that are a prefix of another country (Niger/Nigeria,
  Dominica/Dominican Republic, Guinea/Guinea-Bissau, Congo/DR Congo) wait a
  beat, or Enter to take the short one. Typing straight on into the next
  country still banks the held one.
- Scroll or pinch to zoom, drag to pan, double-click to zoom in; `+`, `-` and
  `0` work when the text box is not focused. Click a continent to fly there.
- Hovering a country you have already earned names it.
- Finishing, running out of time, or giving up brings up the results: score
  and percentage, a per-continent breakdown, and everything you missed. Name all 197 and you
  get fireworks.
- Progress is saved in localStorage, so a refresh does not lose the run.
- Motion (the pop, the fireworks) is skipped under `prefers-reduced-motion`.

## Console handle

`window.CountryGuesser` exposes `countries`, `score`, `view`, `guess(name)`,
`showRegion(name, ms)`, `showCountry(id, ms)`, `viewForBox`, `flyTo`, `reveal`
and `reset` — handy for driving the map from whatever comes next.

## Still to come

See `Remaining_Work.md`. The separate per-continent games are the open item;
the data is already grouped by region and each one has a saved framing box, so
that is a mode on top of what is here rather than new map work.
