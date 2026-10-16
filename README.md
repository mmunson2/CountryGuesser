# Country Guesser

## Run it

A static page with no dependencies and no build step.

    git clone https://github.com/mmunson2/CountryGuesser.git
    cd CountryGuesser
    open index.html

Or serve it over HTTP:

    python3 -m http.server 8000     # then visit http://localhost:8000

## Rebuild the map data

Only needed after editing `build/countries_table.py` or `build/build_map.py`.
Requires Python 3; standard library only.

    python3 build/build_map.py build/countries-50m.json data/mapdata.js
