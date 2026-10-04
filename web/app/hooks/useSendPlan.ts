import { DEFAULT_PLAN, jsonText, sendPlanSchema } from '@skydock/scripts'
import type { SendPlan } from '@skydock/scripts'
import { remembered } from './remembered'

const plan = remembered<SendPlan>({
  key: 'skydock.send',
  fallback: DEFAULT_PLAN,
  from: (stored) => jsonText.pipe(sendPlanSchema).safeParse(stored).data ?? null,
  to: (made) => JSON.stringify(made)
})

const setSendPlan = plan.set
const useSendPlan = plan.use

export { setSendPlan, useSendPlan }
