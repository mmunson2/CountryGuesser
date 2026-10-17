# -*- coding: utf-8 -*-
"""Turn world-atlas TopoJSON into a ready-to-draw SVG data file for the quiz.

    python3 build/build_map.py build/countries-50m.json data/mapdata.js

The Equal Earth projection is baked in at build time, so the browser needs no
mapping library: it only draws path strings and moves a viewBox.

Land that sits just east of the antimeridian (Samoa, Tonga, eastern Fiji) is
*also* emitted at lon + 360, past the right edge of the map, so Oceania can be
framed as one region instead of being torn in half by the date line.
"""
import json
import math
import sys
import unicodedata

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from countries_table import (COUNTRIES, JAIL, MERGE_INTO,  # noqa: E402
                             OCEANIA, OUTDATED, POINT_ONLY)

WIDTH = 1000.0          # map width in SVG user units
PRECISION = 1           # decimals kept in path data
SIMPLIFY = 0.12         # Douglas-Peucker tolerance, in SVG user units
SPECK = 0.02            # drop projected polygons smaller than this
MIN_IR = 0.05           # floor for the stored inradius
WRAP_LON = -150.0       # land entirely west of this is redrawn east of 180 deg
EAST_EDGE = 207.0       # the ocean runs this far past 180, under the wrapped land
LOBE_X, LOBE_Y = 0.10, 0.16   # zoom-to-country ignores far-flung islands

# Framing for "zoom to continent", as (lon0, lat0, lon1, lat1) windows.
# Oceania runs past 180 on purpose: it is framed over the wrapped copies.
REGION_WINDOWS = {
    "Africa": (-21, -37, 56, 39),
    "Asia": (24, -12, 151, 57),
    "Europe": (-27, 33, 43, 72),
    "North America": (-172, 5, -50, 74),
    "South America": (-84, -57, -33, 14),
    "Oceania": (112, -48, 206, 19),
}


# --------------------------------------------------------------- projection
A1, A2, A3, A4 = 1.340264, -0.081106, 0.000893, 0.003796
_SQRT3_2 = math.sqrt(3) / 2


def equal_earth(lon, lat):
    """Equal Earth projection -> (x, y) in projection units, y up."""
    lam = math.radians(lon)
    phi = math.radians(max(-90.0, min(90.0, lat)))
    theta = math.asin(_SQRT3_2 * math.sin(phi))
    t2 = theta * theta
    t6 = t2 * t2 * t2
    x = lam * math.cos(theta) / (_SQRT3_2 * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)))
    y = theta * (A1 + A2 * t2 + t6 * (A3 + A4 * t2))
    return x, y


SCALE = WIDTH / (2 * equal_earth(180, 0)[0])
HEIGHT = round(2 * equal_earth(0, 90)[1] * SCALE, 2)


def project(lon, lat):
    """Geographic -> SVG coordinates (y down, origin top-left)."""
    x, y = equal_earth(lon, lat)
    return (x * SCALE + WIDTH / 2, HEIGHT / 2 - y * SCALE)


# ------------------------------------------------------------------ topojson
def load_topology(path):
    topo = json.load(open(path, encoding="utf-8"))
    sx, sy = topo["transform"]["scale"]
    tx, ty = topo["transform"]["translate"]
    arcs = []
    for arc in topo["arcs"]:
        x = y = 0
        pts = []
        for dx, dy in arc:
            x += dx
            y += dy
            pts.append((x * sx + tx, y * sy + ty))
        arcs.append(pts)
    return topo, arcs


def ring_coords(arc_indexes, arcs):
    pts = []
    for i in arc_indexes:
        seq = arcs[~i][::-1] if i < 0 else arcs[i]
        pts.extend(seq[1:] if pts else seq)
    return pts


def polygons_of(geom, arcs):
    """Feature -> list of polygons, each a list of rings in lon/lat."""
    if geom["type"] == "Polygon":
        raw = [geom["arcs"]]
    elif geom["type"] == "MultiPolygon":
        raw = geom["arcs"]
    else:
        return []
    return [[ring_coords(r, arcs) for r in poly] for poly in raw]


