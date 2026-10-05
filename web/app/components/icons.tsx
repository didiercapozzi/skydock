/* The board's icons, drawn as the design draws them: a thin stroke in the colour of the words beside
   them, on a 24-unit square. Kept here, one name each, so a place, a tool and a button asking for
   the same thing draw the same mark. */
const PATHS = {
  fresh: (
    <>
      <path d='M4 7h16v12H4zM4 7l2-3h12l2 3' />
      <path d='M10 12h4' />
    </>
  ),
  place: (
    <>
      <path d='M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z' />
      <circle
        cx='12'
        cy='9.5'
        r='2.4'
      />
    </>
  ),
  plus: <path d='M12 5v14M5 12h14' />,
  montage: (
    <>
      <rect
        x='3'
        y='5'
        width='18'
        height='14'
        rx='2'
      />
      <path d='M7 5v14M17 5v14' />
    </>
  ),
  storage: (
    <>
      <rect
        x='3'
        y='4'
        width='18'
        height='7'
        rx='2'
      />
      <rect
        x='3'
        y='13'
        width='18'
        height='7'
        rx='2'
      />
      <path d='M7 7.5h.01M7 16.5h.01' />
    </>
  ),
  camera: (
    <>
      <path d='M3 8h4l2-3h6l2 3h4v11H3z' />
      <circle
        cx='12'
        cy='13'
        r='3.5'
      />
    </>
  ),
  bin: <path d='M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3' />,
  overview: (
    <>
      <rect
        x='4'
        y='4'
        width='7'
        height='7'
        rx='1'
      />
      <rect
        x='13'
        y='4'
        width='7'
        height='7'
        rx='1'
      />
      <rect
        x='4'
        y='13'
        width='7'
        height='7'
        rx='1'
      />
      <rect
        x='13'
        y='13'
        width='7'
        height='7'
        rx='1'
      />
    </>
  ),
  scan: <path d='M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6' />,
  rows: <path d='M4 6h16M4 12h16M4 18h16' />,
  search: (
    <>
      <circle
        cx='11'
        cy='11'
        r='7'
      />
      <path d='M20 20l-4-4' />
    </>
  ),
  keyboard: (
    <>
      <rect
        x='2.5'
        y='6'
        width='19'
        height='12'
        rx='2'
      />
      <path d='M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10' />
    </>
  ),
  settings: (
    <>
      <path d='M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12' />
      <circle
        cx='16'
        cy='6'
        r='2'
      />
      <circle
        cx='10'
        cy='12'
        r='2'
      />
      <circle
        cx='18'
        cy='18'
        r='2'
      />
    </>
  ),
  details: (
    <>
      <rect
        x='3'
        y='4.5'
        width='18'
        height='15'
        rx='2.5'
      />
      <path d='M15 4.5v15' />
    </>
  ),
  zip: (
    <>
      <rect
        x='5'
        y='3'
        width='14'
        height='18'
        rx='2'
      />
      <path d='M12 3v8M10 6h4M10 9h4' />
      <rect
        x='10'
        y='12'
        width='4'
        height='4'
        rx='1'
      />
    </>
  ),
  photo: (
    <>
      <rect
        x='3'
        y='5'
        width='18'
        height='14'
        rx='2'
      />
      <circle
        cx='9'
        cy='10'
        r='1.6'
      />
      <path d='M21 16l-5-5-9 8' />
    </>
  ),
  project: <path d='M4 7h8M4 12h16M4 17h11' />,
  narrow: <path d='M4 6h16M7 12h10M10 18h4' />,
  check: <path d='M5 12.5 10 17 19 7' />,
  moveTo: <path d='M5 12h14M13 6l6 6-6 6' />,
  scissors: (
    <>
      <circle
        cx='6'
        cy='6'
        r='3'
      />
      <circle
        cx='6'
        cy='18'
        r='3'
      />
      <path d='M8.5 7.5 20 18M8.5 16.5 20 6' />
    </>
  ),
  eject: <path d='M12 4 5 12h14zM5 17h14' />,
  copying: <path d='M12 3v14M8 7l4-4 4 4M7 13h10v3a5 5 0 0 1-10 0z' />,
  play: (
    <path
      d='M7 4l13 8-13 8z'
      fill='currentColor'
    />
  ),
  upload: <path d='M12 19V5M6 11l6-6 6 6' />,
  lock: (
    <>
      <rect
        x='5'
        y='11'
        width='14'
        height='9'
        rx='2'
      />
      <path d='M8 11V8a4 4 0 0 1 8 0v3' />
    </>
  ),
  open: <path d='M14 4h6v6M20 4l-9 9M18 14v6H4V6h6' />,
  alert: (
    <>
      <circle
        cx='12'
        cy='12'
        r='9'
      />
      <path d='M12 8v5M12 16.5h.01' />
    </>
  ),
  more: (
    <>
      <circle
        cx='5'
        cy='12'
        r='1.2'
      />
      <circle
        cx='12'
        cy='12'
        r='1.2'
      />
      <circle
        cx='19'
        cy='12'
        r='1.2'
      />
    </>
  ),
  link: (
    <path d='M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1' />
  ),
  previous: <path d='m15 6-6 6 6 6' />,
  next: <path d='m9 6 6 6-6 6' />,
  monitor: (
    <>
      <rect
        x='3'
        y='4'
        width='18'
        height='12'
        rx='2'
      />
      <path d='M8 20h8M12 16v4' />
    </>
  ),
  fullScreen: <path d='M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5' />,
  close: <path d='M6 6l12 12M18 6 6 18' />,
  minimise: <path d='M6 12h12' />,
  maximise: (
    <rect
      x='6'
      y='6'
      width='12'
      height='12'
      rx='2'
    />
  ),
  restore: (
    <>
      <rect
        x='4.5'
        y='8.5'
        width='11'
        height='11'
        rx='2'
      />
      <path d='M8.5 8.5v-2a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-2' />
    </>
  ),
  back: <path d='M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3' />,
  mail: (
    <>
      <rect
        x='3'
        y='5'
        width='18'
        height='14'
        rx='2'
      />
      <path d='m3 7 9 6 9-6' />
    </>
  )
} as const

