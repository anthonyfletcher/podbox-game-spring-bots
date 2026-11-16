// Spring Bots. Robots that hate flowers: stomp every one flat, and wire
// every robot on. You are the robot with the pink light. Walk into
// another robot and a springy wire joins it on; the group then moves as
// one, keeping its shape, and stops whole when any of it would walk into
// the sea or a rock. A grower (red) leaves a flower on every cell it
// steps off; a bud (orange) becomes a grower once it stomps a flower.
//
// The rules are the level generator's (generator.py, Rules.move): each
// step is worked out at once on the cells and `bloom`, and what it did is
// then shown as the robots arrive -- a flower planted as its grower leaves,
// stomped as its robot lands, a bud opening as it lands.
//
// Each robot is a cell on the map (cx, cy) and a drawn position (px, py)
// that springs after it. A step releases each robot's drawn target a few
// ticks after its parent's, so the wire pulls the group along one link at
// a time; the wires hold each pair within a stretch of their rest.
//
// The sheet: robot r is row r -- 0 the player, 1 the default, 2 the
// grower, 3 the bud -- its front and side first (see the F_, S_ and B_
// columns); flowers 128-135, flat grass 136-139, single obstacles 144-147, a log 148-149 and a big rock 150-151 for a pair,
// walls 160-175. A map needs only one tile of each kind -- 128, 136, 160 --
// and the robots at 16r (facing front) or 16r + 1 (side); each cell's look
// is picked as the map loads, and each wall joins its neighbours. The
// levels are maps level01 to level32, from generator.py --campaign 32.
//
// The islands are joined. Each level's map has an `arrive` object, where
// the player steps on, and an `exit`, each with the side its bridge leaves
// by. Once a level is finished the robots let go and caper off, and a
// bridge of land two cells wide rises from the sea at the exit; walking
// off the screen along it goes straight to the next island, where another
// runs in from the screen's edge to the start, and sinks once crossed.
// The first island is home (maps/home): the title and the story play
// there -- the robot asleep in his house, the nightmare, the pot knocked
// off the table, the flower trampled -- and the last level's bridge leads
// back there, to bed, a kinder dream and the end. images/world.png holds
// the house, its roof, the table, the pot, the z's, the crown and the
// killer plant; images/title.png is the logo on the title.

const N = 16;
const LEVELS = 32;
const PAD = 32;           // the ground drawn past each edge of the screen
const GW = 160 + 2 * PAD, GH = 120 + 2 * PAD;
const STORY = 0, PLAY = 1, FREE = 2, CROSS = 3, BED = 4, INTRO = 5, PICK = 6;
const REDIN = 7, TITLE = 8;
const BMAX = 64;          // cells of land bridge
const CW = GW >> 3, CH = GH >> 3;    // the ground's cells
const HX = 24, HY = 8;    // the house's corner on the home map, in pixels
const DOORX = 5, DOORY = 5;          // the cell outside its door
// where the last level's path comes in to the home island, by side
var HOMEIN = [4, 6, 1, 5, 8, 6, 7, 1];
const BUBX = 98, BUBY = 8;           // the dream's corner on the screen
const D = 4;              // ticks each wire delays the tug
const STRETCH = 6.0;      // how far a wire may stretch past its rest
const SQUEEZE = 1.5;      // how far it may squash
const SHEAR = 4.0;        // how far a pair may slide across one another
const ROBOTS = 4, PLAYER = 0, GROWER = 2, BUD = 3;
const FLOWERS = 128, FLAT = 136, WALL = 160;
const SHORE = 176, CORNER = 192, SEA = 28, BAND = 35;
const GLINTS = 24;
const HMAX = 200;         // steps that can be undone
const SNAP = N * 6;       // a robot's cell, group, parent, depth and kind

// columns of a robot's own row: front, side and back frames
const F_IDLE = 0, S_IDLE = 1, F_BLINK = 2, F_WALKA = 3, F_WALKB = 4;
const F_SQUASH = 5, F_WOW = 6, S_BLINK = 7, S_WALK = 8, S_LEANF = 9;
const S_LEANB = 10, S_SQUASH = 11, S_WOW = 12, B_IDLE = 13, B_WALK = 14;
const B_SQUASH = 15;

// each robot's lights, and each flower tile's petals
var LIGHT = [14, 10, 10, 10];
var PETAL = [7, 10, 14, 12, 8, 7, 10, 14];
// the obstacles on their own: boulder, mossy rock, stump, toadstool, crate
var ODDS = [144, 145, 146, 147];
const PAIRS = 148;        // a log, then a big rock: two cells wide each

// faces, and the step each is: down (front), left, right, up (back)
var DX = [0, -1, 1, 0];
var DY = [1, 0, 0, -1];

var count = 0, me = 0;
var cx = new Int32Array(N), cy = new Int32Array(N);
var px = new FixArray(N), py = new FixArray(N);
var vx = new FixArray(N), vy = new FixArray(N);
var tx = new Int32Array(N), ty = new Int32Array(N);
var due = new Int32Array(N);         // tick its target is released
var kind = new Int32Array(N);        // what it is, by the rules
var row = new Int32Array(N);         // what it looks like: kind once landed
var face = new Int32Array(N);
var grp = new Uint8Array(N), par = new Int32Array(N), depth = new Int32Array(N);
var latch = new FixArray(N);         // its wire grown, 0 to 1
var latchat = new Int32Array(N);     // tick the wire starts to grow
var hop = new FixArray(N), hv = new FixArray(N);
var squash = new Int32Array(N), glow = new Int32Array(N);
var blinkat = new Int32Array(N), lookat = new Int32Array(N);
var fast = new Uint8Array(N), strain = new FixArray(N);
var order = new Int32Array(N);

// what a step did, waiting to be shown
var arriving = new Uint8Array(N);    // released, not yet landed
var stomping = new Uint8Array(N), sx = new Int32Array(N), sy = new Int32Array(N);
var planting = new Uint8Array(N), gx = new Int32Array(N), gy = new Int32Array(N);
var opening = new Uint8Array(N);

var bloom = new Uint8Array(20 * 15), blooms = 0;
var hist = new Uint8Array(HMAX * SNAP), histb = new Uint8Array(HMAX * 300);
var hn = 0;

var lvl = 0, won = 0, banner = 0;
var parmoves = 0, moves = 0, startat = 0, took = 0;   // the level's score
var newmoves = false, newtime = false;
const BESTMOVES = 64, BESTTIME = 128;  // saved numbers, by level
var stepface = 0, want = -1, rest = 0, shake = 0, held = 0;
var sparks, dust, petals;
var ground;               // the map drawn once: copying it is a tenth the cost
var sox = 0, soy = 0;     // where the map's corner is on the screen
var glx = new Int32Array(GLINTS), gly = new Int32Array(GLINTS);
// the ground's cells: 0 sea, 1 the island, 2 a bridge of land
var lands = new Uint8Array(CW * CH);

var mode = PLAY, home = false, cheer = 0;
var panx = 0, pany = 0, wantpx = 0, wantpy = 0;   // the view, off the screen's
var ax = 0, ay = 0, aside = 0, ex = 0, ey = 0, eside = 0;
var objs = new Int32Array(10);

// the bridges' cells (map cells, mostly off the map): whether each is up,
// whether it is to be, and when
var bx = new Int32Array(BMAX), by = new Int32Array(BMAX);
var bup = new Uint8Array(BMAX), bto = new Uint8Array(BMAX), bat = new Int32Array(BMAX);
var bn = 0;
// the walk in from the screen's edge to the arrival
var wx = new Int32Array(BMAX), wy = new Int32Array(BMAX);
var wn = 0, wk = 0;
var roamat = new Int32Array(N);      // when a freed robot next capers
const ORANGE = 10;        // the level the orange bud is shown on, from 0
const RED = 21;           // and the red grower
var trx = new Int32Array(BMAX), try0 = new Int32Array(BMAX);
var trup = new Uint8Array(BMAX), trn = 0;  // the grower's trail of flowers
var pick = 0;             // the level the chooser is on
var actor = -1, bud = 0;    // the intro's robot while awake, and always
var ph = 0, pt = 0;       // its part of the intro, and ticks into it
var introat = 0;          // the tick the intro began
var hx0 = 0, hy0 = 0;     // its place on the island
const PLANT = 96;         // the killer plant's frames in IMG.world, 2x2 each

// the story's props and timings
var st = 0, asleep = 0, think = 0, shout = 0, shoutat = 0;
var thumb = new Uint8Array(512), thumbof = -1, thumbw = 0, thumbh = 0;
var haslogo = false, logotop = 0, logoh = 5;   // the logo's drawn rows
const ISLE = 30, ISLEH = 55;  // the home island's top and height on the screen
var potstate = 0, potx = 0.0, poty = 0.0, potvx = 0.0, potvy = 0.0, pota = 0.0;
var roofstate = 0, roofy = 0.0, roofv = 0.0;
var zx = new FixArray(4), zy = new FixArray(4), zt = new Int32Array(4);

function init() {
    ground = img(GW, GH);
    petals = particles.pool(64);
    petals.gravity = 0.09;
    petals.drag = 0.04;
    sparks = particles.pool(48);
    sparks.gravity = 0.12;
    dust = particles.pool(32);
    dust.gravity = -0.02;
    dust.drag = 0.1;
    lap(64);
    menuitem(1, "Restart level", restart);
    menuitem(2, "Choose level", choose);
    menuitem(4, "The story", story);
    sheet(IMG.title);
    for (var y = 0; y < imgh(IMG.title); y++)
        for (var x = 0; x < imgw(IMG.title); x++)
            if (sget(x, y) != 0) {
                if (!haslogo)
                    logotop = y;
                haslogo = true;
                logoh = y - logotop + 1;
            }
    sheet();
    title();
}

// The title: the logo over the house, him asleep inside it, the scene the
// story opens on. A button goes on to the story the first time, and back
// to the last level played after that.
function title() {
    story();
    mode = TITLE;
    pany = ISLE - 2 * gap() - logoh;   // the island moved down between them
    wantpy = pany;
}

// The title's gap, the same above the logo, between it and the island,
// below the island and below "PRESS ANY BUTTON".
function gap() {
    return flr((120 - logoh - ISLEH - 5) / 4);
}

function titled(d) {
    st++;
    if (st % 40 == 20)
        snore(me);
    if (d < 0 || st < 20)
        return;
    if (dget(2) == 0) {
        mode = STORY;
        st = 0;
        wantpy = 0;
    } else {
        load(mid(0, dget(0), LEVELS - 1));
    }
}