# ------------------------------------------------------------- date line
def split_dateline(ring):
    """Break a ring wherever it jumps across the antimeridian.

    Natural Earth cuts land at +-180, which leaves rings that step straight
    from 179.9 to -179.9. Projected as one ring, that smears a stripe right
    across the map (Fiji drew a band through the Atlantic; Russia drew one
    over Canada). Each piece stays on one side and is closed on its own.
    """
    pieces = [[ring[0]]]
    for previous, point in zip(ring, ring[1:]):
        if abs(point[0] - previous[0]) > 180:
            pieces.append([point])
        else:
            pieces[-1].append(point)
    if len(pieces) > 1 and abs(pieces[0][0][0] - pieces[-1][-1][0]) <= 180:
        pieces[0] = pieces[-1] + pieces[0]       # the ring closed mid-piece
        pieces.pop()
    return [piece for piece in pieces if len(piece) >= 3]


def shift_polygon(rings, by):
    return [[(lon + by, lat) for lon, lat in ring] for ring in rings]


def expand(polygons, wrap=True):
    """Split polygons at the date line and decide where to draw each piece.

    Returns (inside, outside, west_only): polygons in lon/lat, already shifted,
    split by whether they land on the map proper or past its right edge.

    `wrap=False` keeps a country out of the strip east of 180 entirely. Only
    Pacific countries earn a copy there; drawing Hawaii or Chukotka twice just
    put a stray "United States" label out in the ocean.
    """
    split = []
    for rings in polygons:
        outers = split_dateline(rings[0])
        if len(outers) == 1:
            holes = [h for ring in rings[1:] for h in split_dateline(ring)]
            split.append([outers[0]] + holes)
        else:
            split += [[outer] for outer in outers]   # holes cannot straddle

    inside, outside, west_only = [], [], bool(split)
    for rings in split:
        lons = [p[0] for p in rings[0]]
        shifts = [0.0]
        if max(lons) < WRAP_LON:
            if wrap:
                shifts.append(360.0)    # far west: also draw it east of 180
        else:
            west_only = False
        for by in shifts:
            moved = shift_polygon(rings, by) if by else rings
            outer = moved[0]
            # Classify by longitude, not by x: Equal Earth narrows towards the
            # poles, so the map's right edge is only at x == WIDTH on the equator.
            beyond = sum(lon for lon, _lat in outer) / len(outer) > 180
            (outside if beyond else inside).append(moved)
    return inside, outside, west_only


# ------------------------------------------------------------------ geometry
def simplify(points, tol):
    """Douglas-Peucker, iterative so deep rings cannot blow the stack."""
    if len(points) < 3 or tol <= 0:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    tol2 = tol * tol
    while stack:
        lo, hi = stack.pop()
        if hi <= lo + 1:
            continue
        ax, ay = points[lo]
        bx, by = points[hi]
        dx, dy = bx - ax, by - ay
        span = dx * dx + dy * dy
        worst, wi = -1.0, lo
        for i in range(lo + 1, hi):
            px, py = points[i]
            if span == 0:
                d2 = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = ((px - ax) * dx + (py - ay) * dy) / span
                t = 0.0 if t < 0 else (1.0 if t > 1 else t)
                d2 = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
            if d2 > worst:
                worst, wi = d2, i
        if worst > tol2:
            keep[wi] = True
            stack.append((lo, wi))
            stack.append((wi, hi))
    return [p for p, k in zip(points, keep) if k]


def signed_area(ring):
    total = 0.0
    for i in range(len(ring)):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % len(ring)]
        total += x1 * y2 - x2 * y1
    return total / 2


def point_in_ring(x, y, ring):
    inside = False
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % n]
        if (y1 > y) != (y2 > y):
            if x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
                inside = not inside
    return inside


