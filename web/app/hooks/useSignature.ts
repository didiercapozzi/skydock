import { useSyncExternalStore } from 'react'

/* The signature under every passenger email — the club's, not the passenger's — so it is typed
   once and remembered, the same way the backup choice is. */
const KEY = 'skydock.signature'

const DEFAULT = 'L’équipe tandem'

let chosen = DEFAULT

const listeners = new Set<() => void>()

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const readStored = () => {
  try {
    return localStorage.getItem(KEY) ?? chosen
  } catch {
    return chosen
  }
}

const setSignature = (signature: string) => {
  chosen = signature
  try {
    localStorage.setItem(KEY, signature)
  } catch {
    /* a browser refusing storage still gets the signature, just not the memory */
  }
  for (const listener of listeners) listener()
}

const useSignature = () => useSyncExternalStore(subscribe, readStored, () => DEFAULT)

export { setSignature, useSignature }