function titles() {
    var g = gap();
    if (haslogo) {
        blit(IMG.title, 80 - imgw(IMG.title) / 2, g - logotop);
    } else {
        var t = "SPRING BOTS";
        print(t, 80 - textw(t) / 2, g, 7);
    }
    if ((st >> 4) & 1) {
        var p = "PRESS ANY BUTTON";
        print(p, 80 - textw(p) / 2, 115 - g, 7);
    }
}

function restart() {
    if (!home)
        load(lvl);
}

// Every level can be chosen, and the player walks in to it.
function choose() {
    pick = home ? 0 : lvl;
    mode = PICK;
    held = btn();
}

// The chooser: Prev and Next or the wheel a level at a time, Menu and
// Play a row; Select walks in to it.
function picking() {
    var now = btn(), down = now & ~held;
    held = now;
    pick += wheelsteps();
    if (down & 1) pick--;
    if (down & 2) pick++;
    if (down & 4) pick -= 8;
    if (down & 8) pick += 8;
    pick = mid(0, pick, LEVELS - 1);
    if (down & 16)
        enter(pick, eside);
}

// The chooser: the level's island drawn small, five pixels a cell, in
// its sea; its bests; and a pip for each level, gold once it is solved.
function chooser() {
    cls(17);
    var t = "LEVEL " + (pick + 1);
    print(t, 80 - textw(t) / 2, 4, 7);
    if (thumbof != pick) {
        for (var k = 0; k < 512; k++)
            thumb[k] = 255;
        thumbw = loadmap(MAP.level01 + pick, thumb);
        thumbh = 0;
        while (thumbh < 32 && thumb[thumbh * thumbw] != 255)
            thumbh++;
        thumbof = pick;
    }
    rectfill(30, 14, 129, 79, 12);
    rect(29, 13, 130, 80, 7);
    var x0 = 80 - flr(thumbw * 5 / 2), y0 = 47 - flr(thumbh * 5 / 2);
    for (var pass = 0; pass < 2; pass++)
        for (var y = 0; y < thumbh; y++)
            for (var x = 0; x < thumbw; x++) {
                var v = thumb[y * thumbw + x];
                if (v == WALL)
                    continue;
                var sx = x0 + x * 5, sy = y0 + y * 5;
                if (pass == 0) {
                    rectfill(sx - 1, sy - 1, sx + 5, sy + 5, 7);
                    continue;
                }
                rectfill(sx, sy, sx + 4, sy + 4, (x + y) & 1 ? 33 : 34);
                if (v >= FLOWERS && v < FLAT)
                    rectfill(sx + 1, sy + 1, sx + 3, sy + 3, (x * 3 + y) % 3 == 0 ? 10 : (x + y) & 1 ? 14 : 7);
                else if (v < FLOWERS)
                    rectfill(sx, sy, sx + 4, sy + 4, v == 0 ? 14 : v == 16 ? 6 : v == 32 ? 8 : 9);
            }
    var blink = (frame() >> 3) & 1 ? 7 : 6;
    if (pick > 0)
        print("<", 21, 44, blink);
    if (pick < LEVELS - 1)
        print(">", 135, 44, blink);
    var bm = dget(BESTMOVES + pick), bt = dget(BESTTIME + pick);
    if (bm > 0) {
        var a = clock(bt), b = bm + " MOVES";
        var x = 80 - (9 + textw(a) + 10 + textw(b)) / 2;
        crown(x, 85);
        print(a, x + 9, 87, 7);
        print(b, x + 19 + textw(a), 87, 7);
    } else {
        var u = "NOT SOLVED YET";
        print(u, 80 - textw(u) / 2, 87, 6);
    }
    for (var n = 0; n < LEVELS; n++) {
        var cx0 = 20 + (n & 15) * 8, cy0 = 101 + (n >> 4) * 9;
        if (n == pick)
            circ(cx0, cy0, 4, 7);
        circfill(cx0, cy0, 2, dget(BESTMOVES + n) > 0 ? 10 : 5);
    }
}

// n is a level, from 0, or -1 for home.
function load(n) {
    lvl = n;
    home = n < 0;
    if (!home)
        dset(0, n);
    loadmap(home ? MAP.home : MAP.level01 + n);
    var k = mapobj(objs, 2);
    for (var i = 0; i < k; i++) {
        var x = objs[i * 5 + 1] >> 3, y = objs[i * 5 + 2] >> 3;
        if (objs[i * 5] == OBJ.arrive) {
            ax = x; ay = y; aside = mapprop(i, "side");
            var pv = mapprop(i, "par");
            parmoves = pv == null ? 0 : pv;
        } else {
            ex = x; ey = y; eside = mapprop(i, "side");
        }
    }
    mode = PLAY;
    bn = 0;
    wn = 0;
    panx = 0; pany = 0; wantpx = 0; wantpy = 0;
    cheer = 0;
    asleep = 0; think = 0; shout = 0; roofstate = home ? 2 : 0; roofy = 0.0;
    actor = -1;
    trn = 0;
    moves = 0;
    startat = frame();
    potstate = 3;             // the flower he stomped, still on the floor
    potx = HX + 21.0;
    poty = HY + 17.0;
    for (var i = 0; i < 4; i++)
        zt[i] = 0;
    count = 0;
    me = -1;
    blooms = 0;
    hn = 0;
    won = 0;
    want = -1;
    banner = 70;
    for (var y = 0; y < maph(); y++) {
        for (var x = 0; x < mapw(); x++) {
            var v = mget(x, y);
            if (v < ROBOTS * 16 && (v & 15) < 2 && count < N) {
                if (v >> 4 == PLAYER && me < 0)
                    me = count;
                spawn(x, y, v >> 4, v & 1);
                v = FLAT;
            }
            mset(x, y, v);
        }
    }
    // A wall with no floor beside it is sea, and so is a wall touching that
    // sea or the edge of the map: the land is an island the shape of the
    // level, its grass meeting the water, with rock only inside. The sea is
    // solid like a wall.
    for (var y = 0; y < maph(); y++)
        for (var x = 0; x < mapw(); x++)
            if (mget(x, y) >= WALL && !nearfloor(x, y))
                mset(x, y, SHORE);
    for (var y = 0; y < maph(); y++)
        for (var x = 0; x < mapw(); x++)
            if (mget(x, y) == WALL && (!island(x, y - 1) || !island(x + 1, y) ||
                                       !island(x, y + 1) || !island(x - 1, y)))
                mset(x, y, 255);     // marked, not yet sea: no chain
    for (var y = 0; y < maph(); y++)
        for (var x = 0; x < mapw(); x++)
            if (mget(x, y) == 255)
                mset(x, y, SHORE);
    for (var y = 0; y < maph(); y++) {
        for (var x = 0; x < mapw(); x++) {
            if (mget(x, y) != SHORE)
                mset(x, y, look(x, y, mget(x, y)));
            var b = (fget(mget(x, y)) & FLAG.flowers) != 0 ? 1 : 0;
            bloom[y * mapw() + x] = b;
            blooms += b;
        }
    }
    if (me < 0) {
        me = count;
        spawn(ax, ay, PLAYER, 0);
    }
    grp[me] = 1;
    attach(0);
    for (var i = 0; i < count; i++)
        latch[i] = 1.0;
    // on the screen's 8-pixel grid, so rows and columns run on from one
    // island's screen to the next
    sox = ((160 - mapw() * 8) >> 4) << 3;
    soy = ((120 - maph() * 8) >> 4) << 3;
    paint();
    // glints on open sea, where three pixels in a row are sea
    target(ground);
    for (var k = 0; k < GLINTS; k++) {
        var x = 0, y = 0;
        for (var tries = 0; tries < 20; tries++) {
            x = rnd(GW - 3);
            y = rnd(GH);
            if (pget(x, y) == SEA && pget(x + 1, y) == SEA && pget(x + 2, y) == SEA)
                break;
        }
        glx[k] = x;
        gly[k] = y;
    }
    target(SCREEN);
}

function nearfloor(x, y) {
    for (var b = -1; b <= 1; b++)
        for (var a = -1; a <= 1; a++) {
            var v = mget(x + a, y + b);
            if (x + a >= 0 && y + b >= 0 && x + a < mapw() && y + b < maph() &&
                v < WALL)
                return true;
        }
    return false;
}

function island(x, y) {
    if (x < 0 || y < 0 || x >= mapw() || y >= maph())
        return 0;
    var v = mget(x, y);
    return v >= SHORE && v < SHORE + 16 ? 0 : 1;
}

// The ground image is the screen and PAD more all round, for the view to
// pan over: the sea, the island on it, and the shore wherever land meets
// it -- a cliff below the land, foam all round. At home, the house.
function paint() {
    target(ground);
    cls(SEA);
    for (var k = 0; k < CW * CH; k++)
        lands[k] = 0;
    // the map's border is always sea, so all the land, and every cell of
    // shore beside it, is on the map
    var w = mapw(), h = maph(), k0 = cell(0, 0);
    palt(0, false);
    for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
            var l = island(x, y);
            lands[k0 + y * CW + x] = l;
            if (l)
                spr(mget(x, y), PAD + sox + x * 8, PAD + soy + y * 8);
        }
    }
    palt();
    for (var y = 0; y < h; y++)
        for (var x = 0; x < w; x++)
            if (!lands[k0 + y * CW + x])
                shore(x, y, k0 + y * CW + x);
    if (home) {
        var hx = PAD + sox + HX, hy = PAD + soy + HY;
        blitpart(IMG.world, 0, 16, 32, 32, hx, hy);
        blitpart(IMG.world, 32, 0, 8, 8, hx + 19, hy + 13);     // the table
    }
    target(SCREEN);
}

// A map cell's place in `lands`; -1 off the ground, or on its rim, where
// a cell has no neighbours all round.
function cell(x, y) {
    var gx = (PAD + sox >> 3) + x, gy = (PAD + soy >> 3) + y;
    if (gx < 1 || gy < 1 || gx >= CW - 1 || gy >= CH - 1)
        return -1;
    return gy * CW + gx;
}

// The shore drawn on sea cell k, from the land round it.
function shore(x, y, k) {
    var at = PAD + sox + x * 8, bt = PAD + soy + y * 8;
    var m = (lands[k - CW] != 0) | (lands[k + 1] != 0) << 1 |
            (lands[k + CW] != 0) << 2 | (lands[k - 1] != 0) << 3;
    if (m)
        spr(SHORE + m, at, bt);
    if (lands[k - CW - 1] && !(m & 9)) spr(CORNER, at, bt);
    if (lands[k - CW + 1] && !(m & 3)) spr(CORNER + 1, at, bt);
    if (lands[k + CW + 1] && !(m & 6)) spr(CORNER + 2, at, bt);
    if (lands[k + CW - 1] && !(m & 12)) spr(CORNER + 3, at, bt);
}

