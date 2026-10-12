/**
 * The ground of the hero: the ruled page of a diary, booking itself up while you
 * read. Drag a finger or a mouse across it and you book a trail of slots yourself,
 * each one stamped with its time.
 *
 * One canvas behind everything. It is fetched after the page has painted and costs
 * the first screen nothing, and it keeps going in battery saver: it is the picture,
 * not a flourish on one.
 */

const PAPER = "#f7f4ec";
const PANEL = "#fffdf4";
const INK = "#16150f";
const COBALT = "#1f3be3";
/** Fill, then what is written on it. Mostly cobalt, as a diary is mostly one kind of job. */
const KINDS = [
  [COBALT, PAPER],
  [COBALT, PAPER],
  [INK, PAPER],
  [COBALT, PAPER],
  [PANEL, INK],
] as const;

type Slot = { c: number; r: number; born: number; mine: boolean };
type Box = { l: number; t: number; r: number; b: number };

const ROW = 52;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, v: number) => {
  const k = clamp((v - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pop = (k: number) => {
  const c = 1.70158;
  const u = clamp(k, 0, 1) - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
};
/** Rows are half hours from eight in the morning. */
const time = (r: number) => {
  const m = 8 * 60 + r * 30;
  return `${Math.floor(m / 60) % 24}:${m % 60 ? "30" : "00"}`;
};

function box(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export function startDiary(hero: HTMLElement, layer: HTMLElement) {
  const cv = document.createElement("canvas");
  layer.appendChild(cv);
  const g = cv.getContext("2d");
  if (!g) return;

  const font = getComputedStyle(document.body).fontFamily;
  let W = 0;
  let H = 0;
  let dpr = 1;
  let wide = false;
  let cols = 5;
  let cw = 80;
  /** The phone and the diary beside it: nothing drawn under these is seen. */
  let row: Box = { l: 0, t: 0, r: 0, b: 0 };
  /** Every line of words on the hero, and how far right they reach. */
  let words: Box[] = [];
  let edge = 0;
  let slots: Slot[] = [];

  const cell = (c: number, r: number): Box => ({ l: c * cw, t: r * ROW, r: (c + 1) * cw, b: (r + 1) * ROW });
  const onWords = (k: Box) => words.some((b) => k.r + 4 > b.l && k.l - 4 < b.r && k.b + 2 > b.t && k.t - 2 < b.b);
  const hidden = (k: Box) => (k.l + k.r) / 2 > row.l + 20 && (k.l + k.r) / 2 < row.r - 20 && (k.t + k.b) / 2 > row.t && (k.t + k.b) / 2 < row.b;
  const taken = (c: number, r: number) => slots.some((b) => b.c === c && b.r === r);

  const lay = () => {
    const r = hero.getBoundingClientRect();
    if (Math.abs(r.width - W) < 1 && Math.abs(r.height - H) < 1) return;
    W = r.width;
    H = r.height;
    wide = W >= 1024;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    cols = wide ? Math.round(W / 110) : 5;
    cw = W / cols;
    slots = [];
    const rowEl = hero.querySelector<HTMLElement>('img[src*="hand-front"]')?.closest("span")?.parentElement?.parentElement;
    const rw = rowEl?.getBoundingClientRect();
    row = rw ? { l: rw.left - r.left, t: rw.top - r.top, r: rw.right - r.left, b: rw.bottom - r.top } : { l: W, t: 0, r: W, b: 0 };
    // Line by line, so the paper beside a short line of the headline still counts as open.
    words = [];
    edge = 0;
    const walk = document.createTreeWalker(hero, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.textContent?.trim() || rowEl?.contains(n)) continue;
      range.selectNodeContents(n);
      for (const b of range.getClientRects()) {
        if (b.width <= 2) continue;
        words.push({ l: b.left - r.left, t: b.top - r.top, r: b.right - r.left, b: b.bottom - r.top });
        if (b.left - r.left < W * 0.3) edge = Math.max(edge, b.right - r.left);
      }
    }
  };

  let clock = 0;
  let next = 0.3;
  const ptr = { x: 0, y: 0, on: false, at: 0 };

  const draw = () => {
    const t = clock;
    // The ruling.
    g.strokeStyle = "rgba(22, 21, 15, 0.14)";
    g.lineWidth = 1;
    g.beginPath();
    for (let c = 1; c < cols; c++) {
      g.moveTo(Math.round(c * cw) + 0.5, 0);
      g.lineTo(Math.round(c * cw) + 0.5, H);
    }
    for (let y = ROW; y < H; y += ROW) {
      g.moveTo(0, y + 0.5);
      g.lineTo(W, y + 0.5);
    }
    g.stroke();
    if (wide) {
      // On a wide screen the diary is the right of the page only: the words keep their side clear.
      const rub = g.createLinearGradient(edge, 0, edge + 90, 0);
      rub.addColorStop(0, "rgba(0, 0, 0, 1)");
      rub.addColorStop(1, "rgba(0, 0, 0, 0)");
      g.globalCompositeOperation = "destination-out";
      g.fillStyle = rub;
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = "source-over";
    }

    if (ptr.on) {
      const c = Math.floor(ptr.x / cw);
      const r = Math.floor(ptr.y / ROW);
      if (c >= 0 && c < cols && r >= 0 && !taken(c, r) && !(wide && c * cw < edge + 24)) slots.push({ c, r, born: t, mine: true });
    }
    if (t > next) {
      // Unhurried: a handful on the page at once, not a wall of them.
      next = t + rnd(1.1, 2);
      for (let i = 0; i < 16; i++) {
        const c = Math.floor(rnd(0, cols));
        const r = Math.floor(rnd(1.4, Math.min(H, row.b + 80) / ROW));
        const k = cell(c, r);
        if (taken(c, r) || onWords(k) || hidden(k) || (wide && k.l < edge + 24)) continue;
        slots.push({ c, r, born: t, mine: false });
        break;
      }
    }

    const life = (b: Slot) => (b.mine ? 3.5 : wide ? 9 : 7);
    slots = slots.filter((b) => t - b.born < life(b) + 0.8);
    g.textAlign = "left";
    g.textBaseline = "top";
    g.lineJoin = "round";
    for (const b of slots) {
      const age = t - b.born;
      const k = cell(b.c, b.r);
      const [fill, text] = KINDS[(b.c * 7 + b.r * 13) % KINDS.length];
      const w = cw - 12;
      const h = ROW - 12;
      const s = pop(age / 0.34);
      g.save();
      g.translate(k.l + cw / 2 - 1, k.t + ROW / 2 - 1);
      g.scale(s, s);
      // One a finger put under the words is only a ghost of a booking.
      g.globalAlpha = Math.min(1, age / 0.12) * (1 - smooth(life(b), life(b) + 0.8, age)) * (onWords(k) ? 0.22 : 1);
      box(g, -w / 2, -h / 2, w, h, 9);
      g.fillStyle = fill;
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = 1.25;
      g.stroke();
      g.fillStyle = text;
      g.font = `700 12px ${font}`;
      g.fillText(time(b.r), -w / 2 + 8, -h / 2 + 7);
      g.globalAlpha *= 0.6;
      box(g, -w / 2 + 8, h / 2 - 13, Math.min(w - 16, 22 + ((b.c * 5 + b.r * 3) % 4) * 8), 4.5, 2.25);
      g.fill();
      g.restore();
    }
  };

  const at = (cx: number, cy: number) => {
    const r = hero.getBoundingClientRect();
    if (cy < r.top || cy > r.bottom) return;
    ptr.x = cx - r.left;
    ptr.y = cy - r.top;
    ptr.on = true;
    ptr.at = performance.now();
  };
  const opts = { passive: true } as const;
  window.addEventListener("pointermove", (e) => e.pointerType === "mouse" && at(e.clientX, e.clientY), opts);
  window.addEventListener("pointerdown", (e) => at(e.clientX, e.clientY), opts);
  window.addEventListener("touchmove", (e) => e.touches[0] && at(e.touches[0].clientX, e.touches[0].clientY), opts);
  document.documentElement.addEventListener("mouseleave", () => (ptr.on = false));

  let last = 0;
  let seen = true;
  let raf = 0;
  const frame = (now: number) => {
    raf = 0;
    clock += Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    // A finger books where it is and then lets go; a mouse that has stopped stops booking.
    if (ptr.on && now - ptr.at > 700) ptr.on = false;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    draw();
    wake();
  };
  const wake = () => {
    if (!raf && seen && !document.hidden) raf = requestAnimationFrame(frame);
  };
  new IntersectionObserver(([e]) => {
    seen = e.isIntersecting;
    last = performance.now();
    wake();
  }).observe(hero);
  document.addEventListener("visibilitychange", () => {
    last = performance.now();
    wake();
  });
  new ResizeObserver(lay).observe(hero);
  lay();
  wake();
}
