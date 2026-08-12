// ============================================================================
// Caricamento di foto e PDF — logica condivisa da tutte le pagine.
//
// Perché esiste questo file:
// Le foto scattate col telefono pesano spesso 3-8 MB. Caricarle così com'è
// è lento con la connessione del ristorante e a volte fallisce. Qui le
// rimpiccioliamo prima di inviarle (senza che si veda differenza a schermo)
// e mostriamo un messaggio d'errore comprensibile quando qualcosa va storto,
// invece di lasciare l'utente senza spiegazione.
//
// I PDF vengono caricati così come sono, senza toccarli.
// ============================================================================

import { supabase } from './supabase'

const LATO_MASSIMO = 1600   // pixel: più che sufficiente per leggere uno scontrino
const QUALITA = 0.82        // compressione JPEG: buon compromesso qualità/peso

/**
 * Rimpicciolisce un'immagine prima del caricamento.
 * Se il file non è un'immagine (es. PDF) o qualcosa va storto, restituisce
 * il file originale senza modificarlo.
 */
export async function comprimiSeImmagine(file) {
  if (!file || !file.type || !file.type.startsWith('image/')) return file

  try {
    const bitmap = await creaBitmap(file)
    const scala = Math.min(1, LATO_MASSIMO / Math.max(bitmap.width, bitmap.height))

    // Già piccola e leggera: la lasciamo com'è
    if (scala === 1 && file.size < 1_200_000) return file

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scala)
    canvas.height = Math.round(bitmap.height * scala)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', QUALITA))
    if (!blob) return file

    // Se la compressione non ha portato vantaggi, teniamo l'originale
    if (blob.size >= file.size) return file

    return new File([blob], sostituisciEstensione(file.name, 'jpg'), { type: 'image/jpeg' })
  } catch {
    return file // in caso di problemi carichiamo comunque l'originale
  }
}

function creaBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file)
  }
  // Fallback per browser più vecchi
  return new Promise((risolvi, rifiuta) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); risolvi(img) }
    img.onerror = () => { URL.revokeObjectURL(url); rifiuta(new Error('immagine non leggibile')) }
    img.src = url
  })
}

function sostituisciEstensione(nome, nuova) {
  const base = String(nome || 'foto').replace(/\.[^.]+$/, '')
  return `${base}.${nuova}`
}

function estensioneDi(file) {
  const dalNome = String(file?.name || '').split('.').pop()
  if (dalNome && dalNome.length <= 5 && !dalNome.includes('/')) return dalNome.toLowerCase()
  if (file?.type === 'application/pdf') return 'pdf'
  return 'jpg'
}

/**
 * Carica un file (foto o PDF) nell'archivio e restituisce il link pubblico.
 *
 * Ritorna { url, errore }:
 *   - url    → link da salvare nel database (null se non è andata)
 *   - errore → messaggio già pronto da mostrare all'utente (null se tutto ok)
 *
 * @param file      il file scelto dall'utente
 * @param cartella  sottocartella dell'archivio (es. 'scontrini', 'soci')
 */
export async function caricaAllegato(file, cartella) {
  if (!file) return { url: null, errore: null }

  // 15 MB è il limite impostato sull'archivio
  if (file.size > 15 * 1024 * 1024) {
    return { url: null, errore: 'Il file supera i 15 MB: prova a scattare una foto a risoluzione più bassa.' }
  }

  let daInviare = file
  try {
    daInviare = await comprimiSeImmagine(file)
  } catch {
    daInviare = file
  }

  const percorso = `${cartella}/${Date.now()}-${Math.random().toString(36).slice(2)}.${estensioneDi(daInviare)}`

  const { error } = await supabase.storage.from('foto').upload(percorso, daInviare, {
    contentType: daInviare.type || undefined,
    upsert: false,
  })

  if (error) {
    return { url: null, errore: messaggioErrore(error) }
  }

  const { data } = supabase.storage.from('foto').getPublicUrl(percorso)
  if (!data?.publicUrl) {
    return { url: null, errore: 'Il file è stato caricato ma non è stato possibile ottenere il link.' }
  }

  return { url: data.publicUrl, errore: null }
}

/**
 * Traduce gli errori tecnici dell'archivio in frasi comprensibili,
 * così se un caricamento fallisce si capisce cosa fare.
 */
function messaggioErrore(error) {
  const testo = String(error?.message || '').toLowerCase()

  if (testo.includes('mime') || testo.includes('not supported') || testo.includes('invalid_mime')) {
    return 'Questo tipo di file non è ammesso dall\'archivio. Va eseguita la migrazione 24 su Supabase.'
  }
  if (testo.includes('exceeded') || testo.includes('too large') || testo.includes('maximum size')) {
    return 'Il file è troppo grande per l\'archivio. Va eseguita la migrazione 24 su Supabase per alzare il limite.'
  }
  if (testo.includes('bucket not found')) {
    return 'L\'archivio "foto" non esiste su Supabase. Va eseguita la migrazione 24.'
  }
  if (testo.includes('policy') || testo.includes('unauthorized') || testo.includes('permission')) {
    return 'Permessi mancanti sull\'archivio foto. Va eseguita la migrazione 24 su Supabase.'
  }
  if (testo.includes('failed to fetch') || testo.includes('network')) {
    return 'Connessione assente o instabile: il file non è stato caricato.'
  }
  return `Caricamento non riuscito: ${error?.message || 'errore sconosciuto'}`
}

/** Riconosce se un allegato è un PDF (per mostrare l'icona giusta). */
export function isPdf(url) {
  return /\.pdf($|\?)/i.test(String(url || ''))
}
