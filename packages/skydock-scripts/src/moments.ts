/* The four moments of a jump, in the order they happen, and the word each is called by. One word
   everywhere — on the clip's timeline, on the graph, on the marker the project carries — so what a
   person reads on the board before opening the editor is what they find inside it (RULES, Where the
   jump is in a clip). The last one is kept as `landing` and called the ground, which is where it is.

   Free of node imports: the board draws these. */
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
