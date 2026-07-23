/* syntropic structures: landing page scripts (signup + dot-matrix canvas).
Loaded only by index.html, at the end of body. */

(function () {
var FORM_ACTION = "https://docs.google.com/forms/d/e/1FAIpQLSdFatNW9e_VuXDl_deuCpbxSGVrybdpBNwQZfwUiaC-ngIPZg/formResponse";
var ENTRY_ID = "entry.1030355267";
var form = document.getElementById("signup-form");
var note = document.getElementById("note");
form.addEventListener("submit", function (e) {
e.preventDefault();
var email = document.getElementById("email").value.trim();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
note.textContent = "that doesn't look like an email.";
return;
}
var data = new FormData();
data.append(ENTRY_ID, email);
fetch(FORM_ACTION, { method: "POST", mode: "no-cors", body: data });
note.textContent = "you're on the list.";
form.reset();
});
})();

(function () {
var canvas = document.getElementById("dots");
var ctx = canvas.getContext("2d");
var consentEl = document.querySelector(".signup .consent");
var navEl = document.querySelector(".topnav");
var dpr = Math.min(window.devicePixelRatio || 1, 2);
var W, H, cols, rows, fields, rings;
var SPACING = 9;
var SHAPES = 18;

function resize() {
W = window.innerWidth;
H = window.innerHeight;
canvas.width = W * dpr;
canvas.height = H * dpr;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
cols = Math.ceil(W / SPACING) + 1;
rows = Math.ceil(H / SPACING) + 1;
buildFields();
}
window.addEventListener("resize", resize);

function hash(x, y) {
var s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
return s - Math.floor(s);
}
function smooth(t) { return t * t * (3 - 2 * t); }
function noise2(x, y) {
var xi = Math.floor(x), yi = Math.floor(y);
var xf = x - xi, yf = y - yi;
var a = hash(xi, yi), b = hash(xi + 1, yi);
var c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
var u = smooth(xf), v = smooth(yf);
return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y) {
var v = 0, amp = 0.5, freq = 1;
for (var i = 0; i < 4; i++) {
v += amp * noise2(x * freq, y * freq);
amp *= 0.5;
freq *= 2.1;
}
return v;
}

/* --- structure fields ---
Silhouettes the clouds periodically condense into, sampled straight from
high-contrast masks of real photos (white = structure), cover-cropped to
the viewport. Per grid dot we store how strongly it sits on structure
(fields) and a blurred ring just outside it (rings) used to thin the
surrounding fog, as if cloud matter gets drawn into the shape. */

var shapeImgs = [];
var buildQueued = false;
function queueBuild() {
if (buildQueued) return;
buildQueued = true;
setTimeout(function () { buildQueued = false; buildFields(); }, 60);
}
for (var si = 0; si < SHAPES; si++) {
var im = new Image();
im.onload = queueBuild;
im.src = "structure-" + (si + 1) + ".png";
shapeImgs.push(im);
}

function sampleImageField(im, F) {
var off = document.createElement("canvas");
off.width = cols;
off.height = rows;
var octx = off.getContext("2d", { willReadFrequently: true });
var arS = W / H, arI = im.width / im.height;
var sx, sy, sw, sh;
if (arI > arS) { sh = im.height; sw = sh * arS; sx = (im.width - sw) / 2; sy = 0; }
else { sw = im.width; sh = sw / arS; sx = 0; sy = (im.height - sh) / 2; }
octx.drawImage(im, sx, sy, sw, sh, 0, 0, cols, rows);
var px;
try { px = octx.getImageData(0, 0, cols, rows).data; } catch (e) { return; }
for (var k = 0; k < cols * rows; k++) F[k] = px[k * 4] / 255;
}

function ringFrom(F, R) {
var tmp = new Float32Array(cols * rows);
for (var j = 0; j < rows; j++) {
for (var i = 0; i < cols; i++) {
var acc = 0, c = 0;
for (var k = -2; k <= 2; k++) {
var ii = i + k;
if (ii >= 0 && ii < cols) { acc += F[j * cols + ii]; c++; }
}
tmp[j * cols + i] = acc / c;
}
}
for (var j = 0; j < rows; j++) {
for (var i = 0; i < cols; i++) {
var acc = 0, c = 0;
for (var k = -2; k <= 2; k++) {
var jj = j + k;
if (jj >= 0 && jj < rows) { acc += tmp[jj * cols + i]; c++; }
}
var f = F[j * cols + i];
var r = (acc / c - f) * 1.6;
if (r < 0) r = 0;
if (r > 1) r = 1;
R[j * cols + i] = r * (1 - f);
}
}
}

function buildFields() {
fields = [];
rings = [];
for (var s = 0; s < SHAPES; s++) {
fields.push(new Float32Array(cols * rows));
rings.push(new Float32Array(cols * rows));
}
for (var s = 0; s < SHAPES; s++) {
if (shapeImgs[s] && shapeImgs[s].complete && shapeImgs[s].naturalWidth) sampleImageField(shapeImgs[s], fields[s]);
}
for (var s = 0; s < SHAPES; s++) ringFrom(fields[s], rings[s]);
}
resize();

var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
var ink = [28, 27, 24];
var timber = [96, 82, 56];
var CYCLE = 15000;

/* #truss in the URL pins presence for tuning; #trussN pins shape N,
zero-based in file order (#truss0 = structure-1.png, etc). Returns
null (no pin), -1 (pin, cycling shapes) or a shape index. */
function debugPin() {
var m = /^#truss(\d+)?$/.exec(location.hash);
if (!m) return null;
return m[1] ? +m[1] % SHAPES : -1;
}

/* 0..1 presence of the structure: one continuous sine bump per cycle,
with no plateau and no ramp corners, so condensing and releasing move
at the same unhurried pace as the cloud drift. */
function presence(ms, dbg) {
if (reduced) return 0;
if (dbg !== null) return 1;
var s = Math.sin(Math.PI * ((ms % CYCLE) / CYCLE));
return Math.pow(s, 2.6);
}

function draw(tms) {
var t = tms * 0.000045;
ctx.clearRect(0, 0, W, H);
/* Mobile: instead of the desktop's hard ellipse cutoff, the field thins
to a near-invisible veil across the text and reaches zero only in a
small core right behind the title, with fainter dots overall: a quiet
backdrop gathered close around the title. */
var mobile = W < 640;
var cx = W * 0.5, cy = H * 0.46;
var rx = mobile ? W * 0.40 : Math.max(W * 0.30, 320);
var ry = mobile ? H * 0.28 : Math.max(H * 0.34, 260);
var fade = mobile ? 0.55 : 1;
var footHalf = mobile ? Math.min(320, W * 0.38) : 320;
/* On phones the consent paragraph sits below the ellipse core, so give
it its own measured clearing: a snug squircle around its live rect
with the same probabilistic dissolve at the fringe. */
var cRect = mobile && consentEl ? consentEl.getBoundingClientRect() : null;
var ccx, ccy, crx2, cry2;
if (cRect) {
ccx = cRect.left + cRect.width * 0.5;
ccy = cRect.top + cRect.height * 0.5;
crx2 = cRect.width * 0.5 * 1.18;
cry2 = cRect.height * 0.5 * 1.3 + 6;
}
/* The nav gets its own measured clearing on every viewport: a snug
squircle around its live rect with the probabilistic dissolve fringe,
so the corner links stay legible under the drifting field. */
var nRect = navEl ? navEl.getBoundingClientRect() : null;
var ncx, ncy, nrx2, nry2;
if (nRect) {
ncx = nRect.left + nRect.width * 0.5;
ncy = nRect.top + nRect.height * 0.5;
nrx2 = nRect.width * 0.5 * 1.25 + 8;
nry2 = nRect.height * 0.5 * 1.6 + 10;
}
var dbg = debugPin();
var p = presence(tms, dbg);
var shape = (dbg !== null && dbg >= 0) ? dbg : Math.floor(tms / CYCLE) % SHAPES;
var F = fields[shape], R = rings[shape];
for (var j = 0; j < rows; j++) {
var y = j * SPACING;
var ny = y * 0.006;
for (var i = 0; i < cols; i++) {
var x = i * SPACING;
var dx = (x - cx) / rx, dy = (y - cy) / ry;
var d2 = dx * dx + dy * dy;
var edge;
if (mobile) {
if (d2 < 0.12) continue;
var inner = smooth(Math.min((d2 - 0.12) / 0.5, 1)) * 0.22;
var outer = smooth(Math.min(Math.max((d2 - 1) * 1.5, 0), 1)) * 0.78;
edge = inner + outer;
} else {
/* Probability-space mask: each dot draws a stable random against a
fade probability that reaches 100% toward the title, so the rim
dissolves into scattered live dots instead of a clean ellipse cut. */
var sv = smooth(Math.min(Math.max((d2 - 0.35) / 0.9, 0), 1));
if (sv <= 0 || hash(i * 13 + 7, j * 17 + 3) > sv) continue;
edge = 0.35 + 0.65 * sv;
}
/* The footer gets the same live edge: an elliptical fade probability
centered on its text instead of the old hard rectangle. */
var fdx = (x - cx) / (footHalf * 1.05);
var fdy = (y - (H - 65)) / 130;
var f2 = fdx * fdx + fdy * fdy;
if (f2 < 1.25) {
var sf = smooth(Math.min(Math.max((f2 - 0.35) / 0.9, 0), 1));
if (sf <= 0 || hash(i * 19 + 11, j * 23 + 5) > sf) continue;
edge *= 0.35 + 0.65 * sf;
}
if (cRect) {
var cdx = (x - ccx) / crx2, cdy = (y - ccy) / cry2;
var c4 = cdx * cdx * cdx * cdx + cdy * cdy * cdy * cdy;
if (c4 < 1.8) {
var sc = smooth(Math.min(Math.max((c4 - 1) / 0.8, 0), 1));
if (sc <= 0 || hash(i * 29 + 3, j * 31 + 7) > sc) continue;
edge *= 0.35 + 0.65 * sc;
}
}
if (nRect) {
var ndx = (x - ncx) / nrx2, ndy = (y - ncy) / nry2;
var n4 = ndx * ndx * ndx * ndx + ndy * ndy * ndy * ndy;
if (n4 < 1.8) {
var sn = smooth(Math.min(Math.max((n4 - 1) / 0.8, 0), 1));
if (sn <= 0 || hash(i * 37 + 13, j * 41 + 9) > sn) continue;
edge *= 0.35 + 0.65 * sn;
}
}
var f = 0, ring = 0;
if (p > 0) {
var idx = j * cols + i;
f = F[idx];
ring = R[idx];
}
var v = fbm(x * 0.006 + t * 3, ny + Math.sin(t * 1.7) * 0.35 + t * 0.6);
/* The structure never gets dots of its own: it bends the cloud field.
Members amplify the local fog value and the ring around them drains
it, so passing clouds condense into the shape and, on release,
continue drifting as themselves. */
var vEff = v + p * (f * 0.4 - ring * 0.1);
if (vEff < 0.52) continue;
var strength = Math.min((vEff - 0.52) * 7, 1) * edge;
if (strength <= 0.02) continue;
var jit = hash(i * 7 + 3, j * 11 + 5);
if (jit > 0.35 + strength * 0.6) continue;
var w = p * f * 0.55;
var size = 1 + strength * 2.2 * (0.6 + jit * 0.8) + w * 0.4;
var cr = Math.round(ink[0] + (timber[0] - ink[0]) * w);
var cg = Math.round(ink[1] + (timber[1] - ink[1]) * w);
var cb = Math.round(ink[2] + (timber[2] - ink[2]) * w);
var alpha = (0.25 + strength * 0.65) * fade;
if (mobile) alpha *= 0.35 + 0.65 * Math.min(edge / 0.78, 1);
ctx.fillStyle = "rgba(" + cr + "," + cg + "," + cb + "," + alpha.toFixed(3) + ")";
ctx.fillRect(x, y, size, size);
}
}
if (!reduced) requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
})();
