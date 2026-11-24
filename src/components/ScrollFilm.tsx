import { useEffect, useMemo, useRef, useState } from 'react';
import { NEARBY } from '../data/project';
import { INVENTORY, STATUS_META, fmtUSD } from '../data/units';

/**
 * Scroll-scrubbed drone film (Apple-style image sequence on <canvas>).
 * Real drone footage of Macororó 16 | 17 — every scroll step advances the flight.
 */

const FRAMES = 180; // public/media/seq/f000..f179.webp (4 frames per second of footage)
const src = (i: number) => `/media/seq/f${String(i).padStart(3, '0')}.webp`;

type Chapter = {
  from: number; // frame index
  to: number;
  eyebrow: string;
  l1: string;
  l2: string;
  sub?: string;
  card?: 'stats' | 'availability' | 'unit' | 'nearby' | 'cta' | 'bridge';
};

const CHAPTERS: Chapter[] = [
  { from: 0, to: 28, eyebrow: 'Macororó 16 | 17 · City Park · Santa Cruz', l1: 'El ícono de', l2: 'las alturas.', sub: 'Dos torres de 37 pisos unidas por un puente estructural, sobre Av. Beni en la Zona Norte.', card: 'stats' },
  { from: 28, to: 48, eyebrow: 'Arquitectura', l1: 'Una fachada', l2: 'que ondula.', sub: 'Balcones curvos en cada nivel: la silueta que redefine el skyline cruceño.' },
  { from: 48, to: 76, eyebrow: 'Vistas panorámicas', l1: 'Cada piso,', l2: 'una postal.', sub: 'Vidrio de piso a techo y la ciudad desplegada frente a tu living.' },
  { from: 76, to: 104, eyebrow: 'Ingeniería', l1: 'Un puente', l2: 'en el cielo.', sub: 'Las torres se unen en altura con un puente estructural. Estructura sismo resistente.', card: 'bridge' },
  { from: 104, to: 132, eyebrow: 'Disponibilidad en vivo', l1: 'Elegí', l2: 'tu piso.', sub: 'Departamentos de 1 a 4 dormitorios, del piso 6 al 37.', card: 'availability' },
  { from: 132, to: 156, eyebrow: 'Ubicación', l1: 'Todo a', l2: '2 minutos.', sub: 'Cristo Redentor, restaurantes y supermercados a la vuelta.', card: 'nearby' },
  { from: 156, to: FRAMES, eyebrow: 'Entrega inmediata', l1: 'Construido.', l2: 'Listo para vivir.', sub: 'Agendá tu visita y conocelo en persona.', card: 'cta' },
];

