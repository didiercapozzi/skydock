import type { ReactNode } from 'react'

const Problem = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <p
    role='alert'
    className={`m-0 rounded-xl bg-local-soft px-3.5 py-2.5 text-[12.5px] text-local ${className}`}>
    {children}
  </p>
)

const Empty = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <p
    className={`m-0 rounded-2xl border-2 border-dashed border-line-strong px-3 py-5 text-center text-[12.5px] text-ink-3 ${className}`}>
    {children}
  </p>
)

const Looking = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <p className={`m-0 px-0.5 text-[12.5px] text-ink-3 ${className}`}>{children}</p>
)

const Note = ({ children }: { children: ReactNode }) => (
  <p className='m-0 rounded-[10px] bg-local-soft px-2.5 py-2 text-[12px] text-ink-2'>{children}</p>
)

export { Empty, Looking, Note, Problem }