// A bridge cell raised or sunk: it and the cells round it drawn again,
// the shore following the new edge.
function bridge(x, y, up) {
    var k = cell(x, y);
    if (k < 0)
        return;
    lands[k] = up ? 2 : 0;
    repaint(x - 1, y - 1, x + 1, y + 1);
}

// The cells x0, y0 to x1, y1 drawn again from `lands`; no glints on land.
function repaint(x0, y0, x1, y1) {
    target(ground);
    for (var y = y0; y <= y1; y++) {
        for (var x = x0; x <= x1; x++) {
            var j = cell(x, y);
            if (j < 0)
                continue;
            var at = PAD + sox + x * 8, bt = PAD + soy + y * 8;
            palt(0, false);
            if (lands[j] == 1)
                spr(mget(x, y), at, bt);
            else if (lands[j] == 2)
                spr(look(x, y, FLAT), at, bt);
            else
                rectfill(at, bt, at + 7, bt + 7, SEA);
            palt();
            if (!lands[j])
                shore(x, y, j);
        }
    }
    target(SCREEN);
    for (var g = 0; g < GLINTS; g++) {
        var x = (glx[g] - PAD - sox) >> 3, y = (gly[g] - PAD - soy) >> 3;
        var j = cell(x, y);
        if (j >= 0 && lands[j])
            gly[g] = -9;
    }
}

function tile(x, y, v) {
    mset(x, y, v);
    target(ground);
    palt(0, false);
    spr(v, PAD + sox + x * 8, PAD + soy + y * 8);
    palt();
    target(SCREEN);
}

// The tile a cell is drawn with: a flower or flat grass picked by its
// place, and a wall joined to the walls beside it, or a rock or stump on
// its own. The same map always looks the same.
function look(x, y, v) {
    var h = (x * 7 + y * 13 + x * y) & 7;
    if (v >= FLOWERS && v < FLAT)
        return FLOWERS + h;
    if (v >= FLAT && v < FLAT + 8)
        return FLAT + (h & 3);
    if (v < WALL)
        return v;
    var m = wallsby(x, y);
    if (m == 0)
        return ODDS[h % 4];
    if (m == 2 && wallsby(x + 1, y) == 8)
        return PAIRS + (h & 2);
    if (m == 8 && wallsby(x - 1, y) == 2)
        return look(x - 1, y, v) + 1;
    return WALL + m;
}

// The walls beside x, y: 1 above, 2 right, 4 below, 8 left.
function wallsby(x, y) {
    return iswall(x, y - 1) | iswall(x + 1, y) << 1 |
           iswall(x, y + 1) << 2 | iswall(x - 1, y) << 3;
}

function iswall(x, y) {
    var v = mget(x, y);         // 0 off the map; a wall, a rock or a log
    return v >= ODDS[0] && v < WALL + 16 ? 1 : 0;
}

function spawn(x, y, k, f) {
    var i = count++;
    cx[i] = x; cy[i] = y;
    tx[i] = x * 8; ty[i] = y * 8;
    px[i] = x * 8.0; py[i] = y * 8.0;
    vx[i] = 0.0; vy[i] = 0.0;
    kind[i] = k; row[i] = k; face[i] = f;
    grp[i] = 0; par[i] = -1; depth[i] = 0;
    hop[i] = 0.0; hv[i] = 0.0; squash[i] = 0; glow[i] = 0; strain[i] = 0.0;
    arriving[i] = 0; stomping[i] = 0; planting[i] = 0; opening[i] = 0;
    due[i] = 0;
    blinkat[i] = frame() + rnd(90) + 20;
    lookat[i] = frame() + rnd(120) + 40;
}

// A bridge is land to walk on, except in play: the level is the island
// alone.
function solid(x, y) {
    if (onbridge(x, y))
        return mode == PLAY;
    if (home && x >= HX >> 3 && x < (HX >> 3) + 4 && y >= HY >> 3 && y < (HY >> 3) + 4)
        return true;
    if (x < 0 || y < 0 || x >= mapw() || y >= maph())
        return true;
    return (fget(mget(x, y)) & FLAG.solid) != 0;
}

function onbridge(x, y) {
    var k = cell(x, y);
    return k >= 0 && lands[k] == 2;
}

function robotat(x, y) {
    for (var i = 0; i < count; i++)
        if (cx[i] == x && cy[i] == y)
            return i;
    return -1;
}

// Off the screen as the island sits, without the view's pan.
function offscreen(x, y) {
    var sx = (sox >> 3) + x, sy = (soy >> 3) + y;
    return sx < 0 || sy < 0 || sx >= 20 || sy >= 15;
}

// Every free robot touching the group joins it, each wired to the one it
// touches; one that joins can bring in another touching it.
function attach(wait) {
    var more = true;
    while (more) {
        more = false;
        for (var i = 0; i < count; i++) {
            if (grp[i])
                continue;
            for (var j = 0; j < count; j++) {
                if (!grp[j] || abs(cx[i] - cx[j]) + abs(cy[i] - cy[j]) != 1)
                    continue;
                grp[i] = 1;
                par[i] = j;
                depth[i] = depth[j] + 1;
                latch[i] = 0.0;
                latchat[i] = frame() + wait + depth[j] * D;
                more = true;
                break;
            }
        }
    }
}

function latching() {
    for (var i = 0; i < count; i++)
        if (grp[i] && latch[i] < 1.0)
            return true;
    return false;
}

// A wire still pulled hard holds the next step back: the more robots in
// tow, the heavier the walk.
function taut() {
    for (var i = 0; i < count; i++)
        if (grp[i] && i != me && abs(strain[i]) > 3.0)
            return true;
    return false;
}

function setbloom(x, y, b) {
    var k = y * mapw() + x;
    blooms += b - bloom[k];
    bloom[k] = b;
}

// A step, as generator.py's simulate_move takes it: the growers leave a
// flower behind, the group moves and gathers any robot it now touches,
// then every robot standing on a flower stomps it, a bud becoming a grower.
// Out of play -- a level finished, or on the way to the next -- the player
// walks alone: nothing grows or is wired on, and a robot in the way hops
// over to the cell the player leaves.
function trystep(d) {
    var dx = DX[d], dy = DY[d];
    var stuck = -1;
    for (var i = 0; i < count; i++)
        if (grp[i] && solid(cx[i] + dx, cy[i] + dy))
            stuck = i;
    stepface = d;
    if (stuck >= 0) {
        bump(stuck, dx, dy);
        return;
    }
    settle();
    if (mode != PLAY) {
        var j = robotat(cx[me] + dx, cy[me] + dy);
        if (j >= 0) {
            cx[j] = cx[me]; cy[j] = cy[me];
            tx[j] = cx[j] * 8; ty[j] = cy[j] * 8;
            hv[j] = -3.0;
            roamat[j] = frame() + 30;
        }
        cx[me] += dx;
        cy[me] += dy;
        if (due[me] <= frame())
            due[me] = frame();
        if (mode == FREE && offscreen(cx[me], cy[me]))
            cross();
        return;
    }
    save();
    moves++;
    for (var i = 0; i < count; i++) {
        if (!grp[i])
            continue;
        if (kind[i] == GROWER) {
            setbloom(cx[i], cy[i], 1);
            planting[i] = 1;
            gx[i] = cx[i];
            gy[i] = cy[i];
        }
        cx[i] += dx;
        cy[i] += dy;
        if (due[i] <= frame())
            due[i] = frame() + depth[i] * D;
    }
    attach(6);
    for (var i = 0; i < count; i++) {
        if (!grp[i] || !bloom[cy[i] * mapw() + cx[i]])
            continue;
        setbloom(cx[i], cy[i], 0);
        stomping[i] = 1;
        sx[i] = cx[i];
        sy[i] = cy[i];
        if (kind[i] == BUD) {
            kind[i] = GROWER;
            opening[i] = 1;
        }
    }
    if (blooms == 0 && everyone())
        won = 1;
}

function everyone() {
    for (var i = 0; i < count; i++)
        if (!grp[i])
            return false;
    return true;
}

// Shows at once whatever the last step has still to show, before the next.
function settle() {
    for (var i = 0; i < count; i++) {
        if (planting[i])
            plant(i);
        if (stomping[i])
            stomp(i);
        if (opening[i])
            open(i);
    }
}

// The whole group lurches at the wall and springs back.
function bump(stuck, dx, dy) {
    for (var i = 0; i < count; i++) {
        if (!grp[i])
            continue;
        face[i] = stepface;
        vx[i] += dx * 1.4;
        vy[i] += dy * 1.4;
    }
    squash[stuck] = 6;
    var x = px[stuck] + 3 + dx * 4, y = py[stuck] + 4 + dy * 4;
    particles.emit(sparks, 6, x, y, -dx * 0.9, -dy * 0.9 - 0.6, 0.7, 9, 10);
    particles.emit(sparks, 3, x, y, -dx * 0.6, -dy * 0.6 - 0.9, 0.5, 6, 7);
    particles.emit(dust, 5, x, y + 2, -dx * 0.4, -0.3, 0.4, 14, 6);
    shake = 4;
    rest = 10;
}

// Undo keeps the robots and the flowers as each step found them.
function save() {
    if (hn == HMAX) {
        copy(hist, 0, hist, SNAP, (HMAX - 1) * SNAP);
        copy(histb, 0, histb, 300, (HMAX - 1) * 300);
        hn--;
    }
    var o = hn * SNAP;
    for (var i = 0; i < count; i++) {
        hist[o++] = cx[i];
        hist[o++] = cy[i];
        hist[o++] = grp[i];
        hist[o++] = par[i] + 1;
        hist[o++] = depth[i];
        hist[o++] = kind[i];
    }
    copy(histb, hn * 300, bloom, 0, 300);
    hn++;
}

function undo() {
    if (hn == 0 || won)
        return;
    hn--;
    moves = max(0, moves - 1);
    var o = hn * SNAP;
    blooms = 0;
    for (var i = 0; i < count; i++) {
        cx[i] = hist[o++];
        cy[i] = hist[o++];
        grp[i] = hist[o++];
        par[i] = hist[o++] - 1;
        depth[i] = hist[o++];
        kind[i] = hist[o++];
        row[i] = kind[i];
        tx[i] = cx[i] * 8;
        ty[i] = cy[i] * 8;
        latch[i] = 1.0;
        arriving[i] = 0; stomping[i] = 0; planting[i] = 0; opening[i] = 0;
        particles.emit(dust, 3, px[i] + 3, py[i] + 6, 0.0, -0.3, 0.5, 10, 6);
    }
    copy(bloom, 0, histb, hn * 300, 300);
    for (var y = 0; y < maph(); y++) {
        for (var x = 0; x < mapw(); x++) {
            var v = mget(x, y), b = bloom[y * mapw() + x];
            blooms += b;
            if (v >= FLOWERS && v < FLAT + 8)
                mset(x, y, look(x, y, b ? FLOWERS : FLAT));
        }
    }
    paint();
}

