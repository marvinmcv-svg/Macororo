import { useEffect, useMemo, useRef, useState } from 'react';
import { AMENITIES, M, NEARBY, ORIGIN_PIN, PROJECT, waLink } from '../data/project';
import {
  DEFAULT_FILTERS, FIRST_RES_FLOOR, INVENTORY, STATUS_META, TOP_FLOOR, TYPOLOGIES,
  fmtUSD, matches, type Filters, type Status, type TowerId, type Unit,
} from '../data/units';
import { fmtHour, useLocalSet } from '../lib/hooks';
import { TowerScene } from '../three/TowerScene';
import LeadModal from './LeadModal';
import { PlanSVG, ViewSim, type ViewTime } from './ViewSim';

type Mode = 'resumen' | 'residencias' | 'amenidades' | 'ubicacion' | 'sol';
type UTab = 'resumen' | 'plano' | 'interiores' | 'vista';

const MODES: { id: Mode; label: string; icon: string }[] = [
  { id: 'resumen', label: 'Resumen', icon: '◎' },
  { id: 'residencias', label: 'Residencias', icon: '▦' },
  { id: 'amenidades', label: 'Amenidades', icon: '◌' },
  { id: 'ubicacion', label: 'Ubicación', icon: '⌖' },
  { id: 'sol', label: 'Sol y vistas', icon: '☀' },
];

const INTERIORS = [
  { img: M('living.webp'), name: 'Living' },
  { img: M('kitchen.webp'), name: 'Cocina' },
  { img: M('living-1d.webp'), name: 'Comedor' },
  { img: M('bedroom-night.webp'), name: 'Dormitorio' },
  { img: M('bathroom.webp'), name: 'Baño' },
  { img: M('view-balcony.webp'), name: 'Balcón' },
];

const byId = new Map(INVENTORY.map((u) => [u.id, u]));
const statusDot = (s: Status) => <i className="legend-dot" style={{ background: STATUS_META[s].color }} />;

function DualRange({ min, max, lo, hi, onChange, fmt }: { min: number; max: number; lo: number; hi: number; onChange: (lo: number, hi: number) => void; fmt: (n: number) => string }) {
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  return (
    <>
      <div className="range">
        <div className="track" />
        <div className="fill" style={{ left: `${pct(lo)}%`, width: `${pct(hi) - pct(lo)}%` }} />
        <input type="range" min={min} max={max} value={lo} onChange={(e) => onChange(Math.min(+e.target.value, hi - 1), hi)} aria-label="Mínimo" />
        <input type="range" min={min} max={max} value={hi} onChange={(e) => onChange(lo, Math.max(+e.target.value, lo + 1))} aria-label="Máximo" />
      </div>
      <div className="range-vals"><span>{fmt(lo)}</span><span>{fmt(hi)}</span></div>
    </>
  );
}

