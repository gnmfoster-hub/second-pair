/**
 * TRIAL. Grounds for the hero that answer a finger or a mouse, drawn on one canvas
 * behind everything: ?sky=msgs, ?sky=diary, ?sky=torch, ?sky=field.
 *
 * Loaded only when one of them is asked for, after the page has painted, so it
 * costs the first screen nothing. Each keeps moving by itself, slowly, so there is
 * something to see before anyone touches it.
 */

const PAPER = "#f7f4ec";
const INK = "22, 21, 15";
const COBALT = "31, 59, 227";

type Ptr = { x: number; y: number; on: boolean; at: number };
type Tap = { x: number; y: number; t: number };
type Stage = {
  g: CanvasRenderingContext2D;
  W: number;
  H: number;
  wide: boolean;
  /** Middle of the phone in the hand. */
  ax: number;
  ay: number;
  /** The phone and the diary beside it: nothing drawn under these is seen. */
  row: { l: number; t: number; r: number; b: number };
  /** 0 where the words are, 1 where the ground is free to be loud. */
  room: (x: number, y: number) => number;
  /** Open paper: not under the words, not hidden behind the phone. */
  open: (x: number, y: number) => boolean;
  ptr: Ptr;
  taps: Tap[];
  font: string;
};
type Scene = { lay?: (s: Stage) => void; draw: (s: Stage, t: number, dt: number) => void };

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