// One press of Prev, Next, Menu or Play is one step left, right, up or
// down; holding a button does not repeat it. A turn of the wheel (4
// clicks, an arrow key in the IDE) is a step down clockwise, up against.
// Select undoes a step.
function readdir() {
    var now = btn(), down = now & ~held;
    held = now;
    if (down & 1) return 1;
    if (down & 2) return 2;
    if (down & 4) return 3;
    if (down & 8) return 0;
    if (down & 16) return 4;
    var s = wheelsteps();
    if (s > 0) return 0;
    if (s < 0) return 3;
    return -1;
}

function update() {
    if (mode == PICK) {
        picking();
        return;
    }
    var d = readdir();
    if (rest > 0)
        rest--;
    if (banner > 0)
        banner--;
    if (cheer > 0)
        cheer--;
    var ready = rest == 0 && !latching() && !taut() &&
                abs(tx[me] - px[me]) + abs(ty[me] - py[me]) < 1.0;
    if (mode == TITLE)
        titled(d);
    else if (mode == STORY || mode == BED)
        script(d, ready);
    else if (mode == INTRO)
        intro(d);
    else if (mode == REDIN)
        redin(d);
    else if (mode == CROSS)
        walkin(ready);
    else if (mode == FREE && onbridge(cx[me], cy[me]))
        onward(ready);
    else if (d >= 0 && (mode == FREE || !won))
        want = d;
    else if (mode == FREE)
        homeward(ready);
    if (want == 4) {
        if (mode == PLAY)
            undo();
        want = -1;
    } else if (ready && want >= 0) {
        trystep(want);
        want = -1;
    }

    for (var i = 0; i < count; i++) {
        if (grp[i] && frame() >= due[i] &&
            (tx[i] != cx[i] * 8 || ty[i] != cy[i] * 8)) {
            tx[i] = cx[i] * 8;
            ty[i] = cy[i] * 8;
            face[i] = stepface;
            arriving[i] = 1;
            if (planting[i])
                plant(i);
        }
        move(i);
        if (arriving[i] && abs(tx[i] - px[i]) + abs(ty[i] - py[i]) < 2.0) {
            arriving[i] = 0;
            if (stomping[i])
                stomp(i);
            if (opening[i])
                open(i);
        }
        grow(i);
        mood(i);
    }
    for (var n = 0; n < 2; n++)
        for (var i = 0; i < count; i++)
            if (par[i] >= 0 && latch[i] >= 1.0)
                hold(i, par[i]);

    if (won && mode == PLAY)
        finish();
    if (mode == FREE)
        caper();
    blocks();
    panx += mid(-5, wantpx - panx, 5);
    pany += mid(-5, wantpy - pany, 5);
    for (var k = 0; k < 4; k++) {
        if (zt[k] > 0 && ++zt[k] > 70)
            zt[k] = 0;
        zx[k] += 0.25;
        zy[k] -= 0.3;
    }
    if (potstate == 1)
        fall();
    if (roofstate == 1 || roofstate == 3)
        roofmove();
    particles.step(petals);
    particles.step(sparks);
    particles.step(dust);
    if (frame() % 4 == 0)
        lap(frame());
}

// Waves roll in: the four bands of water out from the shore (colours 35
// at the shore to 38) each lighten a shade as a crest passes, from the
// outermost in, to white at the crest; then a calm.
var SHADE = [28, 12, 7, 7];
var CALM = [2, 1, 1, 0];
function lap(t) {
    var c = 4.5 - (t % 72) / 8.0;
    for (var k = 0; k < 4; k++) {
        var level = CALM[k];
        if (abs(k - c) < 0.75)
            level++;
        if (k == 0 && c < 0.0 && c > -1.5)
            level = 3;
        pal(BAND + k, SHADE[min(level, 3)], 1);
    }
}

// A grower leaving a cell: a flower springs up there, unless a robot has
// already landed on it and stomped it this same step.
function plant(i) {
    planting[i] = 0;
    var x = gx[i], y = gy[i];
    if (!bloom[y * mapw() + x]) {
        var pending = false;
        for (var j = 0; j < count; j++)
            if (stomping[j] && sx[j] == x && sy[j] == y)
                pending = true;
        if (!pending)
            return;
    }
    tile(x, y, look(x, y, FLOWERS));
    particles.emit(petals, 5, x * 8 + 4, y * 8 + 5, 0.0, -0.9, 0.6, 14, 27);
    particles.emit(sparks, 3, x * 8 + 4, y * 8 + 4, 0.0, -0.7, 0.5, 10, 7);
}

// A robot landing on flowers flattens them, scattering petals and leaves.
function stomp(i) {
    stomping[i] = 0;
    var x = sx[i], y = sy[i], v = mget(x, y);
    if (!(fget(v) & FLAG.flowers))
        return;
    tile(x, y, look(x, y, FLAT));
    squash[i] = 6;
    var ex = x * 8 + 3, ey = y * 8 + 7;
    particles.emit(petals, 7, ex, ey, 0.0, -1.3, 1.0, 22, PETAL[v - FLOWERS]);
    particles.emit(petals, 5, ex, ey, 0.0, -1.0, 1.1, 16, 26);
    particles.emit(dust, 3, ex, ey, 0.0, -0.2, 0.6, 12, 19);
}

// A bud that stomped a flower opens into a grower.
function open(i) {
    opening[i] = 0;
    row[i] = GROWER;
    hv[i] = -2.2;
    glow[i] = 16;
    particles.emit(petals, 10, px[i] + 3, py[i] + 1, 0.0, -1.4, 1.2, 24, 14);
    particles.emit(sparks, 6, px[i] + 3, py[i], 0.0, -1.0, 1.0, 14, 7);
}

// Every flower gone and every robot wired on: once the last lands, the
// wires let go, the robots caper off, and the bridge to the next island
// rises -- the view panning toward it when the island fills the screen.
function finish() {
    for (var i = 0; i < count; i++)
        if (arriving[i] || stomping[i] || planting[i])
            return;
    dset(1, max(dget(1), min(lvl + 1, LEVELS - 1)));
    took = frame() - startat;
    var bm = dget(BESTMOVES + lvl), bt = dget(BESTTIME + lvl);
    newmoves = bm == 0 || moves < bm;
    newtime = bt == 0 || took < bt;
    if (newmoves)
        dset(BESTMOVES + lvl, moves);
    if (newtime)
        dset(BESTTIME + lvl, took);
    for (var i = 0; i < count; i++) {
        if (i == me || !grp[i])
            continue;
        var p = par[i];
        particles.emit(sparks, 6, (px[i] + px[p]) / 2 + 4, (py[i] + py[p]) / 2 + 5,
                       0.0, -0.8, 0.9, 12, LIGHT[row[i]]);
        grp[i] = 0;
        par[i] = -1;
        latch[i] = 1.0;       // no wire left to grow
        hv[i] = -2.4;
        glow[i] = 12;
        roamat[i] = frame() + 15 + rnd(30);
    }
    mode = FREE;
    cheer = 90;
    bn = 0;                   // the path in, long sunk
    rise(ex, ey, eside, 20);
}

// The exit's bridge, rising a pair at a time from the island. When the
// island fills the screen, the view moves to show at least three pairs.
function rise(x, y, d, wait) {
    var more = max(0, 3 - lay(x, y, d, wait, false)) * 8;
    wantpx = DX[d] * more;
    wantpy = DY[d] * more;
}

// A bridge from x, y toward side d, two cells wide, to one cell past the
// screen's edge: rising a pair at a time from `wait` ticks on, or up at
// once. The second lane goes on the side where the island has land beside
// x, y, to meet it flush; where it has none, the lane runs back under the
// island's edge as well, filling the notch. Returns the pairs on screen.
function lay(x, y, d, wait, now) {
    var ox = abs(DY[d]), oy = abs(DX[d]);       // across the bridge
    if (!isisland(x + ox, y + oy) && isisland(x - ox, y - oy)) {
        ox = -ox;
        oy = -oy;
    }
    var seen = 0;
    for (var k = 1; bn < BMAX - 1; k++) {
        var x1 = x + DX[d] * k, y1 = y + DY[d] * k, t = frame() + wait + k * 6;
        put(x1, y1, t, now);
        put(x1 + ox, y1 + oy, t + 3, now);
        if (offscreen(x1, y1))
            break;
        seen++;
    }
    for (var j = 0; bn < BMAX; j++) {
        var lx = x - DX[d] * j + ox, ly = y - DY[d] * j + oy;
        var c = cell(lx, ly), b = cell(x - DX[d] * j, y - DY[d] * j);
        if (c < 0 || b < 0 || lands[c] != 0 || lands[b] != 1)
            break;
        put(lx, ly, frame() + wait + 9, now);
    }
    return seen;
}

function isisland(x, y) {
    var k = cell(x, y);
    return k >= 0 && lands[k] == 1;
}

// A bridge cell, rising at tick t, or (now) up already, to be drawn.
function put(x, y, t, now) {
    bx[bn] = x; by[bn] = y; bup[bn] = now ? 1 : 0; bto[bn] = 1; bat[bn] = t;
    bn++;
    var k = cell(x, y);
    if (now && k >= 0)
        lands[k] = 2;
}

// Bridge cells rising or sinking when their time comes, with a splash.
function blocks() {
    for (var k = 0; k < bn; k++) {
        if (bup[k] == bto[k] || frame() < bat[k])
            continue;
        bup[k] = bto[k];
        bridge(bx[k], by[k], bup[k]);
        var x = bx[k] * 8 + 4, y = by[k] * 8 + 6;
        particles.emit(sparks, 6, x, y, 0.0, -1.0, 0.8, 12, 7);
        particles.emit(sparks, 4, x, y, 0.0, -0.6, 0.6, 10, 12);
        if (bup[k])
            particles.emit(dust, 3, x, y, 0.0, -0.3, 0.5, 10, 22);
    }
}

// Freed robots caper about the island, keeping away from the player.
function caper() {
    for (var i = 0; i < count; i++) {
        if (i == me || frame() < roamat[i] ||
            abs(tx[i] - px[i]) + abs(ty[i] - py[i]) > 1.0)
            continue;
        roamat[i] = frame() + 18 + rnd(40);
        hv[i] = -2.2;
        if (rnd(3) == 0) {
            glow[i] = 10;
            particles.emit(sparks, 4, px[i] + 3, py[i], 0.0, -1.1, 0.9, 12,
                           LIGHT[row[i]]);
        }
        var best = -1, far = -1, d0 = rnd(4);
        for (var n = 0; n < 4; n++) {
            var d = (d0 + n) & 3, x = cx[i] + DX[d], y = cy[i] + DY[d];
            if (x < 0 || y < 0 || x >= mapw() || y >= maph() ||
                solid(x, y) || onbridge(x, y) || robotat(x, y) >= 0)
                continue;
            var far1 = abs(x - cx[me]) + abs(y - cy[me]) + rnd(3);
            if (far1 > far) {
                far = far1;
                best = d;
            }
        }
        if (best < 0)
            continue;
        cx[i] += DX[best];
        cy[i] += DY[best];
        tx[i] = cx[i] * 8;
        ty[i] = cy[i] * 8;
        face[i] = best;
    }
}

