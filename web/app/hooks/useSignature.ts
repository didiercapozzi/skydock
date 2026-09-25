import { remembered } from './remembered'

/* The signature under every passenger email — the club's, not the passenger's — so it is typed
   once and remembered. */
const signature = remembered<string>({
  key: 'skydock.signature',
  fallback: 'L’équipe montage',
  from: (stored) => stored
})

const setSignature = signature.set
const useSignature = signature.use

export { setSignature, useSignature }