def dist_to_ring(x, y, ring):
    best = float("inf")
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % n]
        dx, dy = x2 - x1, y2 - y1
        span = dx * dx + dy * dy
        if span == 0:
            d2 = (x - x1) ** 2 + (y - y1) ** 2
        else:
            t = ((x - x1) * dx + (y - y1) * dy) / span
            t = 0.0 if t < 0 else (1.0 if t > 1 else t)
            d2 = (x - x1 - t * dx) ** 2 + (y - y1 - t * dy) ** 2
        if d2 < best:
            best = d2
    return math.sqrt(best)


def label_point(ring):
    """Pole-of-inaccessibility-ish: the interior point furthest from any edge.

    Keeps labels off the coastline for awkward shapes (Norway, Chile, Croatia)
    where a plain centroid lands in the sea.
    """
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    probe = ring if len(ring) <= 600 else simplify(ring, 0.3)
    best, bx, by = -1.0, (x0 + x1) / 2, (y0 + y1) / 2
    for _ in range(3):
        step_x = (x1 - x0) / 16 or 0.01
        step_y = (y1 - y0) / 16 or 0.01
        for i in range(17):
            for j in range(17):
                x = x0 + i * step_x
                y = y0 + j * step_y
                if point_in_ring(x, y, probe):
                    d = dist_to_ring(x, y, probe)
                    if d > best:
                        best, bx, by = d, x, y
        if best < 0:
            break
        x0, x1 = bx - step_x, bx + step_x
        y0, y1 = by - step_y, by + step_y
    return round(bx, 1), round(by, 1), best


def to_path(prepared):
    out = []
    for rings in prepared:
        for ring in rings:
            parts = []
            prev = None
            for x, y in ring:
                cur = (round(x, PRECISION), round(y, PRECISION))
                if cur != prev:
                    parts.append(cur)
                    prev = cur
            if len(parts) < 3:
                continue
            out.append("M%g %g" % parts[0]
                       + "".join("L%g %g" % p for p in parts[1:]) + "Z")
    return "".join(out)


def prepare(polygons):
    """Project and simplify, dropping specks. Returns projected polygons."""
    kept = []
    for rings in polygons:
        outer = simplify([project(lon, lat) for lon, lat in rings[0]], SIMPLIFY)
        if len(outer) < 3 or abs(signed_area(outer)) < SPECK:
            continue
        holes = []
        for hole in rings[1:]:
            ph = simplify([project(lon, lat) for lon, lat in hole], SIMPLIFY)
            if len(ph) >= 3 and abs(signed_area(ph)) > SPECK:
                holes.append(ph)
        kept.append([outer] + holes)
    if not kept and polygons:
        # Microstate: every ring is sub-pixel. Keep the largest one anyway so
        # the country still has a shape, a bbox and a label anchor.
        rings = max(polygons, key=lambda r: abs(signed_area(
            [project(lon, lat) for lon, lat in r[0]])))
        outer = [project(lon, lat) for lon, lat in rings[0]]
        if len(outer) >= 3:
            kept = [[outer]]
    return kept


def max_x(prepared):
    return max((x for rings in prepared for x, _y in rings[0]), default=0.0)


def describe(polygons):
    """Path, label anchor, bbox and area for one group of polygons."""
    prepared = prepare(polygons)
    if not prepared:
        return None
    biggest = max((rings[0] for rings in prepared), key=lambda r: abs(signed_area(r)))
    lx, ly, inradius = label_point(biggest)

    # Frame the lobe around the label: Alaska may come along, Kiribati's
    # islands 900px away may not.
    x0 = y0 = float("inf")
    x1 = y1 = float("-inf")
    for rings in prepared:
        cx = sum(p[0] for p in rings[0]) / len(rings[0])
        cy = sum(p[1] for p in rings[0]) / len(rings[0])
        if abs(cx - lx) > WIDTH * LOBE_X or abs(cy - ly) > HEIGHT * LOBE_Y:
            continue
        for x, y in rings[0]:
            x0, y0 = min(x0, x), min(y0, y)
            x1, y1 = max(x1, x), max(y1, y)
    if x0 == float("inf"):
        x0, y0, x1, y1 = lx - 1, ly - 1, lx + 1, ly + 1

    return {
        "d": to_path(prepared),
        "lx": lx,
        "ly": ly,
        "ir": round(max(inradius, MIN_IR), 2),
        "bbox": [round(x0, 1), round(y0, 1), round(x1, 1), round(y1, 1)],
        "area": round(sum(abs(signed_area(r[0])) for r in prepared), 2),
        "maxx": max_x(prepared),
    }


