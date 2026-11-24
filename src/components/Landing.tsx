import { useEffect, useMemo, useState } from 'react';
import { AMENITIES, CONTACT, GALLERY, M, NEARBY, ORIGIN_PIN, PROJECT, TRACK_RECORD, waLink } from '../data/project';
import { INVENTORY, STATUS_META, TYPOLOGIES, fmtUSD, type Typology } from '../data/units';
import { useCountUp, useInView } from '../lib/hooks';
import LeadModal, { LeadForm } from './LeadModal';

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

function Reveal({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className={`reveal ${seen ? 'in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

function HeroScene() {
  return (
    <div className="hero-canvas hero-photo">
      <img src={M('tower-entrance.webp')} alt="Macororó 16 | 17 — acceso principal sobre Av. Beni" />
    </div>
  );
}

function Stat({ value, decimals, label, run }: { value: number; decimals: number; label: string; run: boolean }) {
  const v = useCountUp(value, run);
  return (
    <div className="stat">
      <strong>{v.toLocaleString('es-BO', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</strong>
      <span>{label}</span>
    </div>
  );
}

export default function Landing() {
  const [scrolled, setScrolled] = useState(false);
  const [lead, setLead] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [night, setNight] = useState(false);
  const [place, setPlace] = useState(NEARBY[0].id);
  const [statsRef, statsSeen] = useInView<HTMLDivElement>(0.3);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  useEffect(() => {
    const t = setInterval(() => setNight((n) => !n), 3800);
    return () => clearInterval(t);
  }, []);

  const counts = useMemo(() => {
    const c = { disponible: 0, reservado: 0, vendido: 0 };
    INVENTORY.forEach((u) => c[u.status]++);
    return c;
  }, []);

  const typo = useMemo(
    () =>
      ([1, 2, 3, 4] as Typology[]).map((d) => {
        const list = INVENTORY.filter((u) => u.dorms === d);
        const av = list.filter((u) => u.status === 'disponible');
        return { d, avail: av.length, from: Math.min(...(av.length ? av : list).map((u) => u.price)) };
      }),
    [],
  );

  const active = NEARBY.find((p) => p.id === place)!;

  return (
    <>
      <nav className={`nav ${scrolled ? 'scrolled' : ''}`}>
        <a className="brand" href="#/" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          MACORORÓ <b>16|17</b> <small>CITY PARK</small>
        </a>
        <div className="nav-links">
          <button onClick={() => scrollTo('s-deptos')}>Departamentos</button>
          <button onClick={() => scrollTo('s-interiores')}>Interiores</button>
          <button onClick={() => scrollTo('s-amenidades')}>Amenidades</button>
          <button onClick={() => scrollTo('s-ubicacion')}>Ubicación</button>
          <button onClick={() => scrollTo('s-contacto')}>Contacto</button>
        </div>
        <div className="nav-cta">
          <button className="btn btn-ghost btn-sm" onClick={() => setLead(true)}>Agendar visita</button>
          <a className="btn btn-green btn-sm" href="#/explorar">Explorar <span className="arrow">→</span></a>
        </div>
      </nav>

      {/* HERO */}
      <header className="hero">
        <HeroScene />
        <div className="hero-copy">
          <div className="mono dot">Macororó 16 | 17 · City Park · Santa Cruz</div>
          <h1 className="display">
            El ícono de <span className="l2">las alturas.</span>
          </h1>
          <p className="lead">{PROJECT.intro}</p>
          <div className="hero-actions">
            <a className="btn btn-green" href="#/explorar">Explorar disponibilidad <span className="arrow">→</span></a>
            <button className="btn btn-ghost" onClick={() => setLead(true)}>Agendar visita</button>
          </div>
          <div className="hero-meta">
            <div><strong>37</strong><span>pisos por torre</span></div>
            <div><strong>2</strong><span>torres + puente estructural</span></div>
            <div><strong>1–4</strong><span>dormitorios</span></div>
            <div><strong>2 MIN</strong><span>al Cristo Redentor</span></div>
          </div>
        </div>
        <div className="hero-chip">
          <div className="mono" style={{ color: 'var(--muted)', marginBottom: 6 }}>Disponibilidad en vivo</div>
          {(['disponible', 'reservado', 'vendido'] as const).map((s) => (
            <div className="row" key={s}>
              <span><i className="legend-dot" style={{ background: STATUS_META[s].color }} />{STATUS_META[s].label}</span>
              <b>{counts[s]}</b>
            </div>
          ))}
          <a href="#/explorar?modo=residencias&solo=1" className="btn btn-sm" style={{ marginTop: 8, background: 'var(--ink)', color: '#fff', width: '100%', justifyContent: 'center' }}>
            Ver disponibles →
          </a>
        </div>
        <div className="hero-hint mono">Fotografía real · disponibilidad en vivo</div>
      </header>

      {/* TYPOLOGIES */}
      <section className="section" id="s-deptos" style={{ background: 'var(--ink-2)' }}>
        <Reveal>
          <div className="mono eyebrow dot">Departamentos</div>
          <h2 className="display h2">Tu inversión,<span className="g">tu futuro.</span></h2>
          <p className="sub">Departamentos de 1, 2, 3 y 4 dormitorios diseñados para maximizar el confort y la funcionalidad, con la solidez y el prestigio de Macororó.</p>
        </Reveal>
        <div className="typos">
          {typo.map((t, i) => (
            <Reveal key={t.d} delay={i * 90}>
              <a className="typo" href={`#/explorar?modo=residencias&dorms=${t.d}`} style={{ display: 'block' }}>
                <img src={TYPOLOGIES[t.d].hero} alt={TYPOLOGIES[t.d].label} loading="lazy" />
                <span className="avail mono"><span className="dot" />{t.avail} disponibles</span>
                <div className="in">
                  <div className="big display">{t.d}<small>{t.d === 1 ? 'DORMITORIO' : 'DORMITORIOS'}</small></div>
                  <div className="meta"><span>~{TYPOLOGIES[t.d].area} m²</span><span>desde <b>{fmtUSD(t.from)}</b></span></div>
                </div>
              </a>
            </Reveal>
          ))}
        </div>
      </section>

      {/* INTERIORS */}
      <section className="section" id="s-interiores">
        <div className="split">
          <Reveal>
            <div className="mono eyebrow dot">Recorrido real · obra entregada</div>
            <h2 className="display h2">No es un render.<span className="g">Ya está construido.</span></h2>
            <p className="sub">{PROJECT.structure} Porcelanato de gran formato, carpintería de aluminio con vidrio piso a techo y balcones curvos en cada nivel.</p>
            <div className="hero-actions" style={{ marginTop: 28 }}>
              <a className="btn btn-green" href="#/explorar?unidad=16-24A&tab=interiores">Ver por dentro <span className="arrow">→</span></a>
              <a className="btn btn-ghost" href={waLink('Hola, quiero coordinar una visita a Macororó 16|17.')} target="_blank" rel="noreferrer">Visitar en persona</a>
            </div>
          </Reveal>
          <Reveal delay={150}>
            <div className="phone">
              <video src={M('walkthrough.mp4')} poster={M('walkthrough-poster.webp')} autoPlay muted loop playsInline />
            </div>
          </Reveal>
        </div>
        <div className="gallery">
          {GALLERY.map((g) => (
            <figure key={g.img} onClick={() => setLightbox(g.img)}>
              <img src={g.img} alt={g.title} loading="lazy" />
              <figcaption>{g.title}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* AMENITIES */}
      <section className="section" id="s-amenidades" style={{ background: 'var(--ink-2)' }}>
        <Reveal>
          <div className="mono eyebrow dot">Áreas comunes</div>
          <h2 className="display h2">Un estilo de vida<span className="g">elevado.</span></h2>
          <p className="sub">{PROJECT.amenitiesIntro}</p>
        </Reveal>
        <div className="amen">
          {AMENITIES.map((a, i) => (
            <Reveal key={a.id} delay={(i % 3) * 90}>
              <a className="amen-card" href={`#/explorar?modo=amenidades&a=${a.id}`} style={{ display: 'block' }}>
                <img src={a.img} alt={a.name} loading="lazy" style={{ opacity: a.night && night ? 0 : 1 }} />
                {a.night && <img src={a.night} alt="" loading="lazy" style={{ opacity: night ? 1 : 0 }} />}
                {a.night && (
                  <div className="toggle" onClick={(e) => e.preventDefault()}>
                    <button className={!night ? 'on' : ''} onClick={() => setNight(false)}>Día</button>
                    <button className={night ? 'on' : ''} onClick={() => setNight(true)}>Noche</button>
                  </div>
                )}
                <div className="in">
                  <h3>{a.name}</h3>
                  <p>{a.desc}</p>
                </div>
              </a>
            </Reveal>
          ))}
        </div>
      </section>

      {/* LOCATION */}
      <section className="section" id="s-ubicacion">
        <Reveal>
          <div className="mono eyebrow dot">{PROJECT.address}</div>
          <h2 className="display h2">Todo queda<span className="g">a minutos.</span></h2>
          <p className="sub">{PROJECT.locationIntro}</p>
        </Reveal>
        <div className="loc">
          <Reveal>
            <div className="media-frame" style={{ aspectRatio: '1 / 0.85' }}>
              <img src={M('aerial-city.webp')} alt="Vista aérea de la ubicación" loading="lazy" style={{ position: 'absolute', inset: 0 }} />
              <svg className="route" viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d={`M${ORIGIN_PIN[0]} ${ORIGIN_PIN[1]} Q ${(ORIGIN_PIN[0] + active.to[0]) / 2} ${Math.min(ORIGIN_PIN[1], active.to[1]) - 10} ${active.to[0]} ${active.to[1]}`} stroke="#2BE35A" strokeWidth="0.9" strokeDasharray="2 1.4" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 4 }} />
              </svg>
              <div className="min-chip" style={{ left: `${active.to[0]}%`, top: `${active.to[1]}%` }}>
                {active.minutes} MIN<small>{active.name}</small>
              </div>
            </div>
          </Reveal>
          <div className="times">
            {NEARBY.map((p) => (
              <div key={p.id} className={`time-row ${p.id === place ? 'on' : ''}`} onMouseEnter={() => setPlace(p.id)} onClick={() => setPlace(p.id)}>
                <div className="ic">{p.icon}</div>
                <div className="nm">{p.name}</div>
                <div className="mn display">{p.minutes}<small>min</small></div>
              </div>
            ))}
            <a className="btn btn-ghost" href={PROJECT.mapsUrl} target="_blank" rel="noreferrer" style={{ justifySelf: 'start', marginTop: 8 }}>Ver en Google Maps ↗</a>
          </div>
        </div>
      </section>

      {/* TRACK RECORD */}
      <section className="section" style={{ background: 'var(--ink-2)' }}>
        <Reveal>
          <div className="mono eyebrow dot">Grupo Macororó · Empresa de las alturas</div>
          <h2 className="display h2">Más de dos décadas<span className="g">construyendo sueños.</span></h2>
          <p className="sub">Con casi 20 años en Santa Cruz, Macororó se ha convertido en un referente nacional en proyectos inmobiliarios en altura. Macororó 10, 13 | 14, 15 entregados; 16 | 17, 18 y 19 elevando la ciudad.</p>
        </Reveal>
        <div className="stats" ref={statsRef}>
          {TRACK_RECORD.map((s) => <Stat key={s.label} {...s} run={statsSeen} />)}
        </div>
      </section>

      {/* CONTACT */}
      <section className="section" id="s-contacto">
        <div className="contact">
          <Reveal>
            <div className="mono eyebrow dot">Contacto</div>
            <h2 className="display h2">Construido.<span className="g">Respondido ahora.</span></h2>
            <p className="sub">Contanos qué buscás y un asesor te responde por WhatsApp con disponibilidad, precios y planes de pago actualizados.</p>
            <div style={{ marginTop: 28, display: 'grid', gap: 8, color: '#c5cbc6' }}>
              <div>📍 {CONTACT.office}</div>
              <div>☎ {CONTACT.phones.join(' · ')}</div>
              <div>✉ {CONTACT.email}</div>
              <div>🕘 {CONTACT.hours.join(' · ')}</div>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <LeadForm />
          </Reveal>
        </div>
      </section>

      <footer className="footer">
        <div>
          <div className="brand" style={{ marginBottom: 14 }}>MACORORÓ <b>16|17</b></div>
          <p style={{ margin: 0, maxWidth: 320 }}>{PROJECT.developer} — Grupo empresarial boliviano enfocado en el desarrollo de proyectos inmobiliarios en altura.</p>
        </div>
        <div>
          <h4>Proyecto</h4>
          <div style={{ display: 'grid', gap: 6 }}>
            <a href="#/explorar">Explorador en vivo</a>
            <a href="#/explorar?modo=residencias">Disponibilidad</a>
            <a href="#/explorar?modo=amenidades">Amenidades</a>
            <a href="#/explorar?modo=ubicacion">Ubicación</a>
          </div>
        </div>
        <div>
          <h4>Oficina</h4>
          <div style={{ display: 'grid', gap: 6 }}>
            {CONTACT.hours.map((h) => <span key={h}>{h}</span>)}
            <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
          </div>
        </div>
        <div>
          <h4>Síguenos</h4>
          <div style={{ display: 'grid', gap: 6 }}>
            <a href={CONTACT.instagram} target="_blank" rel="noreferrer">Instagram ↗</a>
            <a href={CONTACT.facebook} target="_blank" rel="noreferrer">Facebook ↗</a>
            <a href={CONTACT.website} target="_blank" rel="noreferrer">macororo.com ↗</a>
          </div>
        </div>
        <div className="bottom">
          <span>© {new Date().getFullYear()} Grupo Macororó. Todos los derechos reservados.</span>
          <span>Imágenes referenciales. Precios y disponibilidad sujetos a confirmación.</span>
        </div>
      </footer>

      <a className="wa-fab" href={waLink('Hola, me gustaría recibir más información sobre Macororó 16|17.')} target="_blank" rel="noreferrer" aria-label="WhatsApp">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="#fff"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.5-.3Z" /></svg>
      </a>

      {lightbox && (
        <div className="overlay" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" />
        </div>
      )}
      {lead && <LeadModal onClose={() => setLead(false)} />}
    </>
  );
}
