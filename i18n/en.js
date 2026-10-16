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
  "world": "Full Globe",

  "modes": {
    "normal": {
      "title": "List All - Normal",
      "headline": "Name all {total} countries",
      "placeholder": "Type a country name…",
      "hint": "Correct guesses light up."
    },
    "hard": {
      "title": "Find All - Hard",
      "headline": "Find and name all {total} countries",
      "placeholder": "Click a country, then name it…",
      "hint": "Click a country then type its name."
    },
    "name-that-country": {
      "title": "Name That Country",
      "headline": "Name all {total} countries, one at a time",
      "placeholder": "Name the country shown…",
      "hint": "Name the country lit up on the map."
    }
  },

  "splash": {
    "ready": "Get ready",
    "pick": "Set up your run",
    "pickLine": "Pick a part of the world, then a game. The clock starts after a count of three.",
    "start": "Start",
    "resume": "Resume",
    "found": "{count} found",
    "limit": "{time}",
    "count": "{n}"
  },

  "header": {
    "guessLabel": "Guess a country",
    "scoreOutOf": "/ {total}",
    "skip": "Skip",
    "giveUp": "Give up",
    "reset": "Reset"
  },

  "map": {
    "label": "World map. Guessed countries are filled.",
    "zoomIn": "Zoom in",
    "zoomOut": "Zoom out",
    "zoomFit": "Whole world",
    "zoomRegion": "Back to {region}",
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
    "offRegion": "{name} is not in {region}.",
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
    "gotIt": "Got it — pick another.",
    "skipped": "Skipped — it comes back!",
    "wrongShown": "That is a country, but not the one shown.",
    "nextComing": "Wait for the next country."
  },

  "results": {
    "wonTitle": "Congratulations!",
    "timeTitle": "Time's up.",
    "endedTitle": "Run ended.",
    "wonLine": "All {total} countries named, with {time} left on the clock.",
    "wonLinePick": "All {total} countries found and named, with {time} left on the clock.",
    "timeLine": "{time} on the clock, {count} named.",
    "timeLinePick": "{time} on the clock, {count} found and named.",
    "endedLine": "You stopped with {time} still on the clock.",
    "ofCountries": "of {total} countries",
    "percent": "{percent}%",
    "missed": "Missed ({count})",
    "nothingMissed": "Nothing missed",
    "close": "Look at the map",
    "again": "Play again"
  }
};
