import { useEffect, useMemo, useRef, useState } from 'react';
import { M } from '../data/project';
import { FIRST_RES_FLOOR, TOP_FLOOR, type TowerId, type Unit } from '../data/units';

/**
 * Photoreal stage: the real drone photograph of Macororó 16 | 17 with every residential unit
 * mapped onto its floor band of the actual facade. Colours, hover and picking are drawn as an
 * SVG layer in image space (1440 × 1440), so it stays registered at any zoom.
 */

const IMG = 1440;
const PHOTO = M('aerial-site.webp');

// Facade registration measured on aerial-site.webp
type Geo = { yTop: number; h: number; lTop: number; rTop: number; yRef: number; lRef: number; rRef: number; clip: number };
const GEO: Record<TowerId, Geo> = {
  '16': { yTop: 310, h: 21.6, lTop: 577, rTop: 733, yRef: 915, lRef: 583, rRef: 739, clip: 912 },
  '17': { yTop: 300, h: 21.6, lTop: 780, rTop: 948, yRef: 1100, lRef: 786, rRef: 944, clip: 1060 },
};

const edge = (g: Geo, y: number) => {
  const t = (y - g.yTop) / (g.yRef - g.yTop);
  return [g.lTop + (g.lRef - g.lTop) * t, g.rTop + (g.rRef - g.rTop) * t];
};

export function floorBand(tower: TowerId, floor: number) {
  const g = GEO[tower];
  const top = g.yTop + (TOP_FLOOR - floor) * g.h;
  const bot = top + g.h;
  return { top, bot, visible: bot <= g.clip };
}

function unitPoly(u: Unit) {
  const g = GEO[u.tower];
  const { top, bot } = floorBand(u.tower, u.floor);
  // glazing only: keep the white balcony slab visible between floors
  const y0 = top + g.h * 0.3;
  const y1 = bot - g.h * 0.08;
  const [l0, r0] = edge(g, y0);
  const [l1, r1] = edge(g, y1);
  const pad = 0.012;
  const a = u.index / u.perFloor + pad;
  const b = (u.index + 1) / u.perFloor - pad;
  const x = (l: number, r: number, t: number) => l + (r - l) * t;
  return `${x(l0, r0, a)},${y0} ${x(l0, r0, b)},${y0} ${x(l1, r1, b)},${y1} ${x(l1, r1, a)},${y1}`;
}

export type Focus = { tower: TowerId | 'all'; floor?: number };

// time-of-day grading of the real photograph
function grade(hour: number) {
  const night = hour < 5.8 || hour > 19.2;
  const golden = (hour >= 5.8 && hour < 7.6) || (hour > 16.8 && hour <= 19.2);
  if (night)
    return { filter: 'brightness(.34) saturate(.55) contrast(1.15) hue-rotate(195deg)', tint: 'linear-gradient(180deg, rgba(20,30,80,.55), rgba(5,8,20,.35))', lights: 1 };
  if (golden) {
    const dusk = hour > 12;
    return {
      filter: `sepia(.32) saturate(1.35) brightness(${dusk ? 0.88 : 0.95}) contrast(1.06)`,
      tint: dusk ? 'linear-gradient(180deg, rgba(255,120,60,.42), rgba(255,170,110,.12) 55%, rgba(60,30,60,.25))' : 'linear-gradient(180deg, rgba(255,170,120,.35), rgba(255,220,180,.08) 60%)',
      lights: dusk ? 0.45 : 0.15,
    };
  }
  return { filter: 'saturate(1.04) contrast(1.02)', tint: 'transparent', lights: 0 };
}

export type RealStageProps = {
  units: Unit[];
  colorFn: (u: Unit) => string | null;
  selectedId?: string | null;
  floorSel?: { tower: TowerId; floor: number } | null;
  focus: Focus;
  hour?: number;
  interactive?: boolean;
  panelRight?: number; // px reserved on the right for the side panel
  panelBottom?: number; // px reserved at the bottom (mobile sheet)
  drift?: boolean; // slow cinematic drift (hero)
  onPick?: (u: Unit) => void;
  onHover?: (u: Unit | null, x: number, y: number) => void;
  showSun?: boolean;
};