# ----------------------------------------------------------------- answers
def fold(text):
    text = unicodedata.normalize("NFD", text)
    return "".join(c for c in text if unicodedata.category(c) != "Mn").lower()


def normalize_answer(text):
    text = fold(text)
    text = "".join(c if c.isalnum() else " " for c in text)
    return " ".join(text.split())


def slug(name):
    return normalize_answer(name).replace(" ", "-")


# ---------------------------------------------------------------------- main
def main(src, dst):
    topo, arcs = load_topology(src)
    features = {fold(g["properties"]["name"]): g
                for g in topo["objects"]["countries"]["geometries"]}

    merged = {}
    for extra, parent in MERGE_INTO.items():
        merged.setdefault(fold(parent), []).append(fold(extra))

    retired = {}
    for old, current in OUTDATED.items():
        retired.setdefault(current, []).append(normalize_answer(old))
    unknown = set(OUTDATED.values()) - {c[1] for c in COUNTRIES}
    if unknown:
        raise SystemExit("OUTDATED points at no such country: %s" % ", ".join(sorted(unknown)))
    unknown = {country for country, _ in JAIL.values()} - {c[1] for c in COUNTRIES}
    if unknown:
        raise SystemExit("JAIL points at no such country: %s" % ", ".join(sorted(unknown)))
    jail = [{"name": normalize_answer(old), "id": slug(old), "country": slug(country),
             "since": since}
            for old, (country, since) in sorted(JAIL.items())]

    used = set()
    reach = WIDTH          # furthest x any wrapped copy reaches
    countries = []
    for ne_name, display, region, aliases in COUNTRIES:
        old_names = retired.get(display, [])
        entry = {
            "id": slug(display),
            "name": display,
            "region": region,
            "answers": sorted({normalize_answer(a)
                               for a in [display] + list(aliases) + old_names}),
        }
        if old_names:
            entry["old"] = sorted(old_names)

        polygons = []
        if ne_name:
            key = fold(ne_name)
            if key not in features:
                raise SystemExit("no Natural Earth feature named %r" % ne_name)
            used.add(key)
            polygons = polygons_of(features[key], arcs)
            for extra in merged.get(key, []):
                used.add(extra)
                polygons += polygons_of(features[extra], arcs)

        if polygons:
            inside, outside, west_only = expand(polygons, wrap=region == OCEANIA)
            here = describe(inside)
            there = describe(outside)

            # Geometry is positional: "d" is always the copy on the map proper
            # and "d2" the one east of 180, so the page can hide "d2" on its
            # own. Which anchor *leads* is a separate question - Samoa and
            # Tonga read better labelled out in the Pacific.
            lead, second = here, there
            if there and (west_only or not here):
                lead, second = there, here

            entry.update({
                "d": here["d"] if here else "",
                "lx": lead["lx"],
                "ly": lead["ly"],
                "ir": lead["ir"],
                "bbox": lead["bbox"],
                "area": lead["area"],
            })
            if there:
                reach = max(reach, there["maxx"], (here or there)["maxx"])
                entry["d2"] = there["d"]
            if lead is there:
                entry["e"] = 1          # the leading anchor is the Pacific copy
            if second:
                entry["lx2"] = second["lx"]
                entry["ly2"] = second["ly"]
                entry["ir2"] = second["ir"]
        else:
            lon, lat = POINT_ONLY[display]
            x, y = project(lon, lat)
            entry.update({
                "d": "",
                "lx": round(x, 1),
                "ly": round(y, 1),
                "ir": MIN_IR,
                "bbox": [round(x - 2, 1), round(y - 2, 1), round(x + 2, 1), round(y + 2, 1)],
                "area": 0.0,
            })
        countries.append(entry)

    # Everything that is not one of the 197: drawn as inert land.
    territories = []
    territories_east = []
    for key, geom in features.items():
        if key in used:
            continue
        inside, outside, _west = expand(polygons_of(geom, arcs))
        beyond = prepare(outside)
        reach = max(reach, max_x(beyond))
        territories += prepare(inside)
        territories_east += beyond

    # Map frame, so the ocean has a shape, and a graticule for a sense of scale.
    # The frame runs past 180 to EAST_EDGE: the Pacific copies of Fiji, Samoa,
    # Tonga and Kiribati live out there and were floating off the map before.
    east = int(EAST_EDGE)
    frame = [project(-180, lat) for lat in range(-90, 91)]
    frame += [project(lon, 90) for lon in range(-180, 181, 5)]
    frame += [project(180, lat) for lat in range(90, -91, -1)]
    frame += [project(lon, -90) for lon in range(180, -181, -5)]

    frame_east = [project(180, lat) for lat in range(-90, 91)]
    frame_east += [project(lon, 90) for lon in range(180, east + 1, 5)]
    frame_east += [project(EAST_EDGE, lat) for lat in range(90, -91, -1)]
    frame_east += [project(lon, -90) for lon in range(east, 179, -5)]

    graticule = [[project(lon, lat) for lat in range(-90, 91, 2)]
                 for lon in range(-180, 181, 30)]
    graticule += [[project(lon, lat) for lon in range(-180, 181, 5)]
                  for lat in range(-60, 61, 30)]
    graticule_east = [[project(lon, lat) for lon in range(180, east + 1, 5)]
                      for lat in range(-60, 61, 30)]

    def line(points):
        points = [(round(x, 1), round(y, 1)) for x, y in points]
        return "M%g %g" % points[0] + "".join("L%g %g" % p for p in points[1:])

    views = {}
    for region, (lon0, lat0, lon1, lat1) in REGION_WINDOWS.items():
        xs, ys = [], []
        for i in range(25):
            t = i / 24
            lon = lon0 + (lon1 - lon0) * t
            lat = lat0 + (lat1 - lat0) * t
            for pt in (project(lon, lat0), project(lon, lat1),
                       project(lon0, lat), project(lon1, lat)):
                xs.append(pt[0])
                ys.append(pt[1])
        views[region] = [round(min(xs), 1), round(min(ys), 1),
                         round(max(xs), 1), round(max(ys), 1)]

    regions = []
    for c in countries:
        if c["region"] not in regions:
            regions.append(c["region"])

    clash = {j["name"] for j in jail} & {a for c in countries for a in c["answers"]}
    if clash:
        raise SystemExit("JAIL names are also answers: %s" % ", ".join(sorted(clash)))

    data = {
        "width": WIDTH,
        "height": HEIGHT,
        "wrap": round(project(EAST_EDGE, 0)[0] - WIDTH, 1),
        "frame": line(frame) + "Z",
        "frameEast": line(frame_east) + "Z",
        "graticule": [line(p) for p in graticule],
        "graticuleEast": [line(p) for p in graticule_east],
        "territories": to_path(territories),
        "territoriesEast": to_path(territories_east),
        "views": views,
        "regions": regions,
        "countries": countries,
        "jail": jail,
    }

    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    with open(dst, "w", encoding="utf-8") as fh:
        fh.write("// Generated by build/build_map.py - do not edit by hand.\n")
        fh.write("window.MAP_DATA = ")
        fh.write(payload)
        fh.write(";\n")

    print("%d countries, %.1f KB" % (len(countries), len(payload) / 1024))
    for region in regions:
        print("  %-15s %d" % (region, sum(1 for c in countries if c["region"] == region)))
    wrapped = [c["name"] for c in countries if "lx2" in c]
    print("drawn on both sides of the date line: %s" % ", ".join(wrapped))
    edge = project(EAST_EDGE, 0)[0]
    if reach > edge:
        raise SystemExit("wrapped land reaches x=%.1f, past the frame at %.1f" % (reach, edge))
    print("ocean runs to x=%.1f, furthest wrapped land x=%.1f" % (edge, reach))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
