import type { ProxyFact } from '@skydock/scripts'
import type { ManifestFile } from './types'
import { getPictureUrl } from './utils'

/* How many of a jump's pictures are shown, at the most. */
const MOST = 5

/* Pictures of files as slices that lean to the left and are each wider than the one before, drawn in
   the order the files were shot, each over the one before it with a thin blue shadow on its left
   edge — which is what makes the edges read as layers. The slices overlap, so there is never a gap,
   and what is under them is the first picture blurred, so a gap would not show a flat colour either.
   What does not fit is counted on the last. It is one drawing for a jump's card and for the top of the
   panel beside the files (docs/visual-design-rules.md, section 6). */
const Slices = ({
  files,
  proxies,
  width,
  grow = 0.4,
  className = ''
}: {
  files: ManifestFile[]
  /* where each clip's small copy is, so the picture is cut from it rather than from 4K */
  proxies?: Record<string, ProxyFact>
  /* the widest the picture is drawn, in pixels, so nothing larger than the slice is fetched */
  width: number
  /* how much wider each slice is than the one before it, as a share of the first */
  grow?: number
  className?: string
}) => {
  const shown = [...files].sort((a, b) => a.mtime - b.mtime).slice(0, MOST)
  const more = files.length - shown.length
  const weights = shown.map((_, n) => 1 + grow * n)
  const total = weights.reduce((sum, w) => sum + w, 0)
  const shares = weights.map((w) => (w / total) * 100)
  return (
    <span
      aria-hidden='true'
      data-picture=''
      className={`pointer-events-none relative block overflow-hidden bg-line-strong ${className}`}>
      {shown[0] && (
        <img
          src={getPictureUrl(shown[0], proxies?.[shown[0].path], 160)}
          alt=''
          loading='lazy'
          decoding='async'
          draggable={false}
          className='absolute -inset-5 block h-[calc(100%+40px)] w-[calc(100%+40px)] object-cover blur-[14px] brightness-[.85]'
        />
      )}
      {shown.map((file, n) => (
        <i
          key={file.id ?? file.path}
          style={{
            left:
              n === 0 ? '-30px' : `calc(${shares.slice(0, n).reduce((a, b) => a + b, 0)}% - 14px)`,
            width: `calc(${shares[n]}% + 34px)`,
            zIndex: n + 1,
            transform: 'skewX(-14deg)'
          }}
          className='absolute -top-1 -bottom-1 block overflow-hidden shadow-edge-left'>
          <img
            src={getPictureUrl(file, proxies?.[file.path], width)}
            alt=''
            loading='lazy'
            decoding='async'
            draggable={false}
            style={{ transform: 'skewX(14deg)' }}
            className='absolute inset-y-0 -left-5 block h-full w-[calc(100%+40px)] object-cover'
          />
        </i>
      ))}
      {more > 0 && (
        <b className='absolute right-2.5 bottom-2 z-20 rounded-full bg-veil/55 px-2.5 py-0.5 text-small font-bold text-white'>
          +{more}
        </b>
      )}
    </span>
  )
}

export { Slices }