export default function RealStage({
  units, colorFn, selectedId, floorSel, focus, hour = 12.5, interactive = true, panelRight = 0, panelBottom = 0, drift, onPick, onHover, showSun,
}: RealStageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 800 });
  const [pan, setPan] = useState({ x: 0, y: 0, z: 1 });
  const [dragging, setDragging] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null);

  useEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // reset manual pan whenever the programmatic focus changes
  useEffect(() => setPan({ x: 0, y: 0, z: 1 }), [focus.tower, focus.floor]);

  const visW = size.w - panelRight;
  const visH = size.h - panelBottom;
  const cover = Math.max(size.w / IMG, size.h / IMG);

  // focus target in image space
  let fx = 765;
  let fy = 700;
  let zoom = 1;
  if (focus.tower !== 'all') {
    const g = GEO[focus.tower];
    fx = (g.lTop + g.rTop) / 2;
    if (focus.floor) {
      const b = floorBand(focus.tower, focus.floor);
      fy = Math.min(b.top, g.clip - 40);
      zoom = 1.6;
    } else {
      fy = 640;
      zoom = 1.25;
    }
  }
  const fitTowers = Math.min(visW / 520, visH / 900); // keep both towers in frame
  const s = Math.max(cover, fitTowers) * zoom * pan.z;
  let tx = visW / 2 - fx * s + pan.x;
  let ty = visH / 2 - fy * s + pan.y;
  // clamp so the photo always covers the stage
  tx = Math.min(0, Math.max(size.w - IMG * s, tx));
  ty = Math.min(0, Math.max(size.h - IMG * s, ty));

  const look = grade(hour);
  const lit = useMemo(() => {
    // deterministic set of lit windows for dusk / night
    const out: string[] = [];
    units.forEach((u, i) => {
      if (u.status !== 'disponible' && (i * 7919) % 10 < 7 && floorBand(u.tower, u.floor).visible) out.push(unitPoly(u));
    });
    return out;
  }, [units]);

  const visible = useMemo(() => units.filter((u) => floorBand(u.tower, u.floor).visible), [units]);

  const toImg = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  };

  const onDown = (e: React.PointerEvent) => {
    if (!interactive) return;
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (d && e.buttons) {
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (Math.hypot(dx, dy) > 4) {
        d.moved = true;
        setDragging(true);
        setPan((p) => ({ ...p, x: d.px + dx, y: d.py + dy }));
      }
    }
  };
  const onUp = () => {
    setDragging(false);
    setTimeout(() => (drag.current = null), 0);
  };
  const onWheel = (e: React.WheelEvent) => {
    if (!interactive) return;
    setPan((p) => ({ ...p, z: Math.min(3.5, Math.max(0.85, p.z * (e.deltaY < 0 ? 1.1 : 0.91))) }));
  };

  const sun = useMemo(() => {
    if (!showSun) return null;
    const t = Math.min(1, Math.max(0, (hour - 6.2) / (18.8 - 6.2)));
    const up = hour > 6 && hour < 19;
    return { x: 120 + t * 1200, y: 540 - Math.sin(t * Math.PI) * 230, up };
  }, [hour, showSun]);

  const hlBand = floorSel && floorBand(floorSel.tower, floorSel.floor);
  const hlGeo = floorSel && GEO[floorSel.tower];

  return (
    <div
      ref={ref}
      className={`real ${interactive ? 'interactive' : ''} ${dragging ? 'dragging' : ''}`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={() => { onUp(); setHoverId(null); onHover?.(null, 0, 0); }}
      onWheel={onWheel}
    >
      <div
        className={`real-photo ${drift ? 'drift' : ''}`}
        style={{ width: IMG, height: IMG, transform: `translate(${tx}px, ${ty}px) scale(${s})`, transition: dragging ? 'none' : undefined }}
      >
        <img src={PHOTO} alt="Macororó 16 | 17 — fotografía aérea" draggable={false} style={{ filter: look.filter }} />
        <div className="real-tint" style={{ background: look.tint }} />
        <svg viewBox={`0 0 ${IMG} ${IMG}`} className="real-svg">
          <defs>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.2" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          {sun && (
            <g opacity={sun.up ? 1 : 0.85}>
              <path d="M120 540 Q 720 80 1320 540" fill="none" stroke="rgba(255,255,255,.45)" strokeWidth="2" strokeDasharray="6 8" />
              <circle cx={sun.x} cy={sun.y} r={sun.up ? 34 : 22} fill={sun.up ? '#fff3c4' : '#dfe6ff'} filter="url(#glow)" />
              <circle cx={sun.x} cy={sun.y} r={sun.up ? 70 : 40} fill={sun.up ? 'rgba(255,220,140,.25)' : 'rgba(200,210,255,.15)'} />
            </g>
          )}
          {look.lights > 0 && (
            <g opacity={look.lights} style={{ mixBlendMode: 'screen' }}>
              {lit.map((p, i) => <polygon key={i} points={p} fill="#ffc37a" opacity={0.55 + ((i * 37) % 40) / 100} />)}
            </g>
          )}
          <g className="units">
            {visible.map((u) => {
              const c = colorFn(u);
              const inFloor = !floorSel || (u.tower === floorSel.tower && u.floor === floorSel.floor);
              const sel = u.id === selectedId;
              const hov = u.id === hoverId;
              if (!c && !sel && !hov) {
                return interactive ? <polygon key={u.id} points={unitPoly(u)} fill="transparent" data-id={u.id} /> : null;
              }
              return (
                <polygon
                  key={u.id}
                  points={unitPoly(u)}
                  data-id={u.id}
                  fill={sel ? '#ffffff' : c || 'rgba(255,255,255,.6)'}
                  fillOpacity={sel ? 0.95 : hov ? 0.9 : inFloor ? 0.62 : 0.22}
                  stroke={sel || hov ? '#ffffff' : 'none'}
                  strokeWidth={sel ? 2 : 1}
                  style={{ mixBlendMode: sel ? 'normal' : 'hard-light' }}
                />
              );
            })}
          </g>
          {hlBand && hlGeo && hlBand.visible && (() => {
            const [l0, r0] = edge(hlGeo, hlBand.top);
            const [l1, r1] = edge(hlGeo, hlBand.bot);
            return <polygon points={`${l0 - 8},${hlBand.top} ${r0 + 8},${hlBand.top} ${r1 + 8},${hlBand.bot} ${l1 - 8},${hlBand.bot}`} fill="none" stroke="#2BE35A" strokeWidth="2.5" filter="url(#glow)" />;
          })()}
          {interactive && (
            <g
              onPointerMove={(e) => {
                const id = (e.target as SVGElement).getAttribute('data-id');
                if (id !== hoverId) setHoverId(id);
                const u = id ? units.find((x) => x.id === id) || null : null;
                const p = toImg(e);
                onHover?.(u, p.sx, p.sy);
              }}
              onClick={(e) => {
                if (drag.current?.moved) return;
                const id = (e.target as SVGElement).getAttribute('data-id');
                const u = id && units.find((x) => x.id === id);
                if (u) onPick?.(u);
              }}
            >
              {visible.map((u) => <polygon key={u.id} points={unitPoly(u)} fill="transparent" data-id={u.id} style={{ cursor: 'pointer' }} />)}
            </g>
          )}
        </svg>
      </div>
      {floorSel && hlBand && hlGeo && (() => {
        const [l, r] = edge(hlGeo, hlBand.top);
        const x = (floorSel.tower === '16' ? l - 20 : r + 20) * s + tx;
        const y = (hlBand.top + hlBand.bot) / 2 * s + ty;
        return (
          <div className={`ex-big ${floorSel.tower === '16' ? 'left' : 'right'}`} style={{ left: x, top: y }}>
            PISO <b>{String(floorSel.floor).padStart(2, '0')}</b>
            {!hlBand.visible && <small>tras el podio</small>}
          </div>
        );
      })()}
    </div>
  );
}

export const HIDDEN_FLOORS = (t: TowerId) => {
  const out: number[] = [];
  for (let f = FIRST_RES_FLOOR; f <= TOP_FLOOR; f++) if (!floorBand(t, f).visible) out.push(f);
  return out;
};
