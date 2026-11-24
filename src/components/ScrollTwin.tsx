import { useEffect, useRef, useState } from 'react';
import { INVENTORY, STATUS_META, TYPOLOGIES, fmtUSD, type Status } from '../data/units';
import type { Twin } from '../three/Twin';

/**
 * Scroll-driven flight through the 3D twin. Scroll position → camera path (orbit-style
 * spherical interpolation) + scene state (availability, floor sweep, cutaway, day→night).
 */

const T16: [number, number] = [-19.5, 1.5];
const fy = (f: number) => 5 * 4.2 + (f - 6) * 3.05; // mirrors floorY() in Twin

type Key = { p: number; pos: [number, number, number]; tgt: [number, number, number] };
const KEYS: Key[] = [
  { p: 0.0, pos: [210, 120, 280], tgt: [0, 58, 0] },
  { p: 0.16, pos: [120, 72, 185], tgt: [0, 60, 0] },
  { p: 0.34, pos: [-70, 42, 130], tgt: [T16[0], 38, T16[1]] },
  { p: 0.54, pos: [-80, 118, 110], tgt: [T16[0], 92, T16[1]] },
  { p: 0.64, pos: [T16[0] + 20, fy(24) + 48, T16[1] + 38], tgt: [T16[0], fy(24), T16[1]] },
  { p: 0.8, pos: [T16[0] + 26, fy(24) + 40, T16[1] + 20], tgt: [T16[0], fy(24), T16[1]] },
  { p: 0.9, pos: [175, 70, -160], tgt: [0, 55, 0] },
  { p: 1.0, pos: [230, 95, 130], tgt: [0, 58, 0] },
];

type Chapter = { from: number; to: number; eyebrow: string; l1: string; l2: string; sub: string; card?: 'status' | 'floor' | 'unit' | 'night' | 'cta' };
const CHAPTERS: Chapter[] = [
  { from: 0, to: 0.16, eyebrow: 'Gemelo digital 3D', l1: 'Explorá', l2: 'en 3D.', sub: 'El modelo de Macororó 16 | 17 a escala real. Seguí deslizando.' },
  { from: 0.16, to: 0.34, eyebrow: 'Disponibilidad en vivo', l1: 'Cada depto,', l2: 'en tiempo real.', sub: 'Verde disponible, ámbar reservado, rojo vendido — sobre la fachada.', card: 'status' },
  { from: 0.34, to: 0.58, eyebrow: 'Altura', l1: 'Elegí tu', l2: 'piso.', sub: 'Del piso 6 al 37. Más alto, más horizonte.', card: 'floor' },
  { from: 0.58, to: 0.82, eyebrow: 'Por dentro', l1: 'Abrí la', l2: 'planta.', sub: 'La torre se abre y ves cada departamento del piso 24.', card: 'unit' },
  { from: 0.82, to: 0.95, eyebrow: 'Sol y vistas', l1: 'Del día', l2: 'a la noche.', sub: 'Simulación solar para Santa Cruz, hora por hora.', card: 'night' },
  { from: 0.95, to: 1.01, eyebrow: 'Explorador', l1: 'Tu próximo', l2: 'hogar.', sub: 'Filtrá por dormitorios, piso y presupuesto.', card: 'cta' },
];

const sm = (x: number) => x * x * (3 - 2 * x);

function sph(pos: number[], tgt: number[]) {
  const dx = pos[0] - tgt[0];
  const dy = pos[1] - tgt[1];
  const dz = pos[2] - tgt[2];
  const r = Math.hypot(dx, dy, dz);
  return { r, th: Math.atan2(dx, dz), ph: Math.acos(dy / r) };
}

function pose(p: number, fit = 1) {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].p <= p) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = sm(Math.min(1, Math.max(0, (p - a.p) / (b.p - a.p))));
  const tgt = a.tgt.map((v, k) => v + (b.tgt[k] - v) * t);
  const A = sph(a.pos, a.tgt);
  const B = sph(b.pos, b.tgt);
  let dth = B.th - A.th;
  if (dth > Math.PI) dth -= Math.PI * 2;
  if (dth < -Math.PI) dth += Math.PI * 2;
  const r = (A.r + (B.r - A.r) * t) * fit;
  const th = A.th + dth * t;
  const ph = A.ph + (B.ph - A.ph) * t;
  return {
    pos: { x: tgt[0] + r * Math.sin(ph) * Math.sin(th), y: tgt[1] + r * Math.cos(ph), z: tgt[2] + r * Math.sin(ph) * Math.cos(th) },
    tgt: { x: tgt[0], y: tgt[1], z: tgt[2] },
  };
}

