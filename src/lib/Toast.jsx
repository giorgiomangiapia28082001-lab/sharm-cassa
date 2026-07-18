import { createContext, useCallback, useContext, useRef, useState } from 'react'

// ============================================================================
// Sistema di notifiche (toast) globale.
//
// Perché esiste: prima le chiamate a Supabase che fallivano (rete assente,
// permessi, errori del database) non davano NESSUN segnale visibile.
// Un operatore poteva "salvare" un incasso, la rete cadeva, e il dato
// spariva senza che nessuno se ne accorgesse.
//
// Uso tipico in una pagina:
//   const toast = useToast()
//   toast.error('Connessione assente: il dato non è stato salvato')
//   toast.success('Incasso salvato')
//   toast.warning('Attenzione: importo insolito')
// ============================================================================

const ToastContext = createContext(null)

let idCounter = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef({})

  const rimuovi = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id))
    clearTimeout(timers.current[id])
    delete timers.current[id]
  }, [])

  const mostra = useCallback((messaggio, tipo = 'info', durata = 6000) => {
    const id = ++idCounter
    setToasts((t) => [...t, { id, messaggio, tipo }])
    if (durata > 0) {
      timers.current[id] = setTimeout(() => rimuovi(id), durata)
    }
    return id
  }, [rimuovi])

  const api = {
    success: (msg, durata) => mostra(msg, 'success', durata ?? 4000),
    error: (msg, durata) => mostra(msg, 'error', durata ?? 8000),
    warning: (msg, durata) => mostra(msg, 'warning', durata ?? 7000),
    info: (msg, durata) => mostra(msg, 'info', durata ?? 5000),
    chiudi: rimuovi,
  }

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          left: 20,
          maxWidth: 420,
          marginLeft: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          zIndex: 9999,
          pointerEvents: 'none',
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            onClick={() => rimuovi(t.id)}
            style={{
              pointerEvents: 'auto',
              cursor: 'pointer',
              padding: '12px 16px',
              borderRadius: 10,
              fontSize: 13.5,
              lineHeight: 1.4,
              fontFamily: 'var(--font-body)',
              boxShadow: '0 6px 20px rgba(14,42,61,0.25)',
              color: 'var(--avorio)',
              background:
                t.tipo === 'error' ? '#B84A35' :
                t.tipo === 'warning' ? '#B8862E' :
                t.tipo === 'success' ? 'var(--smeraldo)' :
                'var(--notte)',
              animation: 'toast-in 0.2s ease',
            }}
          >
            {t.messaggio}
          </div>
        ))}
      </div>
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    // Fallback sicuro se usato fuori dal Provider (non dovrebbe succedere)
    return { success: () => {}, error: (m) => alert(m), warning: (m) => alert(m), info: () => {}, chiudi: () => {} }
  }
  return ctx
}
