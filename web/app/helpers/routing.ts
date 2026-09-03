import type { Register } from 'react-router'
import { createSafeRoutingEngine, createSafeRoutingHooks } from '../../../packages/ui/routing'

const routingEngine = createSafeRoutingEngine<Register>()

const { useSafeFetcher, useSafeForm, useSafeSearchParams, useSafeSubmit } =
  createSafeRoutingHooks(routingEngine)

export { routingEngine, useSafeFetcher, useSafeForm, useSafeSearchParams, useSafeSubmit }