export default function ScrollTwin() {
  const wrap = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const floorRef = useRef<HTMLSpanElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  const [ci, setCi] = useState(0);
  const [ready, setReady] = useState(false);
  const twin = useRef<Twin | null>(null);

  const counts = { disponible: 0, reservado: 0, vendido: 0 } as Record<Status, number>;
  INVENTORY.forEach((u) => counts[u.status]++);
  const featured = INVENTORY.find((u) => u.id === '16-24A')!;

  // create the 3D only when the section approaches the viewport
  useEffect(() => {
    let t: Twin | null = null;
    let alive = true;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting || t) return;
        io.disconnect();
        import('../three/Twin').then(({ Twin }) => {
          if (!alive || !stage.current) return;
          t = new Twin(stage.current, INVENTORY);
          t.setControlsEnabled(false);
          if (window.innerWidth <= 900) t.setFrameOffset(0, 0.16);
          else t.setFrameOffset(0.16, 0);
          twin.current = t;
          setReady(true);
        });
      },
      { rootMargin: '120% 0px' },
    );
    if (wrap.current) io.observe(wrap.current);
    return () => {
      alive = false;
      io.disconnect();
      t?.dispose();
      twin.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const t = twin.current!;
    let raf = 0;
    let cur = 0;
    const state = { mode: '', floor: -1, cut: false, hour: -1, ci: -1, p: -1 };
    const statusFn = (u: (typeof INVENTORY)[number]) => STATUS_META[u.status].color;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const el = wrap.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      const target = Math.min(1, Math.max(0, -r.top / (r.height - window.innerHeight)));
      cur += (target - cur) * 0.12;
      if (Math.abs(target - cur) < 0.0004) cur = target;
      const p = cur;
      if (p === state.p) return;
      state.p = p;

      const fit = Math.min(2.4, Math.max(1, 1.3 / (window.innerWidth / window.innerHeight)));
      const { pos, tgt } = pose(p, fit);
      t.setPose(pos, tgt);

      // scene state machine (only pushes changes)
      const mode = p >= 0.14 && p < 0.84 ? 'status' : 'natural';
      if (mode !== state.mode) {
        state.mode = mode;
        t.setColorFn(mode === 'status' ? statusFn : () => null);
      }
      const floor = p >= 0.36 && p < 0.58 ? Math.round(8 + ((p - 0.36) / 0.22) * 26) : -1;
      if (floor !== state.floor) {
        state.floor = floor;
        t.setHighlight(floor > 0 ? { tower: '16', floor } : null);
        if (floorRef.current && floor > 0) floorRef.current.textContent = String(floor).padStart(2, '0');
      }
      const cut = p >= 0.6 && p < 0.84;
      if (cut !== state.cut) {
        state.cut = cut;
        t.setCutaway(cut ? { tower: '16', floor: 24 } : null);
        t.setSelected(cut ? '16-24A' : null);
      }
      const hour = p < 0.82 ? 16.2 : Math.round((12 + Math.min(1, (p - 0.82) / 0.14) * 9.5) * 20) / 20;
      if (hour !== state.hour) {
        state.hour = hour;
        t.setHour(hour);
        if (clockRef.current) {
          const hh = Math.floor(hour);
          clockRef.current.textContent = `${String(hh).padStart(2, '0')}:${String(Math.round((hour - hh) * 60) % 60).padStart(2, '0')}`;
        }
      }

      let k = CHAPTERS.findIndex((c) => p >= c.from && p < c.to);
      if (k < 0) k = CHAPTERS.length - 1;
      if (k !== state.ci) { state.ci = k; setCi(k); }
      const ch = CHAPTERS[k];
      const local = (p - ch.from) / (ch.to - ch.from);
      const vis = Math.max(0, Math.min(1, k === 0 ? 1 : local / 0.14, k === CHAPTERS.length - 1 ? 1 : (1 - local) / 0.14));
      if (copyRef.current) {
        copyRef.current.style.opacity = String(vis);
        copyRef.current.style.transform = `translate3d(0, ${(1 - vis) * 24}px, 0)`;
      }
      if (barRef.current) barRef.current.style.transform = `scaleX(${p})`;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready]);

  const ch = CHAPTERS[ci];
  return (
    <section className="film twin-film" ref={wrap} style={{ height: '620vh' }}>
      <div className="film-stage">
        <div className="twin-film-3d" ref={stage} />
        {!ready && <div className="twin-film-loading mono dot">Cargando modelo 3D</div>}
        <div className="film-copy" key={ci} ref={copyRef}>
          <div className="mono dot film-eyebrow">{ch.eyebrow}</div>
          <h2 className="display film-h">
            <span>{ch.l1}</span>
            <span className="g">{ch.l2}</span>
          </h2>
          <p className="film-sub">{ch.sub}</p>
          {ch.card === 'status' && (
            <div className="film-card">
              <div className="mono muted">Disponibilidad</div>
              {(['disponible', 'reservado', 'vendido'] as Status[]).map((s) => (
                <div className="film-row" key={s}>
                  <span><i className="legend-dot" style={{ background: STATUS_META[s].color }} />{STATUS_META[s].label}</span>
                  <b>{counts[s]}</b>
                </div>
              ))}
            </div>
          )}
          {ch.card === 'floor' && (
            <div className="twin-floor display">PISO <b><span ref={floorRef}>08</span></b></div>
          )}
          {ch.card === 'unit' && (
            <a className="film-card film-unit" href="#/explorar?unidad=16-24A">
              <div className="mono muted">Torre 16 · Piso 24</div>
              <div className="film-unit-id">16-24A · {TYPOLOGIES[featured.dorms].short}</div>
              <div className="film-row"><span>{featured.area} m² · {STATUS_META[featured.status].label}</span><b>{fmtUSD(featured.price)}</b></div>
              <div className="film-link">Ver este departamento →</div>
            </a>
          )}
          {ch.card === 'night' && <div className="twin-floor display"><b><span ref={clockRef}>12:00</span></b></div>}
          {ch.card === 'cta' && (
            <div className="hero-actions" style={{ marginTop: 22 }}>
              <a className="btn btn-green" href="#/explorar">Abrir el explorador 3D <span className="arrow">→</span></a>
              <a className="btn btn-ghost" href="#/explorar?modo=residencias&solo=1">Ver disponibles</a>
            </div>
          )}
        </div>
        <div className="film-hud">
          <div className="film-count display">{String(ci + 1).padStart(2, '0')}<small>/{String(CHAPTERS.length).padStart(2, '0')}</small></div>
          <div className="film-bar"><i ref={barRef as React.RefObject<HTMLElement>} /></div>
          <div className="mono film-hint">{ch.eyebrow}</div>
        </div>
      </div>
    </section>
  );
}
