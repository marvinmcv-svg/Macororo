import { useEffect, useRef, useState } from 'react';
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
  const [label, setLabel] = useState<{ x: number; y: number; visible: boolean } | null>(null);
  const [labels, setLabels] = useState<{ u: Unit; x: number; y: number; visible: boolean }[]>([]);
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

  const w = ref.current?.clientWidth || window.innerWidth;
  const h = ref.current?.clientHeight || window.innerHeight;
  useEffect(() => {
    twin.current?.setFrameOffset(-(panelRight / 2) / w, panelBottom ? (panelBottom / 2) / h : 0);
  }, [ok, panelRight, panelBottom, w, h]);

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

  // HTML labels tracking the 3D
  useEffect(() => {
    if (!ok) return;
    let raf = 0;
    const tick = () => {
      const t = twin.current;
      if (t) {
        if (floorSel && !inside) setLabel(t.floorLabelPos(floorSel.tower, floorSel.floor));
        else setLabel(null);
        setLabels(inside ? t.dollLabels() : []);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ok, floorSel, inside]);

  return (
    <div className="twin" ref={ref}>
      {label?.visible && floorSel && (
        <div className={`ex-big ${floorSel.tower === '16' ? 'left' : 'right'}`} style={{ left: label.x, top: label.y }}>
          PISO <b>{String(floorSel.floor).padStart(2, '0')}</b>
        </div>
      )}
      {labels.filter((l) => l.visible).map((l) => (
        <button
          key={l.u.id}
          className={`doll-tag ${l.u.id === selectedId ? 'on' : ''}`}
          style={{ left: l.x, top: l.y }}
          onClick={() => onPick?.(l.u)}
        >
          <i style={{ background: STATUS_META[l.u.status].color }} />
          {l.u.id} · {TYPOLOGIES[l.u.dorms].short}
          <small>{l.u.area} m²</small>
        </button>
      ))}
    </div>
  );
}
