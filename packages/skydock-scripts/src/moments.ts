const MOMENTS = [
  { which: 'exit', name: 'exit' },
  { which: 'opening', name: 'opening' },
  { which: 'canopy', name: 'canopy' },
  { which: 'landing', name: 'ground' }
] as const

type Moment = (typeof MOMENTS)[number]['which']

const nameOfMoment = (which: Moment) => MOMENTS.find((m) => m.which === which)?.name ?? which

export { MOMENTS, nameOfMoment }
export type { Moment }
