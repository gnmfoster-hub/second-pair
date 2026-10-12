/**
 * The ground of the hero: customers' questions drifting across the page toward the
 * phone, each one answered before it gets there. Touch one and it is answered on
 * the spot; tap open paper and somebody new asks.
 *
 * One canvas behind everything, so the questions slip in behind the phone. It is
 * fetched after the page has painted and costs the first screen nothing, and it
 * keeps moving in battery saver: it is the picture, not a flourish on one.
 */

const PAPER = "#f7f4ec";
const PANEL = "#fffdf4";
const INK = "#16150f";
const COBALT = "#1f3be3";

const ASKS = [
  "Any space Friday?",
  "Free on Saturday?",
  "Can I book for two?",
  "Do you do evenings?",
  "How much is it?",
  "Is 9am too early?",
  "Can I come in today?",
  "Still got that 2pm?",
  "Need a quote please",
  "Do you take card?",
];
const DONE = ["✓  Answered", "✓  Booked in"];

type Bubble = { x: number; y: number; w: number; born: number; text: string; done: number; due: number; tail: number; n: number; stuck: number };
type Box = { l: number; t: number; r: number; b: number };

const TALL = 42;
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

/** A speech bubble round the origin, tail and all. */
function bubble(g: CanvasRenderingContext2D, w: number, tail: number) {
  const x = -w / 2;
  const y = -TALL / 2;
  const r = 15;
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + TALL, r);
  g.arcTo(x + w, y + TALL, x, y + TALL, r);
  if (tail > 0) {
    g.lineTo(w / 2 - 14, TALL / 2);
    g.lineTo(w / 2 - 15, TALL / 2 + 12);
    g.lineTo(w / 2 - 30, TALL / 2);
  } else {
    g.lineTo(-w / 2 + 30, TALL / 2);
    g.lineTo(-w / 2 + 15, TALL / 2 + 12);
    g.lineTo(-w / 2 + 14, TALL / 2);
  }
  g.arcTo(x, y + TALL, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export function startMessages(hero: HTMLElement, layer: HTMLElement) {
  const cv = document.createElement("canvas");
  layer.appendChild(cv);
  const g = cv.getContext("2d");
  if (!g) return;

  const font = getComputedStyle(document.body).fontFamily;
  let W = 0;
  let H = 0;
  let dpr = 1;
  let wide = false;
  /** Middle of the phone, where every question is heading. */
  let ax = 0;
  let ay = 0;
  /** The phone and the diary beside it: nothing drawn under these is seen. */
  let row = { l: 0, t: 0, r: 0, b: 0 };
  /** Every line of words on the hero. A bubble under one would be two things unreadable. */
  let words: Box[] = [];
  let size = 15;

  const onWords = (x: number, y: number, w: number) =>
    words.some((b) => x + w / 2 + 8 > b.l && x - w / 2 - 8 < b.r && y + TALL / 2 + 16 > b.t && y - TALL / 2 - 6 < b.b);
  /** Open paper: not under the words, not hidden behind the phone. */
  const open = (x: number, y: number, w: number) =>
    !(x > row.l - 24 && x < row.r + 24 && y > row.t - 16 && y < row.b + 16) && !onWords(x, y, w);

  const lay = () => {
    const r = hero.getBoundingClientRect();
    if (Math.abs(r.width - W) < 1 && Math.abs(r.height - H) < 1) return;
    W = r.width;
    H = r.height;
    wide = W >= 1024;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    const shell = hero.querySelector<HTMLElement>('img[src*="hand-front"]')?.closest("span")?.parentElement;
    const ph = shell?.getBoundingClientRect();
    const rw = shell?.parentElement?.getBoundingClientRect();
    if (ph && rw && ph.width) {
      ax = ph.left - r.left + ph.width / 2;
      ay = ph.top - r.top + ph.height / 2;
      row = { l: rw.left - r.left, t: rw.top - r.top, r: rw.right - r.left, b: rw.bottom - r.top };
    } else {
      ax = wide ? W * 0.66 : W / 2;
      ay = wide ? H * 0.45 : H * 0.4;
      row = { l: ax - 130, t: ay - 260, r: ax + 130, b: ay + 260 };
    }
    size = wide ? 15 : 14;
    // Line by line, so the paper beside a short line of the headline still counts as open.
    words = [];
    const rowEl = shell?.parentElement;
    const walk = document.createTreeWalker(hero, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.textContent?.trim() || rowEl?.contains(n)) continue;
      range.selectNodeContents(n);
      for (const b of range.getClientRects())
        if (b.width > 2) words.push({ l: b.left - r.left, t: b.top - r.top, r: b.right - r.left, b: b.bottom - r.top });
    }
  };

  let list: Bubble[] = [];
  let next = 0.3;
  let count = 0;
  let clock = 0;
  const ptr = { x: 0, y: 0, on: false, at: 0 };

  const ask = (x?: number, y?: number) => {
    const n = count++;
    const text = ASKS[n % ASKS.length];
    g.font = `600 ${size}px ${font}`;
    const w = g.measureText(text).width + (wide ? 34 : 28);
    let due = clock + 0.9;
    if (x === undefined) {
      // Somewhere on open paper, a fair way from the phone it is heading for.
      for (let i = 0; i < 30; i++) {
        const tx = rnd(w / 2 + 8, W - w / 2 - 12);
        const ty = rnd(78, Math.min(H, row.b + 60));
        if (!open(tx, ty, w) || Math.hypot(tx - ax, ty - ay) < 250) continue;
        if (list.some((b) => Math.abs(b.x - tx) < (b.w + w) / 2 + 12 && Math.abs(b.y - ty) < TALL + 18)) continue;
        x = tx;
        y = ty;
        break;
      }
      if (x === undefined || y === undefined) return;
      due = clock + rnd(3.5, 8);
    } else if (!open(x, y ?? 0, w)) return;
    list.push({ x, y: y ?? 0, w, born: clock, text, done: 0, due, tail: Math.random() < 0.5 ? -1 : 1, n, stuck: 0 });
  };

  const draw = (dt: number) => {
    const t = clock;
    if (t > next && list.length < (wide ? 7 : 5)) {
      ask();
      next = t + rnd(0.8, 1.7);
    }
    g.textBaseline = "middle";
    g.textAlign = "center";
    g.lineJoin = "round";
    list = list.filter((b) => {
      const dx = ax - b.x;
      const dy = ay - b.y;
      const d = Math.hypot(dx, dy) || 1;
      // Straight for the phone, going round the words rather than under them.
      const v = (b.done ? 46 : 20) * dt;
      const nx = b.x + (dx / d) * v;
      const ny = b.y + (dy / d) * v;
      const down = b.y + Math.sign(dy) * v;
      if (!onWords(nx, ny, b.w)) {
        b.x = nx;
        b.y = ny;
        b.stuck = 0;
      } else if (!onWords(b.x, down, b.w)) {
        b.y = down;
        b.stuck = 0;
      } else if (!b.stuck) b.stuck = t;
      const x = b.x;
      const near = ptr.on && Math.abs(ptr.x - x) < b.w / 2 + 30 && Math.abs(ptr.y - b.y) < TALL / 2 + 30;
      if (!b.done && (near || t > b.due)) b.done = t;
      // One with no way round has said its piece: it goes once it has been answered.
      const gone = b.stuck && b.done ? smooth(1.2, 1.8, t - Math.max(b.stuck, b.done)) : 0;
      if (d < 46 || gone >= 1) return false;
      const k = b.done ? pop((t - b.done) / 0.32) : pop((t - b.born) / 0.4);
      g.save();
      g.translate(x, b.y);
      g.scale(k, k);
      g.globalAlpha = Math.min(1, (t - b.born) / 0.25) * smooth(46, 110, d) * (1 - gone);
      // The hard ink shadow every panel on the site stands on.
      g.translate(4, 4);
      bubble(g, b.w, b.tail);
      g.fillStyle = INK;
      g.fill();
      g.translate(-4, -4);
      bubble(g, b.w, b.tail);
      g.fillStyle = b.done ? (b.n % 3 === 2 ? INK : COBALT) : PANEL;
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = b.done ? PAPER : INK;
      g.font = `600 ${size}px ${font}`;
      g.fillText(b.done ? DONE[b.n % 3 === 2 ? 1 : 0] : b.text, 0, 1);
      g.restore();
      return true;
    });
  };

  const at = (cx: number, cy: number, tap: boolean) => {
    const r = hero.getBoundingClientRect();
    if (cy < r.top || cy > r.bottom) return;
    ptr.x = cx - r.left;
    ptr.y = cy - r.top;
    ptr.on = true;
    ptr.at = performance.now();
    if (tap) ask(ptr.x, ptr.y);
  };
  const opts = { passive: true } as const;
  window.addEventListener("pointermove", (e) => e.pointerType === "mouse" && at(e.clientX, e.clientY, false), opts);
  window.addEventListener("touchmove", (e) => e.touches[0] && at(e.touches[0].clientX, e.touches[0].clientY, false), opts);
  // A tap on a button or the demo is for them; only open paper asks a question.
  hero.addEventListener("click", (e) => !(e.target as Element).closest("a, button, input, textarea, label") && at(e.clientX, e.clientY, true));
  document.documentElement.addEventListener("mouseleave", () => (ptr.on = false));

  let last = 0;
  let seen = true;
  let raf = 0;
  const frame = (now: number) => {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    clock += dt;
    // A finger that has lifted lets go after a moment; a mouse stays until it leaves.
    if (ptr.on && now - ptr.at > 2600) ptr.on = false;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    draw(dt);
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
