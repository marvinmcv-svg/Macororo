import { useMemo } from 'react';
import { M } from '../data/project';
import { TOP_FLOOR, FIRST_RES_FLOOR, TYPOLOGIES, type Typology } from '../data/units';

export type ViewTime = 'mañana' | 'tarde' | 'noche';

const LOOK: Record<ViewTime, { filter: string; tint: string; lights: number }> = {
  mañana: { filter: 'brightness(1.06) saturate(1.05) contrast(1.02)', tint: 'linear-gradient(180deg, rgba(255,244,225,.9), rgba(255,255,255,1) 60%)', lights: 0 },
  tarde: { filter: 'sepia(.35) saturate(1.35) brightness(.92) contrast(1.05)', tint: 'linear-gradient(180deg, #ffb48a, #ffe1c4 45%, #fff6ec)', lights: 0.25 },
  noche: { filter: 'brightness(.22) saturate(.5) contrast(1.2) hue-rotate(185deg)', tint: 'linear-gradient(180deg, #5a6fb0, #9ab0e6)', lights: 1 },
};

function cityLights() {
  const c = document.createElement('canvas');
  c.width = 800;
  c.height = 600;
  const g = c.getContext('2d')!;
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 1500; i++) {
    const y = 140 + Math.pow(r(), 0.7) * 460;
    const x = r() * 800;
    const size = 0.6 + (y / 600) * 1.8 * r();
    const grd = g.createRadialGradient(x, y, 0, x, y, size * 3);
    const warm = r() < 0.75;
    grd.addColorStop(0, warm ? 'rgba(255,210,140,.95)' : 'rgba(210,230,255,.9)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(x - size * 3, y - size * 3, size * 6, size * 6);
  }
  return c.toDataURL();
}

export function ViewSim({ floor, time, label }: { floor: number; time: ViewTime; label?: string }) {
  const lights = useMemo(cityLights, []);
  const k = (floor - FIRST_RES_FLOOR) / (TOP_FLOOR - FIRST_RES_FLOOR); // 0 low .. 1 high
  const look = LOOK[time];
  return (
    <div className="view">
      <div
        className="city"
        style={{
          backgroundImage: `url(${M('view-balcony.webp')})`,
          // real view from a Macororó 16|17 balcony; higher floors see more horizon, less street
          backgroundPosition: `50% ${78 - k * 46}%`,
          backgroundSize: `${118 - k * 14}% auto`,
          filter: look.filter,
        }}
      />
      <div className="tint" style={{ background: look.tint }} />
      <div className="lights" style={{ backgroundImage: `url(${lights})`, backgroundSize: 'cover', opacity: look.lights, mixBlendMode: 'screen' }} />
      <div className="glass" />
      <div className="rail" />
      <div className="frame" />
      {label && <div className="vlabel">{label}</div>}
    </div>
  );
}

/** Schematic floor plans (referential) for typologies without a supplied drawing. */
export function PlanSVG({ dorms }: { dorms: Typology }) {
  if (dorms === 1) return <img src={TYPOLOGIES[1].plan} alt="Plano 1 dormitorio" className="plan-svg" />;
  type R = [number, number, number, number, string];
  const layouts: Record<2 | 3 | 4, R[]> = {
    2: [[2, 2, 34, 30, 'Suite'], [36, 2, 30, 30, 'Living'], [66, 2, 32, 30, 'Comedor'], [2, 32, 26, 24, 'Dorm. 2'], [28, 32, 16, 14, 'Baño'], [28, 46, 16, 10, 'Baño'], [44, 32, 30, 24, 'Cocina'], [74, 32, 24, 24, 'Servicio']],
    3: [[2, 2, 30, 28, 'Suite'], [32, 2, 36, 28, 'Living'], [68, 2, 30, 28, 'Comedor'], [2, 30, 24, 26, 'Dorm. 2'], [26, 30, 24, 26, 'Dorm. 3'], [50, 30, 14, 13, 'Baño'], [50, 43, 14, 13, 'Baño'], [64, 30, 20, 26, 'Cocina'], [84, 30, 14, 26, 'Serv.']],
    4: [[2, 2, 28, 26, 'Suite'], [30, 2, 40, 26, 'Living'], [70, 2, 28, 26, 'Comedor'], [2, 28, 22, 28, 'Dorm. 2'], [24, 28, 22, 28, 'Dorm. 3'], [46, 28, 20, 28, 'Dorm. 4'], [66, 28, 12, 14, 'Baño'], [66, 42, 12, 14, 'Baño'], [78, 28, 20, 28, 'Cocina']],
  };
  return (
    <svg viewBox="0 0 100 66" className="plan-svg">
      <path d="M2 2 H98" stroke="#2BE35A" strokeWidth="1.2" />
      <path d="M2 -6 Q50 -14 98 -6" fill="none" stroke="#999" strokeWidth=".5" transform="translate(0 6)" />
      {layouts[dorms as 2 | 3 | 4].map(([x, y, w, h, n]) => (
        <g key={n + x + y}>
          <rect x={x} y={y} width={w} height={h} fill={n.startsWith('Living') || n.startsWith('Comedor') ? '#f2fbf4' : '#fafaf8'} stroke="#111" strokeWidth=".8" />
          <text x={x + w / 2} y={y + h / 2 + 1.2} textAnchor="middle" fontSize="3.2" fontFamily="Inter, sans-serif" fontWeight="600" fill="#333">{n}</text>
        </g>
      ))}
      <text x="97" y="64" textAnchor="end" fontSize="2.6" fill="#888" fontFamily="Inter, sans-serif">Balcón ↑ · Plano referencial</text>
    </svg>
  );
}