// Walking off the screen: straight to the next island, where a bridge of
// land runs from the screen's edge to the level's start, and the player
// walks in along it. After home comes level 1; after the last level, home.
function cross() {
    enter(home ? 0 : lvl == LEVELS - 1 ? -1 : lvl + 1, eside);
}

// Level n (-1 home) loaded, with the player to walk in to it; d is the
// side he left the last island by.
function enter(n, d) {
    load(n);
    if (home) {
        aside = 3 - d;
        ax = HOMEIN[aside * 2];
        ay = HOMEIN[aside * 2 + 1];
    }
    for (var i = 0; i < count; i++) {
        if (i != me) {
            grp[i] = 0;
            par[i] = -1;
        }
    }
    banner = 0;
    if (lvl == ORANGE) {
        for (var i = 0; i < count; i++)
            if (kind[i] == BUD)
                actor = i;
        if (actor >= 0) {
            cx[me] = -9;
            cy[me] = -9;
            tx[me] = -72; ty[me] = -72; px[me] = -72.0; py[me] = -72.0;
            startintro();
            return;
        }
    }
    if (lvl == RED) {
        for (var i = 0; i < count; i++)
            if (kind[i] == GROWER)
                actor = i;
        if (actor >= 0) {
            cx[me] = -9;
            cy[me] = -9;
            tx[me] = -72; ty[me] = -72; px[me] = -72.0; py[me] = -72.0;
            startred();
            return;
        }
    }
    walkon();
}

// The bridge in from the screen's edge to the level's start, up at once,
// and the player at its far end to walk in along it.
function walkon() {
    var dx = DX[aside], dy = DY[aside];
    var n = 1;
    while (!offscreen(ax + dx * n, ay + dy * n) && n < BMAX / 2 - 1)
        n++;
    wn = 0;
    wk = 0;
    lay(ax, ay, aside, 0, true);
    for (var k = n - 1; k >= 0; k--) {
        wx[wn] = ax + dx * k;
        wy[wn] = ay + dy * k;
        wn++;
    }
    var x0 = ax, y0 = ay, x1 = ax, y1 = ay;
    for (var k = 0; k < bn; k++) {
        x0 = min(x0, bx[k]); y0 = min(y0, by[k]);
        x1 = max(x1, bx[k]); y1 = max(y1, by[k]);
    }
    repaint(x0 - 1, y0 - 1, x1 + 1, y1 + 1);
    cx[me] = ax + dx * n;
    cy[me] = ay + dy * n;
    tx[me] = cx[me] * 8;
    ty[me] = cy[me] * 8;
    px[me] = cx[me] * 8.0;
    py[me] = cy[me] * 8.0;
    face[me] = 3 - aside;
    mode = CROSS;
}

// ---------------------------------------------------------------- the grower
//
// On level RED, where the red grower is met, it comes first, over the
// player's own bridge, and a flower springs up in every cell it steps
// off. At the island it leaps to its place, dozes and switches off; the
// player walks in along its trail and stomps every flower of it. The
// level begins as it always does. Any button skips to the walk in.

function startred() {
    bud = actor;
    hx0 = cx[actor];
    hy0 = cy[actor];
    var n = 1;
    while (!offscreen(ax + DX[aside] * n, ay + DY[aside] * n) && n < BMAX / 2 - 1)
        n++;
    cx[actor] = ax + DX[aside] * n;
    cy[actor] = ay + DY[aside] * n;
    tx[actor] = cx[actor] * 8; ty[actor] = cy[actor] * 8;
    px[actor] = cx[actor] * 8.0; py[actor] = cy[actor] * 8.0;
    face[actor] = 3 - aside;
    lay(ax, ay, aside, 10, false);
    mode = REDIN;
    ph = 0;
    pt = 0;
    introat = frame();
}

function redin(d) {
    pt++;
    if (d >= 0 && frame() - introat > 15) {
        endred();
        return;
    }
    var i = bud;
    var settled = abs(tx[i] - px[i]) + abs(ty[i] - py[i]) < 1.0;
    if (ph == 0) {                    // over the bridge, planting
        if (!settled)
            return;
        if (cx[i] == ax && cy[i] == ay) {
            sprout(ax, ay);
            cx[i] = hx0; cy[i] = hy0;
            tx[i] = hx0 * 8; ty[i] = hy0 * 8;
            hv[i] = -3.6;
            face[i] = 0;
            ph = 1;
            pt = 0;
            return;
        }
        var k = cell(cx[i] - DX[aside], cy[i] - DY[aside]);
        if (k >= 0 && lands[k] != 0) {
            sprout(cx[i], cy[i]);
            walk(i, 3 - aside);
        }
    } else if (ph == 1) {             // the leap home
        if (settled && pt > 25) {
            particles.emit(dust, 6, px[i] + 4, py[i] + 7, 0.0, -0.3, 0.8, 12, 22);
            shake = 3;
            ph = 2;
            pt = 0;
        }
    } else {                          // a doze, and out
        if (pt == 20 || pt == 70)
            snore(i);
        if (pt == 110) {
            actor = -1;
            particles.emit(sparks, 4, px[i] + 3, py[i] + 1, 0.0, -0.5, 0.5, 10, 6);
        }
        if (pt == 150)
            endred();
    }
}

// Straight to the walk in: the grower in its place, switched off, and the
// whole trail of flowers down the bridge.
function endred() {
    place(bud);
    actor = -1;
    bn = 0;                   // walkon lays the bridge again, all up
    var n = 0;
    while (!offscreen(ax + DX[aside] * n, ay + DY[aside] * n) && n < BMAX / 2 - 1)
        n++;
    walkon();
    for (var k = 0; k <= n; k++) {
        var x = ax + DX[aside] * k, y = ay + DY[aside] * k, seen = false;
        for (var j = 0; j < trn; j++)
            if (trx[j] == x && try0[j] == y)
                seen = true;
        if (!seen && trn < BMAX) {
            trx[trn] = x; try0[trn] = y; trn++;
        }
    }
    for (var j = 0; j < trn; j++) {
        trup[j] = 1;
        bloomat(trx[j], try0[j]);
    }
}

// A flower of the trail springs up at x, y.
function sprout(x, y) {
    if (trn >= BMAX)
        return;
    trx[trn] = x; try0[trn] = y; trup[trn] = 1; trn++;
    bloomat(x, y);
    particles.emit(petals, 3, x * 8 + 4, y * 8 + 5, 0.0, -0.8, 0.6, 10, 14);
}

// A flower drawn on the ground at x, y, which the map knows nothing of.
function bloomat(x, y) {
    if (cell(x, y) < 0)
        return;
    target(ground);
    palt(0, false);
    spr(FLOWERS + ((x * 7 + y * 13 + x * y) & 7), PAD + sox + x * 8, PAD + soy + y * 8);
    palt();
    target(SCREEN);
}

// The player stomps any trail flower at x, y flat.
function tread(x, y) {
    for (var j = 0; j < trn; j++) {
        if (!trup[j] || trx[j] != x || try0[j] != y)
            continue;
        trup[j] = 0;
        repaint(x, y, x, y);
        squash[me] = 6;
        particles.emit(petals, 6, x * 8 + 4, y * 8 + 6, 0.0, -1.2, 1.0, 18, 14);
        particles.emit(dust, 2, x * 8 + 4, y * 8 + 7, 0.0, -0.2, 0.5, 10, 19);
    }
}

// ---------------------------------------------------------------- the bud
//
// On level ORANGE, where the orange bud is met, it comes first: up a
// bridge from where the player will leave, to its place, where it dozes
// off and dreams its rule -- an orange robot stomps a flower, turns red,
// and flowers spring up behind it -- then switches off. The player walks
// in after. Any button skips to that.

function startintro() {
    bud = actor;
    hx0 = cx[actor];
    hy0 = cy[actor];
    var n = 1;
    while (!offscreen(ex + DX[eside] * n, ey + DY[eside] * n) && n < BMAX / 2 - 1)
        n++;
    cx[actor] = ex + DX[eside] * n;
    cy[actor] = ey + DY[eside] * n;
    tx[actor] = cx[actor] * 8; ty[actor] = cy[actor] * 8;
    px[actor] = cx[actor] * 8.0; py[actor] = cy[actor] * 8.0;
    face[actor] = 3 - eside;
    rise(ex, ey, eside, 10);
    mode = INTRO;
    ph = 0;
    pt = 0;
    introat = frame();
}

function intro(d) {
    pt++;
    if (d >= 0 && frame() - introat > 15) {
        endintro();
        return;
    }
    var i = bud;
    var settled = abs(tx[i] - px[i]) + abs(ty[i] - py[i]) < 1.0;
    if (ph == 0) {                    // over the bridge, as it rises
        if (cx[i] == ex && cy[i] == ey) {
            ph = 1;
        } else if (settled) {
            var k = cell(cx[i] - DX[eside], cy[i] - DY[eside]);
            if (k >= 0 && lands[k] != 0)
                walk(i, 3 - eside);
        }
    } else if (ph == 1) {             // to its place
        if (cx[i] == hx0 && cy[i] == hy0) {
            if (settled) {
                face[i] = 0;
                ph = 2;
                pt = 0;
                for (var k = 0; k < bn; k++) {
                    bto[k] = 0;
                    bat[k] = frame() + 10 + (abs(bx[k] - ex) + abs(by[k] - ey)) * 5;
                }
                wantpx = 0;
                wantpy = 0;
            }
        } else if (settled && !stepto(i, hx0, hy0)) {
            place(i);
        }
    } else {                          // a doze, the dream, and out
        if (pt == 10 || pt == 225)
            snore(i);
        if (pt == 30 || pt == 38 || pt == 46)
            think++;
        if (pt == 54)
            think = 4;
        if (pt == 214)
            think = 0;
        if (pt == 260) {
            actor = -1;
            particles.emit(sparks, 4, px[i] + 3, py[i] + 1, 0.0, -0.5, 0.5, 10, 6);
        }
        if (pt == 300)
            endintro();
    }
}

// Straight to the end of the intro: the bud in its place, switched off,
// its bridge gone, and the player's walk in begun.
function endintro() {
    place(bud);
    actor = -1;
    think = 0;
    for (var k = 0; k < bn; k++)
        if (bup[k])
            bridge(bx[k], by[k], 0);
    bn = 0;
    wantpx = 0;
    wantpy = 0;
    walkon();
}