function box(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/* ───────────────────────────────────────────────────────────── msgs */

const ASKS = [
  "Any space on Friday?",
  "Are you free Saturday?",
  "Can I book for two?",
  "Do you do evenings?",
  "How much is a full set?",
  "Is 9am too early?",
  "Can I come in today?",
  "Still got that 2pm?",
  "Need a quote please",
  "Do you take card?",
];

function msgs(): Scene {
  type B = { x: number; y: number; w: number; born: number; text: string; done: number; due: number; tail: number; sway: number };
  let list: B[] = [];
  let next = 0.3;
  let n = 0;
  let seen = 0;
  const TALL = 38;

  const add = (s: Stage, t: number, x?: number, y?: number) => {
    const text = ASKS[n++ % ASKS.length];
    s.g.font = `500 14px ${s.font}`;
    const w = s.g.measureText(text).width + 30;
    let due = t + 0.9;
    if (x === undefined) {
      // Somewhere on open paper, a fair way from the phone it is heading for.
      for (let i = 0; i < 30; i++) {
        const tx = rnd(w / 2 + 8, s.W - w / 2 - 8);
        const ty = rnd(74, Math.min(s.H, s.row.b + 60));
        if (!s.open(tx, ty) || Math.hypot(tx - s.ax, ty - s.ay) < 250) continue;
        if (list.some((b) => Math.abs(b.x - tx) < (b.w + w) / 2 + 10 && Math.abs(b.y - ty) < TALL + 14)) continue;
        x = tx;
        y = ty;
        break;
      }
      if (x === undefined || y === undefined) return;
      due = t + rnd(4, 9);
    }
    list.push({ x, y: y ?? 0, w, born: t, text, done: 0, due, tail: Math.random() < 0.5 ? -1 : 1, sway: rnd(0, 6.28) });
  };

  return {
    draw(s, t, dt) {
      const { g } = s;
      for (const tap of s.taps) if (tap.t > seen) add(s, t, tap.x, tap.y);
      seen = t;
      if (t > next && list.length < (s.wide ? 7 : 4)) {
        add(s, t);
        next = t + rnd(0.9, 1.9);
      }
      g.textBaseline = "middle";
      g.textAlign = "center";
      list = list.filter((b) => {
        // Every question is on its way to the phone, and slips in behind it.
        const dx = s.ax - b.x;
        const dy = s.ay - b.y;
        const d = Math.hypot(dx, dy) || 1;
        const v = (b.done ? 46 : 20) * dt;
        b.x += (dx / d) * v;
        b.y += (dy / d) * v;
        const x = b.x + Math.sin(t * 0.7 + b.sway) * 5;
        const near = s.ptr.on && Math.abs(s.ptr.x - x) < b.w / 2 + 30 && Math.abs(s.ptr.y - b.y) < TALL / 2 + 30;
        if (!b.done && (near || t > b.due)) b.done = t;
        if (d < 46) return false;
        const a = Math.min(1, (t - b.born) / 0.5) * smooth(46, 120, d);
        const k = b.done ? pop((t - b.done) / 0.32) : pop((t - b.born) / 0.4);
        g.save();
        g.translate(x, b.y);
        g.scale(k, k);
        g.globalAlpha = a;
        box(g, -b.w / 2, -TALL / 2, b.w, TALL, 14);
        g.moveTo(b.tail * (b.w / 2 - 24), TALL / 2 - 1);
        g.lineTo(b.tail * (b.w / 2 - 12), TALL / 2 + 10);
        g.lineTo(b.tail * (b.w / 2 - 10), TALL / 2 - 1);
        if (b.done) {
          g.fillStyle = `rgb(${COBALT})`;
          g.fill();
          g.fillStyle = PAPER;
          g.font = `600 14px ${s.font}`;
          g.fillText("\u2713  Answered", 0, 1);
        } else {
          g.fillStyle = PAPER;
          g.fill();
          g.strokeStyle = `rgba(${INK}, 0.55)`;
          g.lineWidth = 1.25;
          g.stroke();
          g.fillStyle = `rgba(${INK}, 0.8)`;
          g.font = `500 14px ${s.font}`;
          g.fillText(b.text, 0, 1);
        }
        g.restore();
        return true;
      });
    },
  };
}

/* ──────────────────────────────────────────────────────────── diary */

const ROW = 52;
const slotTime = (r: number) => {
  const m = 8 * 60 + r * 30;
  return `${Math.floor(m / 60) % 24}:${m % 60 ? "30" : "00"}`;
};

function rule(s: Stage, cw: number, alpha: number) {
  const { g } = s;
  g.strokeStyle = `rgba(${INK}, ${alpha})`;
  g.lineWidth = 1;
  g.beginPath();
  for (let x = cw; x < s.W - 1; x += cw) {
    g.moveTo(Math.round(x) + 0.5, 0);
    g.lineTo(Math.round(x) + 0.5, s.H);
  }
  for (let y = ROW; y < s.H; y += ROW) {
    g.moveTo(0, y + 0.5);
    g.lineTo(s.W, y + 0.5);
  }
  g.stroke();
}

function slot(s: Stage, cw: number, c: number, r: number, k: number, alpha: number) {
  const { g } = s;
  const x = c * cw + 4;
  const y = r * ROW + 4;
  const w = cw - 8;
  const h = ROW - 8;
  g.save();
  g.translate(x + w / 2, y + h / 2);
  g.scale(k, k);
  g.globalAlpha = alpha;
  box(g, -w / 2, -h / 2, w, h, 9);
  g.fillStyle = `rgb(${COBALT})`;
  g.fill();
  g.fillStyle = PAPER;
  g.font = `600 12px ${s.font}`;
  g.textAlign = "left";
  g.textBaseline = "top";
  g.fillText(slotTime(r), -w / 2 + 8, -h / 2 + 7);
  g.globalAlpha = alpha * 0.55;
  box(g, -w / 2 + 8, h / 2 - 15, Math.min(w - 16, 26 + ((c * 7 + r * 13) % 5) * 6), 5, 2.5);
  g.fill();
  g.restore();
}

function diary(): Scene {
  type S = { c: number; r: number; born: number; mine: boolean };
  let cw = 60;
  let cols = 7;
  let slots: S[] = [];
  let next = 0.4;
  const taken = (c: number, r: number) => slots.some((b) => b.c === c && b.r === r);

  return {
    lay(s) {
      cols = s.wide ? Math.round(s.W / 110) : 5;
      cw = s.W / cols;
      slots = [];
    },
    draw(s, t) {
      const { g } = s;
      rule(s, cw, 0.13);
      // The ruling stays out from under the words.
      if (s.wide) {
        const fade = g.createLinearGradient(s.W * 0.2, 0, s.W * 0.42, 0);
        fade.addColorStop(0, PAPER);
        fade.addColorStop(1, "rgba(247, 244, 236, 0)");
        g.fillStyle = fade;
        g.fillRect(0, 0, s.W, s.H);
      }

      if (s.ptr.on) {
        const c = Math.floor(s.ptr.x / cw);
        const r = Math.floor(s.ptr.y / ROW);
        if (c >= 0 && c < cols && !taken(c, r)) slots.push({ c, r, born: t, mine: true });
      }
      if (t > next) {
        next = t + rnd(0.45, 1);
        for (let i = 0; i < 14; i++) {
          const c = Math.floor(rnd(0, cols));
          const r = Math.floor(rnd(1.4, Math.min(s.H, s.row.b + 80) / ROW));
          if (taken(c, r) || !s.open((c + 0.5) * cw, (r + 0.5) * ROW)) continue;
          slots.push({ c, r, born: t, mine: false });
          break;
        }
      }
      const life = (b: S) => (b.mine ? 5 : s.wide ? 13 : 9);
      slots = slots.filter((b) => t - b.born < life(b) + 0.8);
      for (const b of slots) {
        const age = t - b.born;
        const room = b.mine ? Math.max(s.wide ? 0.14 : 0.3, s.room((b.c + 0.5) * cw, (b.r + 0.5) * ROW)) : 1;
        slot(s, cw, b.c, b.r, pop(age / 0.34), Math.min(1, age / 0.14) * (1 - smooth(life(b), life(b) + 0.8, age)) * room * 0.94);
      }
    },
  };
}

/* ──────────────────────────────────────────────────────────── torch */

function torch(): Scene {
  let page: HTMLCanvasElement | null = null;
  let scale = 1;
  let x = 0;
  let y = 0;
  let r = 0;

  return {
    lay(s) {
      // A whole booked-up week, drawn once and then only ever shown through the light.
      scale = Math.min(window.devicePixelRatio || 1, 1.5);
      page = document.createElement("canvas");
      page.width = Math.round(s.W * scale);
      page.height = Math.round(s.H * scale);
      const pg = page.getContext("2d")!;
      pg.setTransform(scale, 0, 0, scale, 0, 0);
      const cols = s.wide ? Math.round(s.W / 110) : 5;
      const cw = s.W / cols;
      const on: Stage = { ...s, g: pg };
      rule(on, cw, 0.3);
      for (let c = 0; c < cols; c++)
        for (let row = 0; row * ROW < s.H; row++) if ((c * 31 + row * 17 + ((c * row) % 3)) % 5 < 3) slot(on, cw, c, row, 1, 0.94 * Math.max(s.wide ? 0.1 : 0.3, s.room((c + 0.5) * cw, (row + 0.5) * ROW)));
      x = s.wide ? s.row.r + 180 : s.W * 0.6;
      y = s.wide ? s.ay : s.row.t - 120;
      r = 0;
    },
    draw(s, t, dt) {
      if (!page) return;
      const { g } = s;
      const held = s.ptr.on;
      // Left alone it wanders the open paper beside the phone, not behind it.
      const tx = held ? s.ptr.x : s.wide ? s.ax + Math.cos(t * 0.3) * ((s.row.r - s.row.l) / 2 + 60) + 120 : s.W * 0.6 + Math.sin(t * 0.34) * 130;
      const ty = held ? s.ptr.y : s.wide ? s.ay + Math.sin(t * 0.3) * 330 : s.row.t - 120 + Math.sin(t * 0.23 + 1) * 110;
      const ease = 1 - Math.exp(-dt * (held ? 12 : 2.2));
      x += (tx - x) * ease;
      y += (ty - y) * ease;
      const want = (s.wide ? 230 : 150) * (held ? 1.12 : 1);
      r += (want - r) * (1 - Math.exp(-dt * 5));
      const x0 = Math.max(0, Math.floor(x - r));
      const y0 = Math.max(0, Math.floor(y - r));
      const w = Math.min(s.W, Math.ceil(x + r)) - x0;
      const h = Math.min(s.H, Math.ceil(y + r)) - y0;
      if (w <= 0 || h <= 0) return;
      g.drawImage(page, x0 * scale, y0 * scale, w * scale, h * scale, x0, y0, w, h);
      g.globalCompositeOperation = "destination-in";
      const light = g.createRadialGradient(x, y, 0, x, y, r);
      light.addColorStop(0, "rgba(0, 0, 0, 1)");
      light.addColorStop(0.62, "rgba(0, 0, 0, 0.96)");
      light.addColorStop(1, "rgba(0, 0, 0, 0)");
      g.fillStyle = light;
      g.fillRect(0, 0, s.W, s.H);
      g.globalCompositeOperation = "source-over";
    },
  };
}

/* ──────────────────────────────────────────────────────────── field */

function field(): Scene {
  let gap = 28;
  const shades = 6;

  return {
    lay(s) {
      gap = s.wide ? 32 : 26;
    },
    draw(s, t) {
      const { g } = s;
      const held = s.ptr.on;
      // Left alone, the grain turns round something circling the phone.
      const px = held ? s.ptr.x : s.ax + Math.cos(t * 0.4) * (s.wide ? 210 : 120);
      const py = held ? s.ptr.y : s.ay + Math.sin(t * 0.31) * (s.wide ? 170 : 240);
      const reach = (s.wide ? 250 : 190) * (held ? 1 : 0.8);
      const hot: number[][] = Array.from({ length: shades }, () => []);
      g.lineCap = "round";
      g.beginPath();
      for (let y = gap / 2; y < s.H; y += gap) {
        for (let x = gap / 2; x < s.W; x += gap) {
          const dx = px - x;
          const dy = py - y;
          const d = Math.hypot(dx, dy);
          let k = 1 - smooth(0, reach, d);
          for (const tap of s.taps) {
            const ring = (t - tap.t) * 520;
            const off = Math.abs(Math.hypot(tap.x - x, tap.y - y) - ring);
            if (off < 70) k = Math.max(k, (1 - off / 70) * (1 - smooth(0.5, 1.5, t - tap.t)));
          }
          if (s.wide) k *= Math.max(0.22, s.room(x, y));
          const a = Math.atan2(dy, dx) + (1 - k) * Math.sin(x * 0.011 + y * 0.008 + t * 0.5) * 0.9;
          const len = 3.2 + k * 8.5;
          const cx = Math.cos(a) * len;
          const cy = Math.sin(a) * len;
          if (k > 0.06) {
            hot[Math.min(shades - 1, Math.floor(k * shades))].push(x - cx, y - cy, x + cx, y + cy);
          } else {
            g.moveTo(x - cx, y - cy);
            g.lineTo(x + cx, y + cy);
          }
        }
      }
      g.strokeStyle = `rgba(${INK}, 0.2)`;
      g.lineWidth = 1.4;
      g.stroke();
      hot.forEach((seg, i) => {
        if (!seg.length) return;
        const k = (i + 0.5) / shades;
        g.beginPath();
        for (let j = 0; j < seg.length; j += 4) {
          g.moveTo(seg[j], seg[j + 1]);
          g.lineTo(seg[j + 2], seg[j + 3]);
        }
        g.strokeStyle = `rgba(${COBALT}, ${0.3 + k * 0.7})`;
        g.lineWidth = 1.4 + k * 1.9;
        g.stroke();
      });
    },
  };
}

/* ───────────────────────────────────────────────────────────── stage */

const SCENES: Record<string, () => Scene> = { msgs, diary, torch, field };

export function startLive(kind: string, hero: HTMLElement, layer: HTMLElement) {
  const make = SCENES[kind];
  if (!make) return;
  const scene = make();
  const cv = document.createElement("canvas");
  cv.className = "sp-hero-live";
  layer.appendChild(cv);
  const g = cv.getContext("2d");
  if (!g) return;

  const s: Stage = {
    g,
    W: 0,
    H: 0,
    wide: false,
    ax: 0,
    ay: 0,
    row: { l: 0, t: 0, r: 0, b: 0 },
    room: () => 1,
    open: () => true,
    ptr: { x: 0, y: 0, on: false, at: 0 },
    taps: [],
    font: getComputedStyle(document.body).fontFamily,
  };
  let dpr = 1;

  const lay = () => {
    const r = hero.getBoundingClientRect();
    if (Math.abs(r.width - s.W) < 1 && Math.abs(r.height - s.H) < 1) return;
    s.W = r.width;
    s.H = r.height;
    s.wide = s.W >= 1024;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    cv.width = Math.round(s.W * dpr);
    cv.height = Math.round(s.H * dpr);
    const shell = hero.querySelector<HTMLElement>('img[src*="hand-front"]')?.closest("span")?.parentElement;
    const ph = shell?.getBoundingClientRect();
    const rw = shell?.parentElement?.getBoundingClientRect();
    if (ph && rw && ph.width) {
      s.ax = ph.left - r.left + ph.width / 2;
      s.ay = ph.top - r.top + ph.height / 2;
      s.row = { l: rw.left - r.left, t: rw.top - r.top, r: rw.right - r.left, b: rw.bottom - r.top };
    } else {
      s.ax = s.wide ? s.W * 0.66 : s.W / 2;
      s.ay = s.wide ? s.H * 0.45 : s.H * 0.4;
      s.row = { l: s.ax - 130, t: s.ay - 260, r: s.ax + 130, b: s.ay + 260 };
    }
    const { row } = s;
    // Where the words end is measured: the headline, and the paragraph under it.
    let words = s.W * 0.42;
    let line = 0;
    const h1 = hero.querySelector("h1")?.getBoundingClientRect();
    if (h1) {
      line = h1.top - r.top + h1.height * 0.2;
      if (s.wide) {
        words = h1.right - r.left;
        const para = hero.querySelector('p[class*="max-w"]')?.getBoundingClientRect();
        if (para) words = Math.max(words, para.right - r.left);
      }
    }
    s.room = s.wide
      ? (x) => smooth(words - 30, words + 40, x)
      : (x, y) => 1 - 0.7 * (1 - smooth(s.W * 0.42, s.W * 0.6, x)) * (1 - smooth(row.t - 60, row.t, y));
    s.open = (x, y) => {
      if (x > row.l - 24 && x < row.r + 24 && y > row.t - 16 && y < row.b + 16) return false;
      return s.wide ? x > words + 60 : y > row.t - 10 || x > s.W * 0.7 || (x > s.W * 0.5 && y > line);
    };
    scene.lay?.(s);
  };

  const at = (cx: number, cy: number, tap: boolean) => {
    const r = hero.getBoundingClientRect();
    if (cy < r.top || cy > r.bottom) return;
    s.ptr.x = cx - r.left;
    s.ptr.y = cy - r.top;
    s.ptr.on = true;
    s.ptr.at = performance.now();
    if (tap) s.taps.push({ x: s.ptr.x, y: s.ptr.y, t: clock });
  };
  const opts = { passive: true } as const;
  window.addEventListener("pointermove", (e) => e.pointerType === "mouse" && at(e.clientX, e.clientY, false), opts);
  window.addEventListener("pointerdown", (e) => at(e.clientX, e.clientY, true), opts);
  window.addEventListener("touchmove", (e) => e.touches[0] && at(e.touches[0].clientX, e.touches[0].clientY, false), opts);
  document.documentElement.addEventListener("mouseleave", () => (s.ptr.on = false));

  let clock = 0;
  let last = 0;
  let seen = true;
  let raf = 0;
  const frame = (now: number) => {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    clock += dt;
    // A finger that has lifted lets go after a moment; a mouse stays until it leaves.
    if (s.ptr.on && now - s.ptr.at > 2600) s.ptr.on = false;
    s.taps = s.taps.filter((tap) => clock - tap.t < 1.6);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, s.W, s.H);
    scene.draw(s, clock, dt);
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