type IconName = keyof typeof PATHS

const Icon = ({
  name,
  size = 16,
  weight = 1.8,
  className = ''
}: {
  name: IconName
  size?: number
  weight?: number
  className?: string
}) => (
  <svg
    width={size}
    height={size}
    viewBox='0 0 24 24'
    fill='none'
    stroke='currentColor'
    strokeWidth={weight}
    strokeLinecap='round'
    strokeLinejoin='round'
    aria-hidden='true'
    className={`flex-none ${className}`}>
    {PATHS[name]}
  </svg>
)

/* the app's own mark: a canopy over a drop, on the accent gradient */
const Mark = ({ size = 16 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox='0 0 22 22'
    aria-hidden='true'
    className='flex-none'>
    <defs>
      <linearGradient
        id='mark-fill'
        x1='0'
        y1='0'
        x2='1'
        y2='1'>
        <stop
          offset='0'
          stopColor='#43b0f5'
        />
        <stop
          offset='1'
          stopColor='#0b7fd6'
        />
      </linearGradient>
    </defs>
    <rect
      width='22'
      height='22'
      rx='7'
      fill='url(#mark-fill)'
    />
    <path
      d='M5 10.5c2-4.4 10-4.4 12 0'
      fill='none'
      stroke='#fff'
      strokeWidth='1.9'
      strokeLinecap='round'
    />
    <path
      d='M6 10.8 11 16l5-5.2'
      fill='none'
      stroke='#fff'
      strokeWidth='1.9'
      strokeLinecap='round'
      strokeLinejoin='round'
    />
  </svg>
)

export { Icon, Mark }
export type { IconName }
