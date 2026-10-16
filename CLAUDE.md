# Working agreements

- **Files the user refers to live in this working directory.** Screenshots,
  notes and any other material mentioned in a request (e.g.
  `off_map_labels.png`) are here — look here, don't go searching the rest of
  the filesystem.
- `Remaining_Work.md` is the user's file. Read it for the backlog and playtest
  notes; never edit it.
- Map geometry is generated. After changing `build/countries_table.py` or
  `build/build_map.py`, rebuild with:
  `python3 build/build_map.py build/countries-50m.json data/mapdata.js`
