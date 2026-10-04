import { remembered } from './remembered'

const signature = remembered<string>({
  key: 'skydock.signature',
  fallback: 'L’équipe montage',
  from: (stored) => stored
})

const setSignature = signature.set
const useSignature = signature.use

export { setSignature, useSignature }
