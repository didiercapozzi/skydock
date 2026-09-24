import { DEFAULT_PLAN, jsonText, sendPlanSchema } from '@skydock/scripts'
import type { SendPlan } from '@skydock/scripts'
import { remembered } from './remembered'

/* How montages go up — what is zipped, and which destinations each item goes to (RULES, Uploading a
   montage). It is one habit for the whole club rather than a question per montage, so it is
   remembered on this machine and the next montage opens with it already made. Anything stored that
   does not make sense is the default rather than a guess. */
const plan = remembered<SendPlan>({
  key: 'skydock.send',
  fallback: DEFAULT_PLAN,
  from: (stored) => jsonText.pipe(sendPlanSchema).safeParse(stored).data ?? null,
  to: (made) => JSON.stringify(made)
})

const setSendPlan = plan.set
const useSendPlan = plan.use

export { setSendPlan, useSendPlan }
