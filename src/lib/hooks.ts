import { useEffect, useRef, useState } from 'react';

export type Route = { page: 'home' | 'explorar'; params: URLSearchParams };

function parse(): Route {
  const h = window.location.hash.replace(/^#\/?/, '');
  const [path, q = ''] = h.split('?');
  return { page: path.startsWith('explorar') ? 'explorar' : 'home', params: new URLSearchParams(q) };
}

export function useHashRoute(): Route {
  const [r, setR] = useState(parse);
  useEffect(() => {
    const on = () => setR(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}

export const go = (hash: string) => {
  window.location.hash = hash;
};

export function useInView<T extends HTMLElement>(threshold = 0.15) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setSeen(true), io.disconnect()), { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, seen] as const;
}

export function useCountUp(target: number, run: boolean, ms = 1600) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!run) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, ms]);
  return v;
}

export function useLocalSet(key: string) {
  const [set, setSet] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch {
      return [];
    }
  });
  const toggle = (id: string) =>
    setSet((s) => {
      const n = s.includes(id) ? s.filter((x) => x !== id) : [...s, id];
      try {
        localStorage.setItem(key, JSON.stringify(n));
      } catch {
        /* storage unavailable */
      }
      return n;
    });
  return [set, toggle] as const;
}

export const fmtHour = (h: number) => {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm === 60 ? 0 : mm).padStart(2, '0')}`;
};
