#!/usr/bin/env python3
"""Puzzle generator for Spring Bots.

    python generator.py --level 12                 # one level, printed
    python generator.py --campaign 32 --maps maps  # the cart's levels

The rules, as the cart plays them: the group moves as one and is blocked
whole by any wall; a robot it touches is wired on; growers (3) leave a
flower on any cell they step off that no robot steps onto; a bud (4)
becomes a grower once it stomps a flower. A level is finished when every
flower is stomped and every robot is wired on.

A level is made by search. A board of narrow corridors, dead ends and
small rooms is carved, robots and flowers are scattered on it, and every
state reachable from the start is explored. A state from which the level
can no longer be finished is dead: wiring a robot on too soon is the usual
way in. A candidate whose player can stomp more than a fifth of the flowers
before wiring a robot is thrown out: the robots are needed from the start.
So is one with a robot that costs too little -- whose taking away would
leave the shortest solution about as long, a robot that only comes along
-- unless the level cannot be finished without it. The rest are scored by
the traps along the shortest solution -- moves from it into a dead state
-- by what the robots cost, by the flowers robots stomp and by how many
states are dead, and the best for the level's place in the campaign is
kept.

The islands are joined: the player arrives at the start, on the island's
outermost floor on one side, and leaves by a bridge from the outermost floor
on another. Each level arrives from the side opposite the last one's exit.
Sides are the cart's directions: 0 down, 1 left, 2 right, 3 up.

Tiles in text output:
    # wall   . floor   * flowers   @ start   2/3/4 robots
"""
from __future__ import annotations

import argparse
import json
import os
import random
import time
from collections import deque
from dataclasses import dataclass
from typing import List, Optional, Sequence, Tuple

Pos = Tuple[int, int]
DIRS: Sequence[Tuple[int, int, str]] = (
    (-1, 0, "L"), (1, 0, "R"), (0, -1, "U"), (0, 1, "D")
)
DOWN, LEFT, RIGHT, UP = 0, 1, 2, 3
OPPOSITE = {DOWN: UP, UP: DOWN, LEFT: RIGHT, RIGHT: LEFT}
HOME_EXIT = RIGHT       # the side the bridge leaves the robot's home island
GROWER, BUD = 3, 4


@dataclass
class Level:
    width: int
    height: int
    floor: frozenset
    start: Pos
    robots: List[Tuple[Pos, int]]      # home cell and type
    flowers: frozenset
    arrive: int = LEFT                  # the side the start's bridge leaves by
    exit: Pos = (0, 0)
    exit_side: int = RIGHT

    def render(self) -> str:
        homes = {p: t for p, t in self.robots}
        rows = []
        for y in range(self.height):
            row = ""
            for x in range(self.width):
                p = (x, y)
                if p not in self.floor:
                    row += "#"
                elif p == self.start:
                    row += "@"
                elif p in homes:
                    row += str(homes[p])
                elif p in self.flowers:
                    row += "*"
                else:
                    row += "."
            rows.append(row)
        return "\n".join(rows)


# ---------------------------------------------------------------- the rules
#
# A state is (x, y, wired, grown, flowers): the player's cell; for each
# robot its offset from the player once wired, or None; a bit for each bud
# that has opened; and the flowers as a bit for each cell.

class Rules:
    def __init__(self, level: Level):
        self.level = level
        self.w = level.width
        self.floor = level.floor
        self.homes = [p for p, _ in level.robots]
        self.types = [t for _, t in level.robots]

    def bit(self, x: int, y: int) -> int:
        return 1 << (y * self.w + x)

    def start(self):
        flowers = 0
        for x, y in self.level.flowers:
            flowers |= self.bit(x, y)
        state = (self.level.start[0], self.level.start[1],
                 tuple(None for _ in self.homes), 0, flowers)
        return self.gather(state)

    def cells(self, state) -> List[Tuple[int, int, int]]:
        """The group's cells, each with its robot (-1 the player)."""
        x, y, wired = state[0], state[1], state[2]
        out = [(x, y, -1)]
        for i, off in enumerate(wired):
            if off is not None:
                out.append((x + off[0], y + off[1], i))
        return out

    def gather(self, state):
        x, y, wired, grown, flowers = state
        wired = list(wired)
        more = True
        while more:
            more = False
            members = [(x, y)] + [(x + o[0], y + o[1]) for o in wired if o is not None]
            for i, home in enumerate(self.homes):
                if wired[i] is not None:
                    continue
                if any(abs(home[0] - mx) + abs(home[1] - my) == 1 for mx, my in members):
                    wired[i] = (home[0] - x, home[1] - y)
                    more = True
        return (x, y, tuple(wired), grown, flowers)

    def grows(self, i: int, grown: int) -> bool:
        return i >= 0 and (self.types[i] == GROWER or
                           (self.types[i] == BUD and grown >> i & 1 == 1))

    def move(self, state, dx: int, dy: int):
        x, y, wired, grown, flowers = state
        members = self.cells(state)
        for mx, my, _ in members:
            if (mx + dx, my + dy) not in self.floor:
                return None
        for mx, my, i in members:
            if self.grows(i, grown):
                flowers |= self.bit(mx, my)
        state = self.gather((x + dx, y + dy, wired, grown, flowers))
        x, y, wired, grown, flowers = state
        for mx, my, i in self.cells(state):
            b = self.bit(mx, my)
            if flowers & b:
                flowers &= ~b
                if i >= 0 and self.types[i] == BUD:
                    grown |= 1 << i
        return (x, y, wired, grown, flowers)

    @staticmethod
    def won(state) -> bool:
        return state[4] == 0 and all(o is not None for o in state[2])