// The bud put straight in its place.
function place(i) {
    cx[i] = hx0; cy[i] = hy0;
    tx[i] = hx0 * 8; ty[i] = hy0 * 8;
    px[i] = hx0 * 8.0; py[i] = hy0 * 8.0;
    face[i] = 0;
}

function walk(i, d) {
    cx[i] += DX[d];
    cy[i] += DY[d];
    tx[i] = cx[i] * 8;
    ty[i] = cy[i] * 8;
    face[i] = d;
}

// A step for robot i toward x, y, round flowers and robots; false when
// there is no way.
function stepto(i, x, y) {
    route(x, y, 1);
    var w = mapw(), best = 9999, go = -1;
    for (var d = 0; d < 4; d++) {
        var x1 = cx[i] + DX[d], y1 = cy[i] + DY[d];
        if (x1 < 0 || y1 < 0 || x1 >= w || y1 >= maph())
            continue;
        var n = dist[y1 * w + x1];
        if (n >= 0 && n < best) {
            best = n;
            go = d;
        }
    }
    if (go < 0)
        return false;
    walk(i, go);
    return true;
}

// Once the cheering is done the player walks himself to the exit, the
// shortest way round, and onto the bridge as it rises. A press still
// steps him wherever it says.
var dist = new Int32Array(20 * 15), queue = new Int32Array(20 * 15);
function homeward(ready) {
    if (!ready || want >= 0 || cheer > 40)
        return;
    if (cx[me] == ex && cy[me] == ey) {
        if (onbridge(ex + DX[eside], ey + DY[eside]))
            want = eside;
        return;
    }
    route(ex, ey, false);
    var w = mapw(), h = maph(), best = 9999;
    for (var d = 0; d < 4; d++) {
        var x1 = cx[me] + DX[d], y1 = cy[me] + DY[d];
        if (x1 < 0 || y1 < 0 || x1 >= w || y1 >= h)
            continue;
        var n = dist[y1 * w + x1];
        if (n >= 0 && n < best) {
            best = n;
            want = d;
        }
    }
}

// Each cell's steps to x, y in `dist`, -1 where there is no way; with
// `avoid`, round flowers and robots.
function route(x, y, avoid) {
    var w = mapw(), h = maph(), qn = 1;
    for (var k = 0; k < w * h; k++)
        dist[k] = -1;
    dist[y * w + x] = 0;
    queue[0] = y * w + x;
    for (var q = 0; q < qn; q++) {
        var x0 = queue[q] % w, y0 = flr(queue[q] / w);
        for (var d = 0; d < 4; d++) {
            var x1 = x0 + DX[d], y1 = y0 + DY[d];
            if (x1 < 0 || y1 < 0 || x1 >= w || y1 >= h ||
                dist[y1 * w + x1] >= 0 || solid(x1, y1))
                continue;
            if (avoid && (bloom[y1 * w + x1] || robotat(x1, y1) >= 0))
                continue;
            dist[y1 * w + x1] = dist[queue[q]] + 1;
            queue[qn++] = y1 * w + x1;
        }
    }
}

// On the bridge the player walks on alone, a step as each cell is up.
function onward(ready) {
    if (ready && want < 0 && !solid(cx[me] + DX[eside], cy[me] + DY[eside]))
        want = eside;
}

// One step of the walk in at a time, as the player settles.
function walkin(ready) {
    if (!ready || want >= 0)
        return;
    tread(cx[me], cy[me]);
    if (wk == wn) {
        arrived();
        return;
    }
    for (var d = 0; d < 4; d++)
        if (cx[me] + DX[d] == wx[wk] && cy[me] + DY[d] == wy[wk])
            want = d;
    wk++;
}

// On the island: the bridge sinks behind, from the island out, and the
// robots beside the start are wired on, as the level begins.
function arrived() {
    for (var k = 0; k < bn; k++) {
        bto[k] = 0;
        bat[k] = frame() + 10 + (abs(bx[k] - ax) + abs(by[k] - ay)) * 5;
    }
    if (home) {
        mode = BED;
        st = 0;
        return;
    }
    mode = PLAY;
    attach(6);
    hn = 0;
    moves = 0;
    startat = frame();
    banner = 70;
}

// ---------------------------------------------------------------- the story
//
// On the home island. Asleep on his feet in his house, z after z; a dream
// in a bubble; he starts awake, knocking the pot off the table; glares at
// the flower, tramples it flat, and swears death to all flowers; walks out
// of the door, and the roof drops onto the house behind him. Any button
// skips to the end. At the end of the game the roof lifts off, he walks
// back in, and sleeps.

function story() {
    load(-1);
    mode = STORY;
    st = 0;
    grp[me] = 0;
    cx[me] = DOORX;
    cy[me] = DOORY;
    px[me] = HX + 5.0;
    py[me] = HY + 11.0;
    tx[me] = HX + 5;
    ty[me] = HY + 11;
    face[me] = 0;
    asleep = 1;
    potstate = 0;
    potx = HX + 19.0;
    poty = HY + 8.0;
    pota = 0.0;
    roofstate = 0;
}

function script(d, ready) {
    st++;
    if (asleep && st % 40 == 20)
        snore(me);
    if (mode == BED) {
        tuckin(ready, d);
        return;
    }
    if (d >= 0 && st > 15) {
        endstory();
        return;
    }
    if (st == 100 || st == 112 || st == 124)
        think++;
    if (st == 140)
        think = 4;
    if (st == 300) {
        think = 0;
        asleep = 0;
        for (var k = 0; k < 4; k++)
            zt[k] = 0;
        particles.emit(sparks, 16, BUBX + 28 - sox, BUBY + 14 - soy, 0.0, 0.0, 1.6, 14, 7);
        hv[me] = -3.4;
        shake = 8;
    }
    if (st == 306) {
        potstate = 1;
        potvx = 0.15;
        potvy = -1.6;
    }
    if (st == 350)
        face[me] = 2;
    if (st == 362) {
        tx[me] = HX + 21;
        ty[me] = HY + 15;
    }
    if (st == 392 || st == 416 || st == 440)
        hv[me] = -2.6;
    if (st == 404 || st == 428 || st == 452)
        trample();
    if (st == 476 || st == 500 || st == 524)
        word();
    if (st == 560) {
        shout = 0;
        face[me] = 1;
        tx[me] = HX + 16;
    }
    if (st == 580) {
        face[me] = 0;
        ty[me] = HY + 24;
    }
    if (st == 600)
        ty[me] = DOORY * 8;
    if (st == 640) {
        roofstate = 1;
        roofy = -80.0;
        roofv = 0.0;
    }
    if (st == 700)
        endstory();
}

// Outside, the roof on, and the bridge to the first level rising.
function endstory() {
    mode = FREE;
    think = 0;
    shout = 0;
    asleep = 0;
    for (var k = 0; k < 4; k++)
        zt[k] = 0;
    potstate = 3;
    potx = HX + 21.0;
    poty = HY + 17.0;
    roofstate = 2;
    roofy = 0.0;
    cx[me] = DOORX;
    cy[me] = DOORY;
    tx[me] = DOORX * 8;
    ty[me] = DOORY * 8;
    px[me] = DOORX * 8.0;
    py[me] = DOORY * 8.0;
    face[me] = 0;
    grp[me] = 1;
    dset(2, 1);
    rise(ex, ey, eside, 10);
}

// Home at the end: to the door a cell at a time, the roof lifts away, and
// in he goes, to sleep where the story found him. He dreams of kind
// flowers, wakes a changed robot, and it fades to the end. A button once
// he is asleep goes straight to the end, and on the end to the title.
function tuckin(ready, d) {
    if (grp[me] && (cx[me] != DOORX || cy[me] != DOORY)) {
        st = 0;
        if (!ready || want >= 0)
            return;
        if (cy[me] != DOORY)
            want = cy[me] < DOORY ? 0 : 3;
        else
            want = cx[me] < DOORX ? 2 : 1;
        return;
    }
    if (st == 10) {
        roofstate = 3;
        roofv = -0.5;
    }
    if (st == 60) {
        grp[me] = 0;
        face[me] = 3;
        ty[me] = HY + 20;
    }
    if (st == 85) {
        face[me] = 1;
        tx[me] = HX + 5;
        ty[me] = HY + 11;
    }
    if (st == 115) {
        face[me] = 0;
        asleep = 1;
    }
    if (d >= 0 && st > 130) {
        if (st >= ENDAT + 40) {
            title();
            return;
        }
        if (st < ENDAT) {
            st = ENDAT;
            think = 0;
            shout = 0;
        }
    }
    if (st == 170 || st == 178 || st == 186)
        think++;
    if (st == 194)
        think = 4;
    if (st == 414)
        think = 0;
    if (st == 440) {
        asleep = 0;
        for (var k = 0; k < 4; k++)
            zt[k] = 0;
        hv[me] = -3.0;
        shake = 4;
        particles.emit(sparks, 8, px[me] + 3, py[me], 0.0, -1.0, 1.2, 14, 10);
    }
    if (st == 470 || st == 494 || st == 518)
        word();
    if (st == 560)
        shout = 0;
}

const ENDAT = 580;        // the tick of the ending the fade begins

// The fade to black over the ending, and the words on it.
function curtain() {
    var k = (st - ENDAT) >> 3;
    if (k < 0)
        return;
    if (k < 3) {
        fillp(k == 0 ? 0xAFAF : k == 1 ? 0x5A5A : 0x0505);
        rectfill(0, 0, 159, 119, 32);
        fillp();
        return;
    }
    cls(32);
    if (k < 5)
        return;
    var t = "THE END", w = textw(t);
    print(t, 80 - w / 2, 57, 7);
    palt(33, true);           // the flowers without their grass
    sspr(8, 64, 8, 8, 80 - w / 2 - 22, 52, 16, 16);
    sspr(32, 64, 8, 8, 80 + w / 2 + 6, 52, 16, 16, 1);
    palt();
}

// The next word of what he says, with a hop and his light flaring.
function word() {
    shout++;
    shoutat = st;
    hv[me] = -1.8;
    glow[me] = 10;
    particles.emit(sparks, 5, px[me] + 3, py[me], 0.0, -1.2, 1.0, 12, 8);
}

function snore(i) {
    for (var k = 0; k < 4; k++) {
        if (zt[k] == 0) {
            zt[k] = 1;
            zx[k] = px[i] + 6;
            zy[k] = py[i] - 2;
            return;
        }
    }
}

