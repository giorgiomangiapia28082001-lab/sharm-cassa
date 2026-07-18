// ============================================================================
// Piccolo modale di conferma usato quando controllaPrezzoPersona() o
// controllaCambioValuta() rilevano un valore fuori dal range plausibile.
// Non blocca l'inserimento: chiede solo "sei sicuro?" con il dettaglio
// dell'anomalia, poi lascia scegliere se correggere o confermare.
// ============================================================================

export default function ConfermaAnomalia({ messaggio, onConferma, onAnnulla }) {
  if (!messaggio) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(14,42,61,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: 20,
      }}
      onClick={onAnnulla}
    >
      <div
        className="card"
        style={{ maxWidth: 440, width: '100%', padding: 22 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 22 }}>⚠️</span>
          <h3 style={{ fontSize: 16, color: 'var(--notte)' }}>Dato insolito rilevato</h3>
        </div>
        <p style={{ fontSize: 13.5, color: 'var(--inchiostro-soft)', lineHeight: 1.5, marginBottom: 20 }}>
          {messaggio}
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={onAnnulla}>
            Torna indietro e correggi
          </button>
          <button type="button" className="btn btn-accent" style={{ flex: 1 }} onClick={onConferma}>
            Conferma comunque
          </button>
        </div>
      </div>
    </div>
  )
}
