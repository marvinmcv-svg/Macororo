import { useState } from 'react';
import { waLink } from '../data/project';

export default function LeadModal({ onClose, unitId }: { onClose: () => void; unitId?: string }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="x" onClick={onClose} aria-label="Cerrar">×</button>
        <div className="mono" style={{ color: 'var(--muted)' }}>Macororó 16 | 17</div>
        <h3>{unitId ? `Visitar ${unitId}` : 'Agendar visita'}</h3>
        <p style={{ color: 'var(--muted)', marginTop: 0 }}>Te respondemos por WhatsApp con horarios disponibles.</p>
        <LeadForm unitId={unitId} />
      </div>
    </div>
  );
}

export function LeadForm({ unitId }: { unitId?: string }) {
  const [dorms, setDorms] = useState<string>(unitId ? '' : '3');
  const [name, setName] = useState('');
  const [when, setWhen] = useState('Esta semana');
  const [msg, setMsg] = useState('');
  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const text = [
      `Hola, soy ${name || '—'}.`,
      unitId ? `Me interesa el departamento ${unitId} de Macororó 16|17.` : `Busco un departamento de ${dorms} dormitorio(s) en Macororó 16|17.`,
      `Quisiera agendar una visita: ${when}.`,
      msg,
    ]
      .filter(Boolean)
      .join(' ');
    window.open(waLink(text), '_blank', 'noopener');
  };
  return (
    <form className="form" onSubmit={send}>
      <label>Nombre<input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" /></label>
      {!unitId && (
        <label>
          Dormitorios
          <div className="chips">
            {['1', '2', '3', '4'].map((d) => (
              <button type="button" key={d} className={`chip ${dorms === d ? 'on' : ''}`} onClick={() => setDorms(d)}>{d} dorm.</button>
            ))}
          </div>
        </label>
      )}
      <label>
        ¿Cuándo querés visitar?
        <div className="chips">
          {['Esta semana', 'Fin de semana', 'Próximo mes'].map((w) => (
            <button type="button" key={w} className={`chip ${when === w ? 'on' : ''}`} onClick={() => setWhen(w)}>{w}</button>
          ))}
        </div>
      </label>
      <label>Mensaje (opcional)<textarea value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Piso preferido, forma de pago, etc." /></label>
      <button className="btn btn-green" type="submit" style={{ justifyContent: 'center' }}>Enviar por WhatsApp →</button>
      <p className="note" style={{ margin: 0 }}>Se abrirá WhatsApp con tu mensaje listo para enviar a nuestro equipo comercial.</p>
    </form>
  );
}