// The pot tumbling off the table, to break on the floor.
function fall() {
    potvy += 0.125;
    potx += potvx;
    poty += potvy;
    pota += 0.035;
    if (poty < HY + 17)
        return;
    poty = HY + 17.0;
    potstate = 2;
    shake = 3;
    var x = potx + 4, y = poty + 6;
    particles.emit(sparks, 8, x, y, 0.0, -1.2, 1.0, 14, 25);
    particles.emit(sparks, 4, x, y, 0.0, -0.9, 0.8, 12, 20);
    particles.emit(dust, 5, x, y, 0.0, -0.3, 0.6, 14, 16);
}

function trample() {
    squash[me] = 6;
    shake = 4;
    potstate = 3;
    var x = potx + 3, y = poty + 7;
    particles.emit(petals, 8, x, y, 0.0, -1.3, 1.0, 22, 14);
    particles.emit(petals, 5, x, y, 0.0, -1.0, 1.1, 16, 26);
    particles.emit(dust, 4, x, y, 0.0, -0.2, 0.6, 12, 19);
}

// The roof dropping on with a bounce and a puff of dust, or lifting away.
function roofmove() {
    if (roofstate == 3) {
        roofv -= 0.15;
        roofy += roofv;
        if (roofy < -110.0)
            roofstate = 0;
        return;
    }
    roofv += 0.5;
    roofy += roofv;
    if (roofy < 0.0)
        return;
    roofy = 0.0;
    if (roofv > 2.0) {
        particles.emit(dust, 10, HX + 16, HY + 30, 0.0, -0.4, 1.6, 18, 22);
        shake = 6;
    }
    roofv = -roofv * 0.25;
    if (abs(roofv) < 1.0) {
        roofv = 0.0;
        roofstate = 2;
    }
}

// The pot or the flower, under the robots.
function props() {
    sheet(IMG.world);
    if (potstate == 1)
        rspr(1, potx + 4, poty + 4, pota);
    else
        spr(potstate == 0 ? 1 : potstate, potx, poty);
    sheet();
}

// Over the robots: the roof.
function lid() {
    if (roofstate > 0) {
        blitpart(IMG.world, 32, 16, 36, 28, HX - 2, HY - 2 + flr(roofy));
        if (roofstate < 3)
            blitpart(IMG.world, 72, 16, 8, 6, HX + 16, HY + 26);
    }
}

// Over everything on the ground: the z's of whoever is asleep.
function zees() {
    sheet(IMG.world);
    for (var k = 0; k < 4; k++)
        if (zt[k] > 0)          // small, middle, then the big z, cells 7, 8, 5
            spr(zt[k] < 20 ? 7 : zt[k] < 42 ? 8 : 5,
                flr(zx[k] + sin(zt[k] / 30.0) * 2.0) - 4, flr(zy[k]) - 4);
    sheet();
}

// The bubbles, on the screen: a dream, thought circles leading up to it
// as the sleeper nods off, and the oath. Both are the same white box.
function bubbles() {
    var who = mode == INTRO ? bud : me;
    var hx = sox - flr(panx) + flr(px[who]) + 4;
    var hy = soy - flr(pany) + flr(py[who]) + flr(hop[who]);
    if (think > 0) {
        // the dream's box: the story's beside the house, the bud's over it
        var x0 = BUBX - 2, y0 = BUBY - 2;
        if (mode == INTRO) {
            x0 = mid(2, hx - 30, 98);
            y0 = hy - 48 >= 2 ? hy - 48 : hy + 14;
        }
        var x1 = x0 + 59, y1 = y0 + 33;
        var ex0 = x0, ey0 = mid(y0 + 6, hy - 6, y1 - 6);
        if (x0 <= hx + 4) {
            ex0 = mid(x0 + 6, hx, x1 - 6);
            ey0 = y1 < hy ? y1 : y0;
        }
        for (var k = 0; k < min(think, 3); k++) {
            var f = (k + 1) / 4.0;
            var x = flr(hx + 3 + (ex0 - hx - 3) * f), y = flr(hy - 3 + (ey0 - hy + 3) * f);
            circfill(x, y, k + 2, 32);
            circfill(x, y, k + 1, 7);
        }
        if (think == 4) {
            bubble(x0, y0, x1, y1);
            if (mode == INTRO)
                rule(x0 + 2, y0 + 2, pt - 54);
            else if (mode == BED)
                kindly(x0 + 2, y0 + 2, st - 194);
            else
                nightmare(x0 + 2, y0 + 2, st - 140);
        }
    }
    if (shout) {
        var verb = mode == BED ? " PLANT..." : " KILL...";
        var all = "MUST..." + verb + " FLOWERS...", text = "MUST...";
        if (shout >= 2)
            text += verb;
        if (shout >= 3)
            text = all;
        var tw = textw(all);
        var x0 = 80 - (tw >> 1) - 4, y0 = 12, x1 = 80 + (tw >> 1) + 3, y1 = 24;
        var j = st - shoutat < 6 ? rnd(3) - 1 : 0;
        trifill(hx - 6, y1, hx, y1, hx - 1, hy - 2, 32);
        bubble(x0 - 1 + j, y0 - 1, x1 + 1 + j, y1 + 1);
        trifill(hx - 5, y1, hx - 1, y1, hx - 1, hy - 4, 7);
        print(text, x0 + 4 + j, y0 + 4, mode == BED ? 3 : 8);
    }
}

// A white box, inked round, its corners rounded off.
function bubble(x0, y0, x1, y1) {
    rectfill(x0 + 1, y0, x1 - 1, y1, 32);
    rectfill(x0, y0 + 1, x1, y1 - 1, 32);
    rectfill(x0 + 1, y0 + 1, x1 - 1, y1 - 1, 7);
}

// A dream's ground, 56 wide, along the foot of the box at x0, y0: the
// island's grass, which the flower tiles are drawn on; a sky above it,
// with clouds drifting by.
function lawn(x0, y0) {
    rectfill(x0, y0, x0 + 55, y0 + 18, 12);
    var c = flr(frame() / 8);
    for (var k = 0; k < 2; k++) {
        var x = x0 + (c + k * 31) % 72 - 8, y = y0 + 4 + k * 6;
        clip(x0, y0, x0 + 55, y0 + 18);
        circfill(x, y, 3, 7);
        circfill(x + 4, y + 1, 3, 7);
        circfill(x - 4, y + 1, 2, 7);
        clip();
    }
    rectfill(x0, y0 + 19, x0 + 55, y0 + 29, 33);
    line(x0, y0 + 19, x0 + 55, y0 + 19, 34);
}

// The story's dream, t ticks in: the robot dithers between two killer
// plants, and each lunges and snaps as he comes near.
function nightmare(x0, y0, t) {
    lawn(x0, y0);
    var p = t % 80;
    var x = x0 + 24 - flr(6 * cos(p / 80.0)), y = y0 + 20;
    sheet(IMG.world);
    spr(PLANT + jaws((p + 8) % 80), x0 + 1, y0 + 12, 2, 2);
    spr(PLANT + jaws((p + 48) % 80), x0 + 39, y0 + 12, 2, 2, 1);
    sheet();
    var jump = (p + 2) % 80 < 6 || (p + 42) % 80 < 6;
    var right = p > 0 && p < 40;
    spr((t >> 2) & 1 ? S_WALK : S_LEANF, x, jump ? y - 3 : y, 1, 1, right ? 1 : 0);
    if (jump)
        pset(right ? x + 1 : x + 6, y - 4, 12);    // a bead of sweat
}

// The ending's dream, t ticks in: he sits among flowers that sway to him,
// and hearts rise from them.
function kindly(x0, y0, t) {
    lawn(x0, y0);
    var y = y0 + 20;
    for (var c = 0; c < 6; c++) {
        if (c == 2 || c == 3)
            continue;
        var lean = c < 2 ? 1 : -1;
        var sway = ((t >> 4) + c) & 1 ? lean : 0;
        spr(FLOWERS + c, x0 + 4 + c * 8 + sway, y - (((t >> 3) + c) & 1));
    }
    spr((t >> 5) % 5 == 4 ? F_BLINK : F_IDLE, x0 + 24, y);
    for (var k = 0; k < 3; k++) {
        var q = (t + k * 21) % 64;
        if (q < 48)
            heart(x0 + 18 + k * 8 + flr(sin(q / 32.0) * 2.0), y - 2 - (q >> 2));
    }
}

// A little heart, its corner at x, y.
function heart(x, y) {
    rectfill(x, y + 1, x + 4, y + 1, 8);
    rectfill(x + 1, y + 2, x + 3, y + 2, 8);
    pset(x + 2, y + 3, 8);
    pset(x + 1, y, 8);
    pset(x + 3, y, 8);
}

// A plant's frame, q ticks into its lunge: idle, open, shut, open, idle.
function jaws(q) {
    if (q < 6 || (q >= 12 && q < 16))
        return 2;
    if (q < 12)
        return 4;
    return 0;
}

// The bud's dream, t ticks in: an orange robot walks up to a flower and
// stomps it, turns red, and walks on with a flower springing up in each
// cell it leaves.
function rule(x0, y0, t) {
    lawn(x0, y0);
    var y = y0 + 20, x = x0 + 2, f = S_WALK, flip = 1, r = BUD;
    if (t < 30) {
        x += t * 22 / 30;
        f = (t >> 2) & 1 ? S_WALK : S_LEANF;
    } else if (t < 60) {
        x += 22;
        f = t < 38 ? S_SQUASH : F_IDLE;
        flip = t < 38 ? 1 : 0;
        if (t >= 38)
            r = (t >> 2) & 1 ? GROWER : BUD;
    } else {
        x += 22 + min(t - 60, 36) * 24 / 36;
        f = t < 96 ? ((t >> 2) & 1 ? S_WALK : S_LEANF) : F_IDLE;
        flip = t < 96 ? 1 : 0;
        r = GROWER;
    }
    // the flower it stomps, then the ones that spring up behind it
    spr(t < 34 ? FLOWERS : t < 72 ? FLAT : FLOWERS + 2, x0 + 24, y);
    for (var c = 1; c < 3; c++) {
        var at = 72 + c * 12;
        if (t >= at)
            spr(FLOWERS + 3 + c, x0 + 24 + c * 8, t < at + 4 ? y - 1 : y);
    }
    spr(r * 16 + f, flr(x), y, 1, 1, flip);
}

