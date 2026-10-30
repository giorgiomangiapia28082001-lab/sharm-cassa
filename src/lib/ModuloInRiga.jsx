import { useEffect, useRef } from 'react'

// Contenitore del modulo di modifica aperto sotto la riga scelta, così non si
// deve risalire in cima alla pagina. Appena si apre lo porta in vista.
export default function ModuloInRiga({ children }) {
  const rif = useRef(null)

  useEffect(() => {
    rif.current?.scrollIntoView({ block: 'start' })
  }, [])

  return <div ref={rif} className="modulo-in-riga">{children}</div>
}
