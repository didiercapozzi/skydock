/* A line of explanation that is not part of any panel: something worth saying about what is on
   screen. Two voices only — the app's own colour for telling you something, and the colour of a
   file that still needs work for telling you something is owed. */
const TONE = {
  note: 'border-accent bg-accent-soft',
  warn: 'border-local bg-local-soft'
}

const Callout = ({
  tone = 'note',
  children
}: {
  tone?: keyof typeof TONE
  children: React.ReactNode
}) => (
  <p
    className={`mt-3 rounded-r-md border-l-[3px] px-3 py-[9px] text-[12.5px] text-ink-2 ${TONE[tone]}`}>
    {children}
  </p>
)

export { Callout }