@dataclass
class Analysis:
    states: int
    dead: int
    solution: str
    traps: int          # moves off the shortest solution into a dead state
    solo: int           # most flowers the player can stomp before wiring a robot
    helped: int         # flowers robots stomp along the shortest solution


def analyse(level: Level, cap: int) -> Optional[Analysis]:
    """Every state reachable from the start, or None when there are more
    than `cap` or the level cannot be finished."""
    rules = Rules(level)
    start = rules.start()
    index = {start: 0}
    states = [start]
    edges: List[List[int]] = []
    queue = deque([0])
    while queue:
        s = queue.popleft()
        out = []
        for dx, dy, _ in DIRS:
            nxt = rules.move(states[s], dx, dy)
            if nxt is None:
                out.append(-1)
                continue
            j = index.get(nxt)
            if j is None:
                if len(states) >= cap:
                    return None
                j = len(states)
                index[nxt] = j
                states.append(nxt)
                queue.append(j)
            out.append(j)
        edges.append(out)

    n = len(states)
    back: List[List[int]] = [[] for _ in range(n)]
    for s, out in enumerate(edges):
        for j in out:
            if j >= 0:
                back[j].append(s)
    alive = bytearray(n)
    queue = deque(s for s in range(n) if Rules.won(states[s]))
    if not queue:
        return None
    for s in queue:
        alive[s] = 1
    while queue:
        s = queue.popleft()
        for p in back[s]:
            if not alive[p]:
                alive[p] = 1
                queue.append(p)

    # the shortest solution, and the traps beside it
    parent = {0: (-1, "")}
    queue = deque([0])
    goal = -1
    while queue and goal < 0:
        s = queue.popleft()
        for k, j in enumerate(edges[s]):
            if j >= 0 and j not in parent:
                parent[j] = (s, DIRS[k][2])
                if Rules.won(states[j]):
                    goal = j
                    break
                queue.append(j)
    path, moves = [], []
    s = goal
    while s > 0:
        p, m = parent[s]
        path.append(p)
        moves.append(m)
        s = p
    traps = sum(1 for s in path for j in set(edges[s]) if j >= 0 and not alive[j])

    every = bin(states[0][4]).count("1")
    solo = max(every - bin(st[4]).count("1") for st in states
               if all(o is None for o in st[2]))
    # a robot's stomp: a flower gone from under a wired robot's cell
    helped = 0
    walk = [states[s] for s in reversed(path)] + [states[goal]]
    for prev, cur in zip(walk, walk[1:]):
        gone = prev[4] & ~cur[4]
        helped += sum(1 for x, y, i in rules.cells(cur)
                      if i >= 0 and gone & rules.bit(x, y))
    return Analysis(n, n - sum(alive), "".join(reversed(moves)), traps,
                    solo, helped)


# ---------------------------------------------------------------- boards

def carve(rng: random.Random, w: int, h: int, cells: int) -> frozenset:
    """Corridors a cell wide, walked in straight runs, with a few small
    rooms where runs end: dead ends, junctions and loops."""
    floor = set()
    x, y = rng.randrange(1, w - 1), rng.randrange(1, h - 1)
    floor.add((x, y))
    tries = 0
    while len(floor) < cells and tries < 400:
        tries += 1
        x, y = rng.choice(sorted(floor))
        dx, dy, _ = rng.choice(DIRS)
        for _ in range(rng.randint(2, 5)):
            nx, ny = x + dx, y + dy
            if not (1 <= nx < w - 1 and 1 <= ny < h - 1):
                break
            x, y = nx, ny
            floor.add((x, y))
        if rng.random() < 0.25:
            rw, rh = rng.randint(2, 3), rng.randint(2, 3)
            for ry in range(rh):
                for rx in range(rw):
                    if 1 <= x + rx < w - 1 and 1 <= y + ry < h - 1:
                        floor.add((x + rx, y + ry))
    return frozenset(floor)


