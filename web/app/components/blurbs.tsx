import type { ReactNode } from 'react'

/* The few lines every page of files says in the same way: that something went wrong, that there is
   nothing to list, that it is being looked at, and a note under a question. One place, so they look
   alike and are changed together. */

/* what went wrong, read out as an alert */
const Problem = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <p
    role='alert'
    className={`m-0 rounded-corner bg-local-soft px-3.5 py-2.5 text-body text-local ${className}`}>
    {children}
  </p>
)

/* a list with nothing in it, said in a dashed box */
const Empty = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <p
    className={`m-0 rounded-corner border-2 border-dashed border-line-strong px-3 py-5 text-center text-body text-ink-3 ${className}`}>
    {children}
  </p>
)

/* something is being asked for, and has not answered yet */
const Looking = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <p className={`m-0 px-0.5 text-body text-ink-3 ${className}`}>{children}</p>
)

/* a note under a question in a dialog: what the answer will and will not do */
const Note = ({ children }: { children: ReactNode }) => (
  <p className='m-0 rounded-corner bg-local-soft px-2.5 py-2 text-small text-ink-2'>{children}</p>
)

export { Empty, Looking, Note, Problem }
