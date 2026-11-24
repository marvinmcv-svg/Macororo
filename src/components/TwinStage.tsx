import { useEffect, useMemo, useRef, useState } from 'react';
import { STATUS_META, TYPOLOGIES, type TowerId, type Unit } from '../data/units';
import type { Twin } from '../three/Twin';
import type { Focus } from './RealStage';

type Props = {
  units: Unit[];
  colorFn: (u: Unit) => string | null;
  selectedId?: string | null;
  floorSel?: { tower: TowerId; floor: number } | null;
  focus: Focus;
  hour: number;
  inside?: boolean; // open the selected floor as a dollhouse
  panelRight?: number;
  panelBottom?: number;
  onPick?: (u: Unit) => void;
  onHover?: (u: Unit | null, x: number, y: number) => void;
  onReady?: () => void;
};

export default function TwinStage({ units, colorFn, selectedId, floorSel, focus, hour, inside, panelRight = 0, panelBottom = 0, onPick, onHover, onReady }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const twin = useRef<Twin | null>(null);
  const [ok, setOk] = useState(false);
  const floorLabel = useRef<HTMLDivElement>(null);
  const tagRefs = useRef(new Map<string, HTMLButtonElement>());
  const cb = useRef({ onPick, onHover, colorFn });
  cb.current = { onPick, onHover, colorFn };

  useEffect(() => {
    let alive = true;
    let t: Twin | null = null;
    import('../three/Twin').then(({ Twin }) => {
      if (!alive || !ref.current) return;
      t = new Twin(ref.current, units);
      twin.current = t;
      t.onPick((u) => u && cb.current.onPick?.(u));
      t.onHover((u, x, y) => cb.current.onHover?.(u, x, y));
      setOk(true);
      onReady?.();
    });
    return () => {
      alive = false;
      t?.dispose();
      twin.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const w = ref.current?.clientWidth || window.innerWidth;
    const h = ref.current?.clientHeight || window.innerHeight;
    twin.current?.setFrameOffset(-(panelRight / 2) / w, panelBottom ? panelBottom / 2 / h : 0);
  }, [ok, panelRight, panelBottom]);

  useEffect(() => { if (ok) twin.current!.setColorFn((u) => cb.current.colorFn(u)); }, [ok, colorFn]);
  useEffect(() => { if (ok) twin.current!.setSelected(selectedId ?? null); }, [ok, selectedId]);
  useEffect(() => { if (ok) twin.current!.setHour(hour); }, [ok, hour]);
  useEffect(() => { if (ok) twin.current!.setHighlight(floorSel ?? null); }, [ok, floorSel?.tower, floorSel?.floor]); // eslint-disable-line react-hooks/exhaustive-deps

  // camera choreography + cutaway
  useEffect(() => {
    const t = twin.current;
    if (!ok || !t) return;
    if (inside && floorSel) {
      t.setCutaway(floorSel);
      t.focusInside(floorSel.tower, floorSel.floor);
    } else {
      t.setCutaway(null);
      if (focus.tower !== 'all' && focus.floor) t.focusFloor(focus.tower, focus.floor);
      else t.focusTower(focus.tower);
    }
  }, [ok, inside, focus.tower, focus.floor, floorSel?.tower, floorSel?.floor]); // eslint-disable-line react-hooks/exhaustive-deps

  const dollUnits = useMemo(
    () => (inside && floorSel ? units.filter((u) => u.tower === floorSel.tower && u.floor === floorSel.floor) : []),
    [inside, floorSel?.tower, floorSel?.floor, units], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // labels follow the 3D via direct DOM writes after each rendered frame — no React re-render per frame
  useEffect(() => {
    const t = twin.current;
    if (!ok || !t) return;
    const place = (el: HTMLElement | null | undefined, p: { x: number; y: number; visible: boolean } | null) => {
      if (!el) return;
      if (!p || !p.visible) { el.style.visibility = 'hidden'; return; }
      el.style.visibility = 'visible';
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
    };
    t.onFrame(() => {
      place(floorLabel.current, floorSel && !inside ? t.floorLabelPos(floorSel.tower, floorSel.floor) : null);
      if (inside) for (const l of t.dollLabels()) place(tagRefs.current.get(l.u.id), l);
    });
    t.invalidate(); // force a frame so labels settle immediately
    return () => t.onFrame(null);
  }, [ok, floorSel, inside]);

  return (
    <div className="twin" ref={ref}>
      {floorSel && !inside && (
        <div ref={floorLabel} className={`ex-big ${floorSel.tower === '16' ? 'left' : 'right'}`} style={{ visibility: 'hidden' }}>
          PISO <b>{String(floorSel.floor).padStart(2, '0')}</b>
        </div>
      )}
      {dollUnits.map((u) => (
        <button
          key={u.id}
          ref={(el) => { if (el) tagRefs.current.set(u.id, el); else tagRefs.current.delete(u.id); }}
          className={`doll-tag ${u.id === selectedId ? 'on' : ''}`}
          style={{ visibility: 'hidden' }}
          onClick={() => onPick?.(u)}
        >
          <i style={{ background: STATUS_META[u.status].color }} />
          {u.id} · {TYPOLOGIES[u.dorms].short}
          <small>{u.area} m²</small>
        </button>
      ))}
    </div>
  );
}