export default function Explorer({ params }: { params: URLSearchParams }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<TowerScene | null>(null);
  const [ready, setReady] = useState(false);

  const initUnit = params.get('unidad');
  const [mode, setMode] = useState<Mode>((params.get('modo') as Mode) || (initUnit || params.get('piso') ? 'residencias' : 'resumen'));
  const [filters, setFilters] = useState<Filters>(() => ({
    ...DEFAULT_FILTERS,
    dorms: (Number(params.get('dorms')) || 0) as Filters['dorms'],
    onlyAvailable: params.get('solo') === '1',
    tower: (params.get('torre') as TowerId) || 'all',
  }));
  const [floorSel, setFloorSel] = useState<{ tower: TowerId; floor: number } | null>(() => {
    const t = params.get('torre') as TowerId | null;
    const p = Number(params.get('piso'));
    if (t && p) return { tower: t, floor: p };
    const u = initUnit && byId.get(initUnit);
    return u ? { tower: u.tower, floor: u.floor } : null;
  });
  const [unitId, setUnitId] = useState<string | null>(initUnit && byId.has(initUnit) ? initUnit : null);
  const [utab, setUtab] = useState<UTab>((params.get('tab') as UTab) || 'resumen');
  const [interior, setInterior] = useState(0);
  const [viewTime, setViewTime] = useState<ViewTime>('tarde');
  const [amenity, setAmenity] = useState(params.get('a') || AMENITIES[0].id);
  const [amenNight, setAmenNight] = useState(false);
  const [place, setPlace] = useState(NEARBY[0].id);
  const [hour, setHour] = useState(12.5);
  const [playing, setPlaying] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'precio' | 'piso'>('precio');
  const [saved, toggleSaved] = useLocalSet('m1617-saved');
  const [compare, setCompare] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [lead, setLead] = useState<string | null | undefined>(undefined);
  const [hover, setHover] = useState<{ u: Unit; x: number; y: number } | null>(null);
  const [labelPos, setLabelPos] = useState<{ x: number; y: number; visible: boolean } | null>(null);

  const unit = unitId ? byId.get(unitId)! : null;

  // ------------------------------------------------------------- 3D scene
  useEffect(() => {
    if (!stageRef.current) return;
    const s = new TowerScene(stageRef.current, INVENTORY);
    sceneRef.current = s;
    if (window.innerWidth > 900) s.setFrameOffset(-0.12);
    else s.setFrameOffset(0, 0.2);
    s.onHover((u, x, y) => setHover(u ? { u, x, y } : null));
    s.onPick((u) => {
      if (!u) return;
      setMode('residencias');
      setFloorSel({ tower: u.tower, floor: u.floor });
      setUnitId(u.id);
      setUtab('resumen');
    });
    const t = setTimeout(() => setReady(true), 350);
    return () => {
      clearTimeout(t);
      s.dispose();
      sceneRef.current = null;
    };
  }, []);

  const matching = useMemo(() => {
    const q = query.trim().toUpperCase();
    return INVENTORY.filter((u) => matches(u, filters) && (!q || u.id.includes(q) || `PISO ${u.floor}`.includes(q)));
  }, [filters, query]);
  const matchSet = useMemo(() => new Set(matching.map((u) => u.id)), [matching]);

  // colours
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    if (mode === 'residencias' || mode === 'resumen') s.setColorFn((u) => (matchSet.has(u.id) ? STATUS_META[u.status].color : null));
    else s.setColorFn(() => null);
  }, [mode, matchSet]);

  useEffect(() => sceneRef.current?.setSelected(unitId), [unitId]);
  useEffect(() => sceneRef.current?.setHighlight(floorSel), [floorSel]);
  useEffect(() => sceneRef.current?.setHour(hour), [hour]);

  // camera choreography
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    if (floorSel) s.focusFloor(floorSel.tower, floorSel.floor);
    else s.focusTower(filters.tower);
  }, [floorSel?.tower, floorSel?.floor, filters.tower]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mode === 'sol') {
      sceneRef.current?.setHighlight(null);
      sceneRef.current?.focusOverview();
    } else sceneRef.current?.setHighlight(floorSel);
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // track the big "PISO 24" label next to the selected floor
  useEffect(() => {
    if (!floorSel || mode !== 'residencias') return setLabelPos(null);
    let raf = 0;
    const tick = () => {
      const s = sceneRef.current;
      if (s) setLabelPos(s.floorLabelPos(floorSel.tower, floorSel.floor));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [floorSel, mode]);

  // sun animation
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setHour((h) => (h >= 19.5 ? 5.8 : +(h + 0.05).toFixed(2))), 40);
    return () => clearInterval(t);
  }, [playing]);

  // keep URL shareable
  useEffect(() => {
    const p = new URLSearchParams();
    if (mode !== 'resumen') p.set('modo', mode);
    if (unitId) p.set('unidad', unitId);
    else if (floorSel) { p.set('torre', floorSel.tower); p.set('piso', String(floorSel.floor)); }
    if (unitId && utab !== 'resumen') p.set('tab', utab);
    const next = `#/explorar${p.toString() ? '?' + p : ''}`;
    if (window.location.hash !== next) history.replaceState(null, '', next);
  }, [mode, unitId, floorSel, utab]);

  const counts = useMemo(() => {
    const c: Record<Status, number> = { disponible: 0, reservado: 0, vendido: 0 };
    INVENTORY.filter((u) => filters.tower === 'all' || u.tower === filters.tower).forEach((u) => c[u.status]++);
    return c;
  }, [filters.tower]);

  const setTower = (t: 'all' | TowerId) => {
    setFilters((f) => ({ ...f, tower: t }));
    setUnitId(null);
    setFloorSel(null);
  };
  const openUnit = (u: Unit, tab: UTab = 'resumen') => {
    setMode('residencias');
    setFloorSel({ tower: u.tower, floor: u.floor });
    setUnitId(u.id);
    setUtab(tab);
  };
  const toggleCompare = (id: string) => setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id].slice(-3)));

  // ------------------------------------------------------------- stage overlays
  const stageOverlay = (() => {
    if (mode === 'amenidades') {
      const a = AMENITIES.find((x) => x.id === amenity)!;
      return (
        <div className="img-stage" key="amen">
          <div className="sq-bg" style={{ backgroundImage: `url(${M('masterplan.webp')})` }} />
          <div className="sq">
          <img src={M('masterplan.webp')} alt="Plano de amenidades" />
          <div className="home-pin" style={{ left: '52%', top: '47%' }}>Macororó 16|17</div>
          {AMENITIES.map((x) => (
            <button key={x.id} className={`spot ${x.id === amenity ? 'on' : ''}`} style={{ left: `${x.spot[0]}%`, top: `${x.spot[1]}%` }} onClick={() => setAmenity(x.id)}>
              <span className="pin" /><span className="tag">{x.short}</span>
            </button>
          ))}
          </div>
          <div className="ex-badge" style={{ bottom: 76 }}>{a.short}<small>Toca un punto del plano</small></div>
        </div>
      );
    }
    if (mode === 'ubicacion') {
      const p = NEARBY.find((x) => x.id === place)!;
      const d = `M${ORIGIN_PIN[0]} ${ORIGIN_PIN[1]} Q ${(ORIGIN_PIN[0] + p.to[0]) / 2} ${Math.min(ORIGIN_PIN[1], p.to[1]) - 12} ${p.to[0]} ${p.to[1]}`;
      return (
        <div className="img-stage" key="loc">
          <div className="sq-bg" style={{ backgroundImage: `url(${M('aerial-city.webp')})` }} />
          <div className="sq">
          <img src={M('aerial-city.webp')} alt="Vista aérea" />
          <svg className="route" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path d={d} stroke="rgba(0,0,0,.45)" style={{ strokeWidth: 9 }} vectorEffect="non-scaling-stroke" />
            <path key={place} d={d} stroke="#2BE35A" style={{ strokeWidth: 5, strokeDasharray: 1200, strokeDashoffset: 1200, animation: 'draw 1.2s forwards' }} vectorEffect="non-scaling-stroke" pathLength={1200} />
          </svg>
          <style>{'@keyframes draw{to{stroke-dashoffset:0}}'}</style>
          <div className="home-pin" style={{ left: `${ORIGIN_PIN[0]}%`, top: `${ORIGIN_PIN[1] - 2}%` }}>Macororó 16|17</div>
          <div className="min-chip" key={'c' + place} style={{ left: `${p.to[0]}%`, top: `${p.to[1]}%`, animation: 'fade .6s .8s both' }}>
            {p.minutes} MIN<small>{p.name}</small>
          </div>
          </div>
        </div>
      );
    }
    if (unit && mode === 'residencias' && utab === 'interiores') {
      return (
        <div className="img-stage" key="int">
          <img key={interior} src={INTERIORS[interior].img} alt={INTERIORS[interior].name} style={{ animation: 'fade .5s' }} />
          <div className="ex-badge">{INTERIORS[interior].name} ✓<small>{unit.id} · {TYPOLOGIES[unit.dorms].label}</small></div>
        </div>
      );
    }
    if (unit && mode === 'residencias' && utab === 'vista') {
      return (
        <div className="view-stage" key="vis">
          <ViewSim floor={unit.floor} time={viewTime} label={`${unit.id} · Piso ${unit.floor} · ${viewTime}`} />
        </div>
      );
    }
    return null;
  })();

  // ------------------------------------------------------------- panels
  const panel = (() => {
    if (mode === 'resumen')
      return (
        <>
          <div className="ex-panel-h"><h2>{PROJECT.name} · {PROJECT.tagline}</h2><p>{PROJECT.addressShort} · {PROJECT.city}</p></div>
          <div className="ex-panel-b">
            <div className="card-img"><img src={M('towers-sky.webp')} alt="" /></div>
            <p style={{ lineHeight: 1.55, color: '#3c423e' }}>{PROJECT.intro}</p>
            <div className="kv"><div><b>37</b><span>pisos</span></div><div><b>2</b><span>torres</span></div><div><b>{INVENTORY.length}</b><span>unidades</span></div></div>
            <div className="lbl" style={{ marginTop: 16 }}>Disponibilidad</div>
            <div className="legend">
              {(Object.keys(STATUS_META) as Status[]).map((s) => (
                <div key={s}><b>{counts[s]}</b><span>{statusDot(s)}{STATUS_META[s].label}</span></div>
              ))}
            </div>
            <div className="feat"><div className="ic">🛡</div><div><b>Sismo resistente</b><span>{PROJECT.structure}</span></div></div>
            <div className="feat"><div className="ic">🌉</div><div><b>Puente estructural</b><span>Las torres se unen en altura con un puente que define el skyline.</span></div></div>
            <div className="feat"><div className="ic">🌇</div><div><b>Vistas panorámicas</b><span>{PROJECT.views}</span></div></div>
          </div>
          <div className="ex-panel-f">
            <button className="abtn green" style={{ flex: 1 }} onClick={() => setMode('residencias')}>Ver disponibilidad →</button>
          </div>
        </>
      );

    if (mode === 'residencias' && unit) {
      const t = TYPOLOGIES[unit.dorms];
      return (
        <>
          <div className="ex-panel-h">
            <button className="back" onClick={() => { setUnitId(null); setUtab('resumen'); }}>← Piso {unit.floor} · Torre {unit.tower}</button>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>{unit.id} <span style={{ fontSize: 12, fontWeight: 700, color: STATUS_META[unit.status].color, marginLeft: 6 }}>● {STATUS_META[unit.status].label}</span></h2>
              <button className={`heart ${saved.includes(unit.id) ? 'on' : ''}`} onClick={() => toggleSaved(unit.id)} aria-label="Guardar">♥</button>
            </div>
            <div className="price">{fmtUSD(unit.price)}<small>{fmtUSD(Math.round(unit.price / unit.area))}/m²</small></div>
          </div>
          <div className="ex-panel-b">
            <div className="kv">
              <div><b>{unit.area} m²</b><span>superficie</span></div>
              <div><b>{unit.dorms}</b><span>dormitorios</span></div>
              <div><b>{unit.baths}</b><span>baños</span></div>
              <div><b>{unit.floor}</b><span>piso</span></div>
              <div><b>{unit.balcony} m²</b><span>balcón</span></div>
              <div><b>{unit.orientation}</b><span>orientación</span></div>
            </div>
            <div className="tabs">
              {(['resumen', 'plano', 'interiores', 'vista'] as UTab[]).map((x) => (
                <button key={x} className={utab === x ? 'on' : ''} onClick={() => setUtab(x)}>{x[0].toUpperCase() + x.slice(1)}</button>
              ))}
            </div>
            {utab === 'resumen' && (
              <>
                <div className="card-img"><img src={t.hero} alt="" /></div>
                <p style={{ lineHeight: 1.5, color: '#3c423e' }}>{t.blurb}</p>
                <div className="feat"><div className="ic">☀</div><div><b>Luz natural</b><span>Fachada {unit.orientation.toLowerCase()}: {/Norte|Este/.test(unit.orientation) ? 'sol de mañana y mediodía' : 'sol de tarde y atardeceres'}.</span></div></div>
                <div className="feat"><div className="ic">🅿</div><div><b>Parqueo</b><span>Consultá parqueo y baulera disponibles para esta unidad.</span></div></div>
              </>
            )}
            {utab === 'plano' && (
              <>
                <PlanSVG dorms={unit.dorms} />
                <p className="note">{unit.dorms === 1 ? 'Plano de la tipología 1 dormitorio.' : 'Distribución referencial. Solicitá el plano oficial de esta unidad.'}</p>
              </>
            )}
            {utab === 'interiores' && (
              <>
                <div className="thumbs">
                  {INTERIORS.map((x, i) => (
                    <button key={x.img} className={interior === i ? 'on' : ''} onClick={() => setInterior(i)}><img src={x.img} alt={x.name} /></button>
                  ))}
                </div>
                <p className="note">Imágenes referenciales de interiores y terminaciones de Macororó 16 | 17.</p>
              </>
            )}
            {utab === 'vista' && (
              <>
                <div className="lbl">Momento del día</div>
                <div className="chips">
                  {(['mañana', 'tarde', 'noche'] as ViewTime[]).map((v) => (
                    <button key={v} className={`chip ${viewTime === v ? 'on' : ''}`} onClick={() => setViewTime(v)}>{v[0].toUpperCase() + v.slice(1)}</button>
                  ))}
                </div>
                <p className="note">Simulación de la vista desde el piso {unit.floor} con orientación {unit.orientation.toLowerCase()}. Cuanto más alto, más horizonte.</p>
                <div className="lbl">Comparar altura</div>
                <div className="chips">
                  {[10, 18, 24, 30, 36].map((f) => {
                    const alt = INVENTORY.find((u) => u.tower === unit.tower && u.floor === f && u.letter === unit.letter) || INVENTORY.find((u) => u.tower === unit.tower && u.floor === f);
                    return alt ? <button key={f} className={`chip ${unit.floor === f ? 'on-g' : ''}`} onClick={() => openUnit(alt, 'vista')}>Piso {f}</button> : null;
                  })}
                </div>
              </>
            )}
            <div className="actions">
              <button className="abtn" onClick={() => toggleCompare(unit.id)}>{compare.includes(unit.id) ? '✓ En comparación' : '⇄ Comparar'}</button>
              <a className="abtn" href={waLink(`Hola, me interesa el departamento ${unit.id} de Macororó 16|17 (${unit.area} m², piso ${unit.floor}, ${fmtUSD(unit.price)}). ¿Me envían más información?`)} target="_blank" rel="noreferrer">↗ Enviar al celular</a>
            </div>
          </div>
          <div className="ex-panel-f">
            <button className="abtn dark" style={{ flex: 1 }} onClick={() => setLead(unit.id)}>Agendar visita</button>
            <a className="abtn green" style={{ flex: 1 }} href={waLink(`Hola, quiero reservar el departamento ${unit.id} de Macororó 16|17.`)} target="_blank" rel="noreferrer">Reservar</a>
          </div>
        </>
      );
    }

    if (mode === 'residencias' && floorSel) {
      const list = INVENTORY.filter((u) => u.tower === floorSel.tower && u.floor === floorSel.floor);
      const av = list.filter((u) => u.status === 'disponible').length;
      return (
        <>
          <div className="ex-panel-h">
            <button className="back" onClick={() => setFloorSel(null)}>← Todas las residencias</button>
            <h2>Torre {floorSel.tower} · Piso {floorSel.floor}</h2>
            <p>{av} de {list.length} disponibles · {list[0]?.perFloor} unidades por planta</p>
          </div>
          <div className="ex-panel-b">
            <div className="ulist">
              {list.map((u) => (
                <button key={u.id} className="urow" onClick={() => openUnit(u)} disabled={false}>
                  <img src={TYPOLOGIES[u.dorms].hero} alt="" />
                  <div>
                    <div className="c">{u.id} · {TYPOLOGIES[u.dorms].short}</div>
                    <div className="s">{u.area} m² · {u.orientation}</div>
                    <div className="st" style={{ color: STATUS_META[u.status].color }}>● {STATUS_META[u.status].label}</div>
                  </div>
                  <div className="p">{u.status === 'vendido' ? '—' : fmtUSD(u.price)}</div>
                </button>
              ))}
            </div>
            <div className="lbl" style={{ marginTop: 18 }}>Ir a otro piso</div>
            <div className="floorlist">
              {Array.from({ length: TOP_FLOOR - FIRST_RES_FLOOR + 1 }, (_, i) => TOP_FLOOR - i).map((f) => {
                const fl = INVENTORY.filter((u) => u.tower === floorSel.tower && u.floor === f);
                return (
                  <button key={f} className={`frow ${f === floorSel.floor ? 'on' : ''}`} onClick={() => setFloorSel({ tower: floorSel.tower, floor: f })}>
                    <span className="n">{f}</span>
                    <span className="dots">{fl.map((u) => <i key={u.id} style={{ background: STATUS_META[u.status].color }} />)}</span>
                    <span className="a">{fl.filter((u) => u.status === 'disponible').length} disp.</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      );
    }

    if (mode === 'residencias') {
      const sorted = [...matching].sort((a, b) => (sort === 'precio' ? a.price - b.price : b.floor - a.floor));
      return (
        <>
          <div className="ex-panel-h"><h2>Encuentra tu hogar</h2><p>{matching.length} coincidencias · {matching.filter((u) => u.status === 'disponible').length} disponibles</p></div>
          <div className="ex-panel-b">
            <div className="search"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar unidad, ej. 16-24A" /></div>
            <div className="lbl">Dormitorios</div>
            <div className="chips">
              {([0, 1, 2, 3, 4] as const).map((d) => (
                <button key={d} className={`chip ${filters.dorms === d ? 'on' : ''}`} onClick={() => setFilters((f) => ({ ...f, dorms: d as Filters['dorms'] }))}>{d === 0 ? 'Todos' : `${d}D`}</button>
              ))}
            </div>
            <div className="lbl">Pisos <span>{filters.floorMin}–{filters.floorMax}</span></div>
            <DualRange min={FIRST_RES_FLOOR} max={TOP_FLOOR} lo={filters.floorMin} hi={filters.floorMax} fmt={(n) => `Piso ${n}`} onChange={(lo, hi) => setFilters((f) => ({ ...f, floorMin: lo, floorMax: hi }))} />
            <div className="chips" style={{ marginTop: 8 }}>
              {[['Bajo', 6, 16], ['Medio', 17, 27], ['Alto', 28, 37]].map(([n, lo, hi]) => (
                <button key={n} className={`chip ${filters.floorMin === lo && filters.floorMax === hi ? 'on' : ''}`} onClick={() => setFilters((f) => ({ ...f, floorMin: lo as number, floorMax: hi as number }))}>{n}</button>
              ))}
            </div>
            <div className="lbl">Presupuesto máx. <span>{fmtUSD(filters.budgetMax)}</span></div>
            <div className="single"><input type="range" min={80000} max={400000} step={5000} value={filters.budgetMax} onChange={(e) => setFilters((f) => ({ ...f, budgetMax: +e.target.value }))} /></div>
            <div className="lbl">Estado</div>
            <div className="legend">
              {(Object.keys(STATUS_META) as Status[]).map((s) => (
                <div key={s}><b>{matching.filter((u) => u.status === s).length}</b><span>{statusDot(s)}{STATUS_META[s].label}</span></div>
              ))}
            </div>
            <button className="switch" style={{ width: '100%' }} onClick={() => setFilters((f) => ({ ...f, onlyAvailable: !f.onlyAvailable }))}>
              <span>Solo disponibles</span><span className={`sw ${filters.onlyAvailable ? 'on' : ''}`} />
            </button>
            <div className="lbl" style={{ marginTop: 18 }}>
              Coincidencias ({sorted.length})
              <span>
                <button style={{ fontWeight: sort === 'precio' ? 800 : 500 }} onClick={() => setSort('precio')}>Precio</button> · <button style={{ fontWeight: sort === 'piso' ? 800 : 500 }} onClick={() => setSort('piso')}>Piso</button>
              </span>
            </div>
            <div className="ulist">
              {sorted.slice(0, 60).map((u) => (
                <div key={u.id} className="urow" role="button" tabIndex={0} onClick={() => openUnit(u)} onKeyDown={(e) => e.key === 'Enter' && openUnit(u)} style={{ cursor: 'pointer' }}>
                  <img src={TYPOLOGIES[u.dorms].hero} alt="" />
                  <div>
                    <div className="c">{u.id} <span style={{ color: STATUS_META[u.status].color, fontSize: 11 }}>● {STATUS_META[u.status].label}</span></div>
                    <div className="s">{TYPOLOGIES[u.dorms].label} · {u.area} m² · Torre {u.tower} · Piso {u.floor}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="p">{u.status === 'vendido' ? '—' : fmtUSD(u.price)}</div>
                    <button className={`heart ${saved.includes(u.id) ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); toggleSaved(u.id); }} aria-label="Guardar">♥</button>
                  </div>
                </div>
              ))}
              {sorted.length > 60 && <p className="note">Mostrando 60 de {sorted.length}. Afiná los filtros o elegí un piso en el modelo.</p>}
              {!sorted.length && <p className="note">Sin coincidencias. Probá ampliar el presupuesto o el rango de pisos.</p>}
            </div>
          </div>
          <div className="ex-panel-f">
            <button className="abtn" style={{ flex: 1 }} onClick={() => { setFilters({ ...DEFAULT_FILTERS, tower: filters.tower }); setQuery(''); }}>Limpiar filtros</button>
          </div>
        </>
      );
    }

    if (mode === 'amenidades') {
      const a = AMENITIES.find((x) => x.id === amenity)!;
      const img = a.night && amenNight ? a.night : a.img;
      return (
        <>
          <div className="ex-panel-h"><h2>Amenidades</h2><p>{PROJECT.amenitiesIntro}</p></div>
          <div className="ex-panel-b">
            <div className="card-img">
              <img key={img} src={img} alt={a.name} style={{ animation: 'fade .5s' }} />
              {a.night && (
                <div className="toggle">
                  <button className={!amenNight ? 'on' : ''} onClick={() => setAmenNight(false)}>Día</button>
                  <button className={amenNight ? 'on' : ''} onClick={() => setAmenNight(true)}>Noche</button>
                </div>
              )}
            </div>
            <h3 style={{ margin: '12px 0 4px', fontSize: 17 }}>{a.name}</h3>
            <p style={{ margin: 0, color: '#3c423e' }}>{a.desc}</p>
            <div className="lbl" style={{ marginTop: 18 }}>Todas</div>
            <div className="ulist">
              {AMENITIES.map((x) => (
                <button key={x.id} className="urow" onClick={() => setAmenity(x.id)} style={x.id === amenity ? { borderColor: 'var(--green-2)' } : undefined}>
                  <img src={x.img} alt="" />
                  <div><div className="c">{x.name}</div><div className="s">{x.desc}</div></div>
                  <div />
                </button>
              ))}
            </div>
          </div>
        </>
      );
    }

    if (mode === 'ubicacion')
      return (
        <>
          <div className="ex-panel-h"><h2>Ubicación</h2><p>{PROJECT.address}</p></div>
          <div className="ex-panel-b">
            <p style={{ marginTop: 0, color: '#3c423e', lineHeight: 1.5 }}>{PROJECT.locationIntro}</p>
            <div className="ulist">
              {NEARBY.map((p) => (
                <button key={p.id} className="urow" style={{ gridTemplateColumns: '40px 1fr auto', ...(p.id === place ? { borderColor: 'var(--green-2)', background: '#f3fcf5' } : {}) }} onClick={() => setPlace(p.id)}>
                  <span style={{ fontSize: 20, textAlign: 'center' }}>{p.icon}</span>
                  <div className="c">{p.name}</div>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 24 }}>{p.minutes} MIN</div>
                </button>
              ))}
            </div>
            <a className="abtn dark" style={{ marginTop: 12, width: '100%' }} href={PROJECT.mapsUrl} target="_blank" rel="noreferrer">Abrir en Google Maps ↗</a>
          </div>
        </>
      );

    // sol
    const sunUnit = unit || byId.get('16-24A')!;
    return (
      <>
        <div className="ex-panel-h"><h2>Sol y vistas</h2><p>Simulación solar para Santa Cruz (17,8° S)</p></div>
        <div className="ex-panel-b">
          <div className="lbl">Hora del día</div>
          <div className="chips">
            {[['Amanecer', 6.4], ['Mañana', 9], ['Mediodía', 12.5], ['Tarde', 16], ['Atardecer', 18.3], ['Noche', 21]].map(([n, h]) => (
              <button key={n} className={`chip ${Math.abs(hour - (h as number)) < 0.2 ? 'on' : ''}`} onClick={() => { setPlaying(false); setHour(h as number); }}>{n}</button>
            ))}
          </div>
          <div className="lbl" style={{ marginTop: 18 }}>Vista desde {sunUnit.id}</div>
          <ViewSim floor={sunUnit.floor} time={hour < 7 || hour > 19 ? 'noche' : hour > 16.5 ? 'tarde' : 'mañana'} label={fmtHour(hour)} />
          <p className="note">El sol sale por el este, recorre el norte (hemisferio sur) y se pone por el oeste. Las unidades con orientación norte reciben luz durante gran parte del día.</p>
          <button className="abtn" style={{ width: '100%', marginTop: 8 }} onClick={() => { setMode('residencias'); setFilters((f) => ({ ...f, floorMin: 28, floorMax: 37 })); }}>Ver pisos altos disponibles →</button>
        </div>
      </>
    );
  })();

  const badge = (() => {
    if (mode === 'residencias' && unit && utab === 'resumen') return <div className="ex-badge">{unit.id} · {TYPOLOGIES[unit.dorms].short}<small>{unit.area} m² · {STATUS_META[unit.status].label}</small></div>;
    if ((mode === 'residencias' || mode === 'resumen') && !unit)
      return (
        <div className="ex-badge" style={{ fontSize: 22 }}>
          <span><i style={{ background: STATUS_META.disponible.color }} />Disponible</span>
          <span><i style={{ background: STATUS_META.vendido.color }} />Vendido</span>
        </div>
      );
    return null;
  })();

  const savedUnits = saved.map((id) => byId.get(id)).filter(Boolean) as Unit[];

  return (
    <div className="ex">
      <div className="ex-stage" ref={stageRef} />
      <div className={`ex-loading ${ready ? 'done' : ''}`}><span className="mono dot">Construyendo Macororó 16 | 17</span></div>

      {stageOverlay}

      {labelPos?.visible && floorSel && !stageOverlay && (
        <div className="ex-big" style={{ left: labelPos.x + (floorSel.tower === '16' ? -90 : 90), top: labelPos.y, fontSize: 'clamp(40px, 6vw, 84px)' }}>
          PISO <b>{String(floorSel.floor).padStart(2, '0')}</b>
        </div>
      )}

      {hover && !stageOverlay && (
        <div className="ex-tip" style={{ left: hover.x, top: hover.y }}>
          <b>{hover.u.id}</b> <span style={{ color: STATUS_META[hover.u.status].color, fontWeight: 700, fontSize: 11 }}>● {STATUS_META[hover.u.status].label}</span>
          <div>{TYPOLOGIES[hover.u.dorms].label} · {hover.u.area} m² · Piso {hover.u.floor}</div>
          {hover.u.status !== 'vendido' && <div style={{ color: 'var(--text)', fontWeight: 700 }}>{fmtUSD(hover.u.price)}</div>}
        </div>
      )}

      {!stageOverlay && badge}

      {mode === 'sol' && (
        <div className="sunbar">
          <button onClick={() => setPlaying((p) => !p)} aria-label="Reproducir">{playing ? '❚❚' : '▶'}</button>
          <div className="clock">{fmtHour(hour)}</div>
          <input type="range" min={5.5} max={21} step={0.05} value={hour} onChange={(e) => { setPlaying(false); setHour(+e.target.value); }} />
          <span style={{ fontSize: 18 }}>{hour > 6.2 && hour < 18.8 ? '☀' : '☾'}</span>
        </div>
      )}

      <div className="ex-top">
        <a className="pill ex-brand" href="#/">
          <span className="logo">M</span>
          <span><div className="t1">Macororó 16 | 17</div><div className="t2">City Park · Av. Beni</div></span>
        </a>
        <div className="pill seg">
          {(['all', '16', '17'] as const).map((t) => (
            <button key={t} className={filters.tower === t ? 'on' : ''} onClick={() => setTower(t)}>{t === 'all' ? 'Todas' : `Torre ${t}`}</button>
          ))}
        </div>
        <div className="ex-spacer" />
        <div className="pill ex-tools">
          <button className="hide-m" onClick={() => setMode('sol')}>☀ {fmtHour(hour)}</button>
          <button onClick={() => setShowSaved(true)}>♥ <span className="hide-m">Guardados</span> <span className="cnt">{saved.length}</span></button>
          <button className="hide-m" onClick={() => setShowCompare(true)}>⇄ Comparar <span className="cnt">{compare.length}</span></button>
          <button className="cta" onClick={() => setLead(unitId)}>Agendar visita</button>
        </div>
      </div>

      <div className="ex-zoom">
        <button onClick={() => { setFloorSel(null); setUnitId(null); sceneRef.current?.focusOverview(); }} title="Vista general">⌂</button>
        <button onClick={() => sceneRef.current?.setAutoRotate(true)} title="Girar">⟳</button>
      </div>

      <aside className="ex-panel" key={mode + (unitId || '') + (floorSel ? floorSel.tower + floorSel.floor : '')} style={{ animation: 'fade .3s' }}>
        {panel}
      </aside>

      <nav className="pill ex-bottom">
        {MODES.map((m) => (
          <button key={m.id} className={mode === m.id ? 'on' : ''} onClick={() => { setMode(m.id); if (m.id === 'residencias' && unit) setUtab('resumen'); }}>
            <span>{m.icon}</span><span className="lbl-m">{m.label}</span>
          </button>
        ))}
      </nav>

      {showSaved && (
        <div className="overlay" onClick={() => setShowSaved(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="x" onClick={() => setShowSaved(false)}>×</button>
            <h3>Guardados</h3>
            {!savedUnits.length && <p style={{ color: 'var(--muted)' }}>Tocá ♥ en cualquier departamento para guardarlo aquí.</p>}
            <div className="ulist">
              {savedUnits.map((u) => (
                <button key={u.id} className="urow" onClick={() => { setShowSaved(false); openUnit(u); }}>
                  <img src={TYPOLOGIES[u.dorms].hero} alt="" />
                  <div><div className="c">{u.id}</div><div className="s">{TYPOLOGIES[u.dorms].label} · {u.area} m² · Piso {u.floor}</div></div>
                  <div className="p">{fmtUSD(u.price)}</div>
                </button>
              ))}
            </div>
            {!!savedUnits.length && (
              <a className="abtn green" style={{ width: '100%', marginTop: 12 }} target="_blank" rel="noreferrer" href={waLink(`Hola, me interesan estos departamentos de Macororó 16|17: ${savedUnits.map((u) => u.id).join(', ')}.`)}>Consultar por WhatsApp</a>
            )}
          </div>
        </div>
      )}

      {showCompare && (
        <div className="overlay" onClick={() => setShowCompare(false)}>
          <div className="modal compare" onClick={(e) => e.stopPropagation()}>
            <button className="x" onClick={() => setShowCompare(false)}>×</button>
            <h3>Comparar</h3>
            {compare.length < 2 ? (
              <p style={{ color: 'var(--muted)' }}>Agregá hasta 3 departamentos con “⇄ Comparar” en la ficha de cada unidad.</p>
            ) : (
              <table>
                <thead><tr><th></th>{compare.map((id) => <th key={id}>{id}</th>)}</tr></thead>
                <tbody>
                  {([
                    ['Precio', (u: Unit) => fmtUSD(u.price)],
                    ['Superficie', (u: Unit) => `${u.area} m²`],
                    ['$/m²', (u: Unit) => fmtUSD(Math.round(u.price / u.area))],
                    ['Dormitorios', (u: Unit) => u.dorms],
                    ['Baños', (u: Unit) => u.baths],
                    ['Piso', (u: Unit) => u.floor],
                    ['Torre', (u: Unit) => u.tower],
                    ['Orientación', (u: Unit) => u.orientation],
                    ['Estado', (u: Unit) => STATUS_META[u.status].label],
                  ] as [string, (u: Unit) => React.ReactNode][]).map(([k, f]) => (
                    <tr key={k}><th>{k}</th>{compare.map((id) => <td key={id}>{f(byId.get(id)!)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            )}
            {!!compare.length && <button className="abtn" style={{ marginTop: 12 }} onClick={() => setCompare([])}>Vaciar</button>}
          </div>
        </div>
      )}

      {lead !== undefined && <LeadModal unitId={lead || undefined} onClose={() => setLead(undefined)} />}
    </div>
  );
}


