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
    "pick": "Set up your run",
    "pickLine": "Pick a part of the world and a game, then press Start",
    "start": "Start",
    "resume": "Resume",
    "found": "{count} found",
    "limit": "{time}",
    "count": "{n}"
  },

  "sweaty": {
    "button": "Sweaty? 🥵",
    "title": "Every accepted answer",
    "line": "Each country, and the other names and abbreviations that count for it",
    "country": "Country",
    "accepted": "Also accepted",
    "none": "—",
    "close": "Back to setup"
  },

  "options": {
    "hardcore": {
      "label": "Hardcore",
      "hint": "One misspelling or wrong country ends the run.",
      "badge": "Hardcore"
    },
    "kim": {
      "label": "Kim Mode",
      "hint": "Git Gud.",
      "badge": "Kim Mode"
    },
    "help": {
      "label": "Help Me?",
      "hint": "Skipping a country tells you its name. Great for learning!",
      "badge": "Help Me?"
    }
  },

  "header": {
    "guessLabel": "Guess a country",
    "scoreOutOf": "/ {total}",
    "skip": "Skip",
    "giveUp": "Give up",
    "reset": "Reset",
    "results": "Results"
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
    "skippedWas": "Skipped — that was {name}",
    "wrongShown": "That is a country, but not the one shown.",
    "nextComing": "Wait for the next country.",
    "hardcore": "One wrong answer ends the run.",
    "struck": "One wrong answer. You named {count} of {total}. The rest are in red.",
    "jail": "Straight to jail. You named {count} of {total}. The rest are in red."
  },

  "results": {
    "wonTitle": "Congratulations!",
    "timeTitle": "Time's up.",
    "endedTitle": "Run ended.",
    "struckTitle": "No Mercy.",
    "wonLine": "All {total} countries named, with {time} left on the clock.",
    "wonLinePick": "All {total} countries found and named, with {time} left on the clock.",
    "timeLine": "{time} on the clock, {count} named.",
    "timeLinePick": "{time} on the clock, {count} found and named.",
    "endedLine": "You stopped with {time} still on the clock.",
    "struckNotACountry": "“{guess}” is not a country on the list.",
    "struckOffRegion": "{guess} is a country, but not in {region}.",
    "struckNotClicked": "“{guess}” is not a country on the list. The one you clicked was {answer}.",
    "struckNotShown": "“{guess}” is not a country on the list. The one shown was {answer}.",
    "struckWrongCountry": "You named {guess}, but the country you clicked was {answer}.",
    "struckWrongShown": "You named {guess}, but the country shown was {answer}.",
    "struckRule": "Hardcore ends the run on the first wrong answer — this one came with {time} still on the clock.",
    "jailTitle": "Straight to Jail 🗑️",
    "jailRule": "Colonial names end the run on the spot. You went down with {time} still on the clock.",
    "ofCountries": "of {total} countries",
    "percent": "{percent}%",
    "missed": "Missed ({count})",
    "nothingMissed": "Nothing missed",
    "close": "Look at the map",
    "again": "Play again"
  },

  "share": {
    "button": "Share score",
    "copied": "Copied!",
    "failed": "Could not copy",
    "head": "🌍 Country Guesser — {mode}",
    "score": "{verdict} {count}/{total} ({percent}%) in {time}",
    "verdict": {
      "won": "🏆",
      "time": "⏰",
      "gave-up": "🏳️",
      "struck": "💀",
      "jail": "🗑️"
    },
    "region": "{bar} {region} {got}/{total}",
    "filled": "🟩",
    "empty": "⬜"
  },

  "jail": {
    "lines": {
      "upper-volta": "Upper Volta has been dead for {years} years — Thomas Sankara tore up the French colonial label and named his country Burkina Faso, “land of upright people”.",
      "northern-rhodesia": "Northern Rhodesia was named after Cecil Rhodes, a diamond baron who carved up Africa for profit, and Zambia threw his name in the bin {years} years ago.",
      "rhodesia": "Rhodesia was a white-minority regime that not one country on Earth recognised, and it has been Zimbabwe for {years} years.",
      "republic-of-china": "The UN showed the “Republic of China” the door {years} years ago, and Taiwan has spent decades shrugging off the name of a regime that arrived from the mainland and ruled the island under martial law for 38 years.",
      "byelorussia": "Byelorussia is the Russified spelling Moscow stamped on its colony, and Belarus scrapped it {years} years ago.",
      "ussr": "The USSR collapsed {years} years ago and fifteen nations walked out the same year.",
      "british-honduras": "British Honduras was a logging camp the Crown ran on the backs of enslaved Africans, and it has been Belize for {years} years.",
      "british-guiana": "British Guiana was a sugar plantation with a flag, worked first by the enslaved and then by the indentured, and it has been Guyana for {years} years.",
      "dutch-guiana": "Dutch Guiana was a plantation colony the Dutch valued over Manhattan, built on some of the most brutal slavery in the Americas, and it has been Suriname for {years} years.",
      "new-hebrides": "The New Hebrides were run jointly by Britain and France so badly the locals called it “the Pandemonium”, and Vanuatu threw both empires out {years} years ago."
    }
  }
};
