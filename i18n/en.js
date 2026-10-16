/* English UI text - the only file in the project with user-facing wording.
 *
 * Shipped as JS rather than .json for the same reason data/mapdata.js is:
 * index.html has to work when it is opened straight off the disk, and no
 * browser will fetch a file:// URL. Everything after the assignment is
 * plain JSON, so it lifts straight into en.json if this ever gets served
 * over HTTP. To add a language, copy this file and swap the script tag.
 *
 * {token} is filled in at run time. Continent and country names are not
 * here: they come from the map data, built by build/build_map.py.
 */
window.STRINGS = {
  "lang": "en",
  "title": "Country Guesser",

  "modes": {
    "normal": {
      "title": "Full Globe - Normal",
      "headline": "Name all {total} countries",
      "placeholder": "Type a country name…",
      "hint": "Correct guesses light up."
    },
    "hard": {
      "title": "Full Globe - Hard",
      "headline": "Find and name all {total} countries",
      "placeholder": "Click a country, then name it…",
      "hint": "Click a country then type its name."
    }
  },

  "header": {
    "game": "Game",
    "guessLabel": "Guess a country",
    "scoreOutOf": "/ {total}",
    "giveUp": "Give up",
    "reset": "Reset"
  },

  "map": {
    "label": "World map. Guessed countries are filled.",
    "zoomIn": "Zoom in",
    "zoomOut": "Zoom out",
    "zoomFit": "Whole world",
    "zoomLevel": "{zoom}×",
    "found": "✓ {name}",
    "showMe": "Show me"
  },

  "panel": {
    "continents": "Continents",
    "note": "Click a continent to fly there. Scroll or pinch to zoom, drag to pan.",
    "stillMissing": "Still missing",
    "count": "{got} / {total}",
    "regionCount": "{region} ({count})"
  },

  "hint": {
    "keepGoing": "Keep going.",
    "holdFor": "Press Enter for {name}, or keep typing.",
    "alreadyFound": "Already found {name}.",
    "notOnList": "Not a country on the list — or already found.",
    "restored": "Restored — {count} found.",
    "regionComplete": "{region} complete — all {count}.",
    "won": "All {total}, with {time} to spare.",
    "timeUp": "Time. You named {count} of {total}.",
    "gaveUp": "You named {count} of {total}. The rest are in red.",
    "nameIt": "Name the highlighted country, then press Enter.",
    "clickFirst": "Click a country on the map first, then name it.",
    "enterToName": "Press Enter to name it, or keep typing.",
    "wrongCountry": "That is a country, but not the one you clicked.",
    "notACountry": "Not a country on the list.",
    "pickDropped": "Deselected. Click another country.",
    "gotIt": "Got it — pick another."
  },

  "results": {
    "wonTitle": "Congratulations!",
    "timeTitle": "Time's up.",
    "endedTitle": "Run ended.",
    "wonLine": "All {total} countries named, with {time} left on the clock.",
    "wonLinePick": "All {total} countries found and named, with {time} left on the clock.",
    "timeLine": "{minutes} minutes, {count} named.",
    "timeLinePick": "{minutes} minutes, {count} found and named.",
    "endedLine": "You stopped with {time} still on the clock.",
    "ofCountries": "of {total} countries",
    "percent": "{percent}%",
    "missed": "Missed ({count})",
    "nothingMissed": "Nothing missed",
    "close": "Look at the map",
    "again": "Play again"
  }
};
