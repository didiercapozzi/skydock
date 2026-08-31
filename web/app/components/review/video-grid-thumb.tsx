import { useEffect, useRef, useState } from 'react'
import type { ManifestFile } from '../../lib/types'

type VideoGridThumbProps = {
  file: ManifestFile
}

const VideoGridThumb = ({ file }: VideoGridThumbProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [thumbError, setThumbError] = useState(false)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          io.disconnect()
        }
      },
      { rootMargin: '300px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  const useThumb = !!file.thumbPath && !thumbError
  return (
    <div
      ref={containerRef}
      className='w-full h-full bg-black'>
      {visible ? (
        useThumb ? (
          <img
            src={`/api/file?path=${encodeURIComponent(file.thumbPath!)}`}
            alt={file.filename}
            className='w-full h-full object-cover bg-black'
            loading='lazy'
            onError={() => setThumbError(true)}
          />
        ) : hasError ? (
          <div className='w-full h-full flex items-center justify-center bg-gray-800 text-white text-[10px]'>
            ▶ Video
          </div>
        ) : (
          <video
            src={`/api/file?path=${encodeURIComponent(file.path)}`}
            muted
            preload='metadata'
            playsInline
            crossOrigin='anonymous'
            className='w-full h-full object-cover bg-black'
            onLoadedMetadata={(e) => {
              const v = e.currentTarget
              try {
                if (v.duration > 0.5) v.currentTime = 0.5
              } catch {}
            }}
            onError={() => setHasError(true)}
          />
        )
      ) : (
        <div className='w-full h-full bg-gray-200 dark:bg-gray-700 animate-pulse' />
      )}
    </div>
  )
}

export { VideoGridThumb }