// The player snaps to its cell; the others spring, overshooting a little.
function move(i) {
    var k = 0.1, damp = 0.78;
    if (i == me) {
        k = 0.08;
        damp = 0.6;
    }
    vx[i] = vx[i] * damp + (tx[i] - px[i]) * k;
    vy[i] = vy[i] * damp + (ty[i] - py[i]) * k;
    px[i] += vx[i];
    py[i] += vy[i];
    var speed = abs(vx[i]) + abs(vy[i]);
    if (speed < 0.04 && abs(tx[i] - px[i]) + abs(ty[i] - py[i]) < 0.1) {
        px[i] = tx[i];
        py[i] = ty[i];
        vx[i] = 0.0;
        vy[i] = 0.0;
    }
    if (speed > 0.7)
        fast[i] = 1;
    else if (fast[i] && speed < 0.25) {
        fast[i] = 0;
        squash[i] = 3;         // a little bump as it stops
    }

    hv[i] += 0.4;
    hop[i] += hv[i];
    if (hop[i] >= 0.0) {
        if (hv[i] > 1.5)
            squash[i] = 5;
        hop[i] = 0.0;
        hv[i] = 0.0;
    }
    if (squash[i] > 0)
        squash[i]--;
    if (glow[i] > 0)
        glow[i]--;
}

// A new wire shoots out from the group; when it reaches, the robot jumps.
function grow(i) {
    if (latch[i] >= 1.0 || frame() < latchat[i])
        return;
    latch[i] = min(latch[i] + 0.25, 1.0);
    if (latch[i] < 1.0)
        return;
    var p = par[i];
    hv[i] = -2.0;
    glow[i] = 14;
    face[i] = facing(i, p);
    var x = (px[i] + px[p]) / 2 + 4, y = (py[i] + py[p]) / 2 + 6;
    particles.emit(sparks, 8, x, y, 0.0, -0.8, 0.9, 12, LIGHT[row[i]]);
    particles.emit(sparks, 4, x, y, 0.0, -0.5, 0.6, 8, 7);
    vx[p] += (px[i] - px[p]) * 0.08;   // the parent is jolted toward it
    vy[p] += (py[i] - py[p]) * 0.08;
}

// The face of robot i looking at robot j.
function facing(i, j) {
    var dx = cx[j] - cx[i], dy = cy[j] - cy[i];
    if (abs(dx) >= abs(dy))
        return dx < 0 ? 1 : 2;
    return dy < 0 ? 3 : 0;
}

// Holds a wired pair within its stretch, squash and shear, the child
// giving most of the way.
function hold(i, p) {
    var rx = (cx[i] - cx[p]) * 8, ry = (cy[i] - cy[p]) * 8;
    var ex = px[i] - px[p] - rx, ey = py[i] - py[p] - ry;
    var along = 0.0, cross = 0.0;
    if (rx != 0) {
        along = ex * sgn(rx);
        cross = ey;
    } else {
        along = ey * sgn(ry);
        cross = ex;
    }
    strain[i] = along;
    var fa = along - mid(-SQUEEZE, along, STRETCH);
    var fc = cross - mid(-SHEAR, cross, SHEAR);
    if (fa == 0.0 && fc == 0.0)
        return;
    var fx = 0.0, fy = 0.0;
    if (rx != 0) {
        fx = fa * sgn(rx);
        fy = fc;
    } else {
        fx = fc;
        fy = fa * sgn(ry);
    }
    px[i] -= fx * 0.7;
    py[i] -= fy * 0.7;
    px[p] += fx * 0.3;
    py[p] += fy * 0.3;
}

// Blinking, and free robots looking about, or at the group when it is near.
function mood(i) {
    if (frame() >= blinkat[i])
        blinkat[i] = frame() + 60 + rnd(120);
    if (grp[i] || i == me || dormant(i) || i == actor)
        return;
    var near = -1;
    for (var j = 0; j < count; j++)
        if (grp[j] && abs(cx[i] - cx[j]) + abs(cy[i] - cy[j]) <= 3)
            near = j;
    if (near >= 0) {
        face[i] = facing(i, near);
        return;
    }
    if (frame() >= lookat[i]) {
        lookat[i] = frame() + 50 + rnd(150);
        face[i] = rnd(3);
    }
}

function draw() {
    var x0 = 0, y0 = 0;
    if (shake > 0) {
        shake--;
        x0 = rnd(3) - 1;
        y0 = rnd(3) - 1;
    }
    // the view: the pan, and the shake
    var ox = panx + x0, oy = pany + y0;
    palt(0, false);
    blit(ground, -PAD - ox, -PAD - oy);
    palt();
    glints(ox, oy);
    camera(ox - sox, oy - soy);
    if (home)
        props();

    for (var i = 0; i < count; i++)
        if (par[i] >= 0 && latch[i] > 0.0)
            wire(par[i], i, latch[i]);

    sortbyy();
    for (var n = 0; n < count; n++)
        robot(order[n]);
    if (home)
        lid();
    zees();

    particles.draw(dust);
    particles.draw(petals);
    particles.draw(sparks);
    camera();
    if (home || mode == INTRO)
        bubbles();
    if (cheer > 0)
        say("ALL STOMPED!");
    else if (banner > 0 && !home)
        say("LEVEL " + (lvl + 1));
    if (mode == FREE && !home)
        tally();
    if (mode == BED)
        curtain();
    if (mode == TITLE)
        titles();
    if (mode == PICK)
        chooser();
}

// The score along the foot of the screen once a level is solved: time,
// moves and par, with a crown beside a time or a count that is the best
// yet on this level.
function tally() {
    var a = "TIME " + clock(took), b = "MOVES " + moves, c = "PAR " + parmoves;
    var w = textw(a) + textw(b) + textw(c) + 24 + (newtime ? 9 : 0) + (newmoves ? 9 : 0);
    var x = 80 - w / 2;
    rectfill(0, 109, 159, 119, 17);
    print(a, x, 112, 7);
    x += textw(a) + 2;
    if (newtime) {
        crown(x, 110);
        x += 9;
    }
    x += 10;
    print(b, x, 112, 7);
    x += textw(b) + 2;
    if (newmoves) {
        crown(x, 110);
        x += 9;
    }
    x += 10;
    print(c, x, 112, 6);
}

// The crown, world cell 6, its corner at x, y.
function crown(x, y) {
    sheet(IMG.world);
    spr(6, x, y);
    sheet();
}

// Ticks as minutes and seconds.
function clock(ticks) {
    var sec = flr(ticks / 33), ss = sec % 60;
    return flr(sec / 60) + ":" + (ss < 10 ? "0" : "") + ss;
}

function say(text) {
    rectfill(0, 0, 159, 10, 17);
    print(text, 80 - textw(text) / 2, 3, 7);
}

// Sparkles on the sea, each coming and going in its own time and drifting
// with the swell.
function glints(x0, y0) {
    var t = frame();
    for (var k = 0; k < GLINTS; k++) {
        var p = (t + k * 37) % 120;
        if (p >= 48)
            continue;
        var len = p < 16 ? p >> 3 : p < 32 ? 2 : (47 - p) >> 3;
        var x = glx[k] - PAD - x0 + flr(sin((t + k * 23) / 240.0) * 2.0);
        var y = gly[k] - PAD - y0;
        line(x, y, x + len, y, p < 24 ? 12 : 7);
    }
}

function sortbyy() {
    for (var i = 0; i < count; i++) {
        var j = i;
        while (j > 0 && py[order[j - 1]] > py[i]) {
            order[j] = order[j - 1];
            j--;
        }
        order[j] = i;
    }
}

function robot(i) {
    var x = flr(px[i]), y = flr(py[i]);
    if (hop[i] < -1.0)
        line(x + 1, y + 7, x + 4, y + 7, 19);
    y += flr(hop[i]);
    var light = LIGHT[row[i]];
    if (glow[i] > 0 && (glow[i] & 2))
        pal(light, 7);

    var flip = face[i] == 2 ? 1 : 0;
    spr(frameof(i), x, y, 1, 1, flip);
    pal(light, light);
}

// A robot not yet wired on is switched off: still, facing out, eyes and
// light blank, until the wire reaches it. Freed at the end, it lives on.
function dormant(i) {
    return i != me && i != actor && !grp[i] && mode != FREE;
}

function frameof(i) {
    var base = 16 * row[i], f = face[i];
    if (dormant(i))
        return base + F_WOW;
    var walking = abs(vx[i]) + abs(vy[i]) > 0.35;
    var beat = (frame() >> 2) & 1;
    var blink = blinkat[i] - frame() < 4 || (i == me && asleep);
    var wow = hop[i] < -0.5 || (grp[i] && i != me && strain[i] > 4.0);
    var dragged = grp[i] && i != me && strain[i] > 2.5;

    if (f == 0) {
        if (squash[i] > 0) return base + F_SQUASH;
        if (wow) return base + F_WOW;
        if (walking) return base + (beat ? F_WALKA : F_WALKB);
        return base + (blink ? F_BLINK : F_IDLE);
    }
    if (f == 3) {
        if (squash[i] > 0) return base + B_SQUASH;
        if (walking) return base + (beat ? B_WALK : B_IDLE);
        return base + B_IDLE;
    }
    if (squash[i] > 0) return base + S_SQUASH;
    if (hop[i] < -0.5) return base + S_WOW;
    if (dragged) return base + (beat ? S_LEANB : S_WALK);
    if (walking) return base + (beat ? S_LEANF : S_WALK);
    return base + (blink ? S_BLINK : S_IDLE);
}

// A coiled wire from robot p toward robot i, drawn as far as `part` of
// the way. Its coils spread as it stretches and bunch as it squashes, and
// it wriggles while under strain. Robots are drawn over it, so only the
// stretch between them shows.
function wire(p, i, part) {
    var ax = px[p], ay = py[p] + hop[p], bx = px[i], by = py[i] + hop[i];
    var wig = 0;
    if (cy[i] == cy[p]) {
        ax += 3; bx += 3; ay += 5; by += 5;
        var len = abs(bx - ax), n = flr(len * part);
        if (abs(len - 8.0) > 1.5)
            wig = (frame() >> 1) & 1;
        var dir = sgn(bx - ax);
        for (var s = 0; s <= n; s++) {
            var x = flr(ax) + s * dir;
            var y = flr(ay + (by - ay) * s / max(len, 1.0));
            if (((flr(s * 8.0 / max(len, 8.0))) + wig) & 1) {
                pset(x, y, 7);
                pset(x, y + 1, 6);
            } else {
                pset(x, y + 1, 7);
                pset(x, y + 2, 6);
            }
        }
    } else {
        ax += 5; bx += 5; ay += 5; by += 5;
        var len = abs(by - ay), n = flr(len * part);
        if (abs(len - 8.0) > 1.5)
            wig = (frame() >> 1) & 1;
        var dir = sgn(by - ay);
        for (var s = 0; s <= n; s++) {
            var y = flr(ay) + s * dir;
            var x = flr(ax + (bx - ax) * s / max(len, 1.0));
            if (((flr(s * 8.0 / max(len, 8.0))) + wig) & 1) {
                pset(x, y, 7);
                pset(x + 1, y, 6);
            } else {
                pset(x + 1, y, 7);
                pset(x + 2, y, 6);
            }
        }
    }
}