export default function ScrollFilm({ onVisit }: { onVisit: () => void }) {
  const wrap = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const bg = useRef<HTMLCanvasElement>(null);
  const imgs = useRef<(HTMLImageElement | null)[]>(Array(FRAMES).fill(null));
  const target = useRef(0);
  const current = useRef(0);
  const drawn = useRef(-1);
  const [frame, setFrame] = useState(0);
  const [loaded, setLoaded] = useState(0);

  const counts = useMemo(() => {
    const c = { disponible: 0, reservado: 0, vendido: 0 };
    INVENTORY.forEach((u) => c[u.status]++);
    return c;
  }, []);
  const featured = INVENTORY.find((u) => u.id === '16-24A')!;

  // progressive preload: first frames immediately, the rest in order
  useEffect(() => {
    let alive = true;
    let done = 0;
    const load = (i: number) =>
      new Promise<void>((res) => {
        const im = new Image();
        im.decoding = 'async';
        im.onload = () => {
          if (!alive) return res();
          imgs.current[i] = im;
          done++;
          if (done % 6 === 0 || done === FRAMES) setLoaded(done);
          drawn.current = -1;
          res();
        };
        im.onerror = () => res();
        im.src = src(i);
      });
    (async () => {
      await Promise.all(Array.from({ length: 12 }, (_, i) => load(i * 15))); // coarse pass for instant scrubbing
      for (let i = 0; i < FRAMES; i += 6) {
        if (!alive) return;
        await Promise.all(Array.from({ length: 6 }, (_, k) => (i + k < FRAMES && !imgs.current[i + k] ? load(i + k) : Promise.resolve())));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const el = wrap.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      const p = Math.min(1, Math.max(0, -r.top / total));
      target.current = p * (FRAMES - 1);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      current.current += (target.current - current.current) * 0.16;
      const want = Math.round(current.current);
      // nearest loaded frame
      let i = want;
      for (let d = 0; d < FRAMES; d++) {
        if (imgs.current[want - d]) { i = want - d; break; }
        if (imgs.current[want + d]) { i = want + d; break; }
      }
      const im = imgs.current[i];
      if (!im || i === drawn.current) return;
      drawn.current = i;
      for (const c of [canvas.current, bg.current]) {
        if (!c) continue;
        const dpr = c === bg.current ? 0.25 : Math.min(window.devicePixelRatio, 2);
        const w = c.clientWidth * dpr;
        const h = c.clientHeight * dpr;
        if (c.width !== Math.round(w) || c.height !== Math.round(h)) {
          c.width = Math.round(w);
          c.height = Math.round(h);
        }
        const ctx = c.getContext('2d')!;
        const s = Math.max(c.width / im.width, c.height / im.height);
        const dw = im.width * s;
        const dh = im.height * s;
        ctx.drawImage(im, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
      }
      setFrame(i);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  const f = frame;
  const ci = Math.max(0, CHAPTERS.findIndex((c) => f >= c.from && f < c.to));
  const ch = CHAPTERS[ci === -1 ? CHAPTERS.length - 1 : ci];
  const local = (f - ch.from) / (ch.to - ch.from);
  const vis = Math.min(1, ci === 0 ? 1 : local / 0.12, ci === CHAPTERS.length - 1 ? 1 : (1 - local) / 0.12);
  const progress = f / (FRAMES - 1);

  return (
    <section className="film" ref={wrap} style={{ height: `${CHAPTERS.length * 115 + 100}vh` }}>
      <div className="film-stage">
        <canvas className="film-bg" ref={bg} aria-hidden />
        <div className="film-screen">
          <canvas ref={canvas} aria-label="Vuelo de drone alrededor de Macororó 16 | 17" />
          <div className="film-screen-ui mono">
            <span className="dot">En vivo · drone</span>
            <span>{String(Math.floor((f / 4) / 60))}:{String(Math.floor((f / 4) % 60)).padStart(2, '0')}</span>
          </div>
          {loaded < FRAMES && <div className="film-loading" style={{ width: `${(loaded / FRAMES) * 100}%` }} />}
        </div>

        <div className="film-copy" key={ci} style={{ opacity: Math.max(0, vis), transform: `translateY(${(1 - Math.max(0, Math.min(1, vis))) * 24}px)` }}>
          <div className="mono dot film-eyebrow">{ch.eyebrow}</div>
          <h2 className="display film-h">
            <span>{ch.l1}</span>
            <span className="g">{ch.l2}</span>
          </h2>
          {ch.sub && <p className="film-sub">{ch.sub}</p>}

          {ch.card === 'stats' && (
            <div className="film-stats">
              <div><b>37</b><span>pisos</span></div>
              <div><b>2</b><span>torres</span></div>
              <div><b>1–4</b><span>dormitorios</span></div>
            </div>
          )}
          {ch.card === 'bridge' && (
            <div className="film-card">
              <div className="mono muted">Estructura</div>
              <div className="film-row"><span>Sismo resistente</span><b>✓</b></div>
              <div className="film-row"><span>Puente estructural</span><b>Piso 21</b></div>
              <div className="film-row"><span>Pisos por torre</span><b>37</b></div>
            </div>
          )}
          {ch.card === 'availability' && (
            <div className="film-cards">
              <div className="film-card">
                <div className="mono muted">Disponibilidad</div>
                {(['disponible', 'reservado', 'vendido'] as const).map((s) => (
                  <div className="film-row" key={s}>
                    <span><i className="legend-dot" style={{ background: STATUS_META[s].color }} />{STATUS_META[s].label}</span>
                    <b>{counts[s]}</b>
                  </div>
                ))}
              </div>
              <a className="film-card film-unit" href="#/explorar?unidad=16-24A">
                <div className="mono muted">Destacado</div>
                <div className="film-unit-id">16-24A · 3 dorm</div>
                <div className="film-row"><span>{featured.area} m² · piso {featured.floor}</span><b>{fmtUSD(featured.price)}</b></div>
                <div className="film-link">Ver en el explorador →</div>
              </a>
            </div>
          )}
          {ch.card === 'nearby' && (
            <div className="film-chips">
              {NEARBY.map((p) => (
                <span key={p.id} className="film-chip"><b>{p.minutes} MIN</b> {p.name}</span>
              ))}
            </div>
          )}
          {ch.card === 'cta' && (
            <div className="hero-actions" style={{ marginTop: 22 }}>
              <a className="btn btn-green" href="#/explorar?modo=residencias">Explorar disponibilidad <span className="arrow">→</span></a>
              <button className="btn btn-ghost" onClick={onVisit}>Agendar visita</button>
            </div>
          )}
        </div>

        <div className="film-hud">
          <div className="film-count display">
            {String(ci + 1).padStart(2, '0')}<small>/{String(CHAPTERS.length).padStart(2, '0')}</small>
          </div>
          <div className="film-bar"><i style={{ width: `${progress * 100}%` }} /></div>
          <div className="mono film-hint">{progress < 0.02 ? 'Deslizá para volar ↓' : ch.eyebrow}</div>
        </div>
      </div>
    </section>
  );
}