@dataclass(frozen=True)
class Targets:
    level: int
    width: int
    height: int
    floor: int
    robots: Tuple[int, ...]
    flowers: int
    min_moves: int
    min_traps: int
    want_traps: int     # the traps aimed for: the ramp
    max_solo: int       # flowers the player may stomp before wiring a robot
    min_cost: int       # moves each robot but a grower must add to the shortest solution
    cap: int


def targets(n: int, levels: int = 32) -> Targets:
    """The level's place in the campaign: board, robots and flowers grow
    evenly, and so do the length and traps asked of its solution. Only
    the first two levels have one robot. Buds come in a third of the way.
    Growers come in two thirds of the way, on every other level from
    there, on boards of their own ramp: a grower's flowers multiply the
    states to search, so a big board with one cannot be solved in time.
    The levels between keep to the size reached before them."""
    third, two_thirds = levels // 3 + 1, 2 * levels // 3 + 1
    if n >= two_thirds and (n - two_thirds) % 2 == 0:
        u = (n - two_thirds) / max(1, levels - two_thirds)
        flowers = 4 + round(2 * u)
        robots = (2, GROWER) if u < 0.5 else (2, 2, GROWER)
        return Targets(n, 9 + round(3 * u), 8 + round(2 * u), 20 + round(6 * u),
                       robots, flowers,
                       min_moves=12 + round(8 * u), min_traps=2 + round(2 * u),
                       want_traps=4 + round(4 * u),
                       max_solo=max(1, flowers // 5),
                       min_cost=2 + round(u),
                       cap=300_000)
    t = min(1.0, (n - 1) / max(1, levels - 1))
    if n >= two_thirds:
        # past the growers' start, the levels between theirs stay the size
        # of the last before it: bigger boards find no level in time
        t = min(t, (two_thirds - 2) / max(1, levels - 1))
    width = 8 + round(12 * t)
    height = 7 + round(8 * t)
    floor = 16 + round(44 * t)
    count = 1 if n <= 2 else max(2, 1 + round(4 * t))
    robots = [2] * count
    if n >= third:
        robots[-1] = BUD
    flowers = 3 + round(9 * t)
    return Targets(n, width, height, floor, tuple(robots), flowers,
                   min_moves=6 + round(24 * t), min_traps=1 + round(5 * t),
                   want_traps=2 + round(10 * t),
                   max_solo=max(1, flowers // 5),
                   min_cost=2 + round(3 * t),
                   cap=120_000 + round(180_000 * t))


def edge(cells: Sequence[Pos], side: int) -> List[Pos]:
    """The floor cells outermost on a side, where a bridge can leave."""
    if side == LEFT:
        x = min(p[0] for p in cells)
        return [p for p in cells if p[0] == x]
    if side == RIGHT:
        x = max(p[0] for p in cells)
        return [p for p in cells if p[0] == x]
    if side == UP:
        y = min(p[1] for p in cells)
        return [p for p in cells if p[1] == y]
    y = max(p[1] for p in cells)
    return [p for p in cells if p[1] == y]


def candidate(rng: random.Random, tg: Targets, arrive: int,
              leave: Optional[int] = None) -> Optional[Level]:
    floor = carve(rng, tg.width, tg.height, tg.floor)
    # the board cropped to what was carved, a wall all round
    x0 = min(x for x, _ in floor) - 1
    y0 = min(y for _, y in floor) - 1
    floor = frozenset((x - x0, y - y0) for x, y in floor)
    width = max(x for x, _ in floor) + 2
    height = max(y for _, y in floor) + 2
    cells = sorted(floor)
    if len(cells) < len(tg.robots) + tg.flowers + 4:
        return None
    start = rng.choice(edge(cells, arrive))
    exit_side = leave if leave is not None else rng.choice(
        [d for d in (DOWN, LEFT, RIGHT, UP) if d != arrive])
    exits = [p for p in edge(cells, exit_side) if p != start]
    if not exits:
        return None
    exit = rng.choice(exits)
    taken = {start}
    homes: List[Tuple[Pos, int]] = []
    for k, t in enumerate(tg.robots):
        spots = [p for p in cells if p not in taken and
                 all(abs(p[0] - q[0]) + abs(p[1] - q[1]) > 1 for q in taken)]
        if k == 0:
            # the first stands near the start, where it can bar the way
            spots = [p for p in spots
                     if abs(p[0] - start[0]) + abs(p[1] - start[1]) <= 3]
        if not spots:
            return None
        p = rng.choice(spots)
        homes.append((p, t))
        taken.add(p)

    def way_out(p: Pos) -> int:
        return sum((p[0] + dx, p[1] + dy) in floor for dx, dy, _ in DIRS)

    # flowers favour dead ends and corridors, where a wide group cannot go
    spots = [p for p in cells if p not in taken]
    weights = [6 if way_out(p) == 1 else 3 if way_out(p) == 2 else 1 for p in spots]
    flowers = set()
    while len(flowers) < tg.flowers and len(flowers) < len(spots):
        flowers.add(rng.choices(spots, weights)[0])
    return Level(width, height, floor, start, homes, frozenset(flowers),
                 arrive, exit, exit_side)


NEEDED = 99             # a robot's cost when the level needs it to be finished


def shortest(level: Level, cap: int) -> Optional[int]:
    """The shortest solution's length; None when there is none, -1 when
    there are more than `cap` states to look through."""
    rules = Rules(level)
    start = rules.start()
    seen, frontier, depth = {start}, [start], 0
    while frontier:
        if any(Rules.won(s) for s in frontier):
            return depth
        nxt = []
        for s in frontier:
            for dx, dy, _ in DIRS:
                t = rules.move(s, dx, dy)
                if t is not None and t not in seen:
                    seen.add(t)
                    nxt.append(t)
        if len(seen) > cap:
            return -1
        frontier = nxt
        depth += 1
    return None


def costs(level: Level, a: Analysis, cap: int) -> List[int]:
    """What each robot adds to the shortest solution: its length less the
    length without that robot, or NEEDED."""
    out = []
    for i in range(len(level.robots)):
        rest = Level(level.width, level.height, level.floor, level.start,
                     [r for j, r in enumerate(level.robots) if j != i],
                     level.flowers, level.arrive, level.exit, level.exit_side)
        n = shortest(rest, cap)
        out.append(NEEDED if n is None else 0 if n < 0 else len(a.solution) - n)
    return out


def fetched(level: Level, cost: List[int]) -> List[int]:
    """The costs of the robots worth fetching: all but growers, which make
    work rather than save it, and so cost less than nothing."""
    return [c for c, (_, k) in zip(cost, level.robots) if k != GROWER] or [NEEDED]


def score(a: Analysis, tg: Targets, cost: List[int]) -> float:
    """Nearest the traps the level aims for, then the more the robots cost,
    the more flowers they stomp, the more dead states and the longer
    solution."""
    return (-3 * abs(a.traps - tg.want_traps) + 1.5 * a.helped +
            0.5 * sum(min(c, 12) for c in cost) +
            10 * a.dead / a.states +
            min(len(a.solution), tg.min_moves * 2) * 0.2)


def generate(seed: int, n: int, budget: float, levels: int = 32,
             arrive: int = OPPOSITE[HOME_EXIT], leave: Optional[int] = None,
             ) -> Tuple[Level, Analysis, Targets, int, List[int]]:
    """The best candidate found in `budget` seconds that needs its robots
    from the start and meets the level's targets; failing that, the best
    that needs its robots, searching on up to eight times as long for one
    that meets them; failing even that, the one whose cheapest robot costs
    most."""
    tg = targets(n, levels)
    rng = random.Random(seed * 1_000_003 + n * 9_176)
    best: Optional[Tuple[float, Level, Analysis, List[int]]] = None
    good: Optional[Tuple[float, Level, Analysis, List[int]]] = None
    loose: Optional[Tuple[Tuple[int, float], Level, Analysis, List[int]]] = None
    tried = 0
    begin = time.time()
    while True:
        spent = time.time() - begin
        if good is not None and spent > budget:
            break
        if (best or loose) is not None and spent > budget * 8:
            break
        tried += 1
        level = candidate(rng, tg, arrive, leave)
        if level is None:
            continue
        a = analyse(level, tg.cap)
        if a is None or a.solo > tg.max_solo or len(a.solution) < 3:
            continue
        cost = costs(level, a, tg.cap)
        worth = fetched(level, cost)
        s = score(a, tg, worth)
        if min(worth) < tg.min_cost:
            if loose is None or (min(worth), s) > loose[0]:
                loose = ((min(worth), s), level, a, cost)
            continue
        if best is None or s > best[0]:
            best = (s, level, a, cost)
        if a.traps >= tg.min_traps and len(a.solution) >= tg.min_moves:
            if good is None or s > good[0]:
                good = (s, level, a, cost)
    chosen = good or best or loose
    assert chosen is not None
    return chosen[1], chosen[2], tg, tried, chosen[3]


def cart_map(level: Level, par: int) -> dict:
    """The level as a map for the cart: a wall, flat grass, flowers and
    the robots, one tile of each kind -- the cart picks each cell's look --
    and the shortest solution's length as the arrival's par.
    A robot of type t is the sheet's row t - 1."""
    rows = []
    for line in level.render().splitlines():
        row = ""
        for ch in line:
            v = {"#": 160, "*": 128, "@": 0, ".": 136}.get(ch)
            if v is None:
                v = (int(ch) - 1) * 16
            row += "%02x" % v
        rows.append(row)
    def obj(kind: str, p: Pos, side: int, **more) -> dict:
        return {"kind": kind, "x": p[0] * 8, "y": p[1] * 8, "w": 8, "h": 8,
                "props": {"side": side, **more}}
    return {"width": level.width, "height": level.height, "rows": rows,
            "objects": [obj("arrive", level.start, level.arrive, par=par),
                        obj("exit", level.exit, level.exit_side)]}


def describe(n: int, tg: Targets, level: Level, a: Analysis, tried: int,
             cost: List[int]) -> str:
    met = ("" if a.traps >= tg.min_traps and len(a.solution) >= tg.min_moves
           else "  (below target)")
    if min(fetched(level, cost)) < tg.min_cost:
        met += "  (robots below their cost)"
    return (f"Level {n}: {level.width}x{level.height}, robots {len(level.robots)}, "
            f"flowers {len(level.flowers)}; shortest {len(a.solution)} moves, "
            f"{a.traps} traps beside it, {a.solo} solo, {a.helped} by robots, "
            f"robots cost {' '.join('needed' if c == NEEDED else '+%d' % c for c in cost)}, "
            f"{100 * a.dead // a.states}% of "
            f"{a.states} states dead; {tried} tried{met}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--seed", type=int, default=12345)
    parser.add_argument("--level", type=int, default=1, help="Campaign level number")
    parser.add_argument("--levels", type=int, default=32, help="Levels in the campaign; with --first, the whole campaign's")
    parser.add_argument("--seconds", type=float, default=20.0,
                        help="Time to search for each level")
    parser.add_argument("--campaign", type=int, metavar="N",
                        help="Make levels 1 to N instead of one")
    parser.add_argument("--first", type=int, default=1, metavar="K",
                        help="With --campaign and --json: start at level K, carrying on "
                             "from the levels already in the JSON; levels after N there "
                             "are kept, and level N leaves by the side it did")
    parser.add_argument("--maps", metavar="DIR",
                        help="With --campaign: write the cart's maps, levelNN.json, here")
    parser.add_argument("--json", metavar="PATH", help="Write the levels and their solutions")
    args = parser.parse_args()

    numbers = range(args.first, args.campaign + 1) if args.campaign else [args.level]
    total = args.campaign or args.levels
    summary = []
    arrive = OPPOSITE[HOME_EXIT]
    after, made = [], []
    if args.campaign and args.first > 1:
        # carry on from the levels already made
        with open(args.json, encoding="utf-8") as handle:
            made = json.load(handle)
        summary = [l for l in made if l["level"] < args.first]
        after = [l for l in made if l["level"] > args.campaign]
        arrive = OPPOSITE[summary[-1]["exit_side"]]
    leave_last = next((l["exit_side"] for l in made
                       if l["level"] == args.campaign), None) if after else None
    if after:
        total = max(args.levels, after[-1]["level"])
    for n in numbers:
        leave = leave_last if n == args.campaign else None
        level, a, tg, tried, cost = generate(args.seed, n, args.seconds, total, arrive,
                                             leave)
        arrive = OPPOSITE[level.exit_side]
        print(describe(n, tg, level, a, tried, cost), flush=True)
        if not args.campaign:
            print(level.render())
            print("Shortest solution:", a.solution)
        if args.maps:
            os.makedirs(args.maps, exist_ok=True)
            with open(os.path.join(args.maps, "level%02d.json" % n), "w",
                      encoding="utf-8") as handle:
                json.dump(cart_map(level, len(a.solution)), handle, indent=1)
        summary.append({"level": n, "grid": level.render().splitlines(),
                        "solution": a.solution, "traps": a.traps,
                        "arrive": level.arrive, "exit_side": level.exit_side,
                        "states": a.states, "dead": a.dead, "costs": cost})
        if args.json:
            with open(args.json, "w", encoding="utf-8") as handle:
                json.dump(summary + after, handle, indent=1)


if __name__ == "__main__":
    main()
