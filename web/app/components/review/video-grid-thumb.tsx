import { useEffect, useRef, useState } from 'react'
import type { ManifestFile } from '../../lib/types'

type VideoGridThumbProps = {
  file: ManifestFile
}

const VideoGridThumb = ({ file }: VideoGridThumbProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [hasError, setHasError] = useState(false)
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
  const liveThumbSrc = `/api/stream?path=${encodeURIComponent(file.path)}&thumb=1&w=320&t=0.5`
  return (
    <div
      ref={containerRef}
      className='w-full h-full bg-black'>
      {visible ? (
        hasError ? (
          <div className='w-full h-full flex items-center justify-center bg-gray-800 text-white text-[10px]'>
            ▶ Video
          </div>
        ) : (
          <img
            src={liveThumbSrc}
            alt={file.filename}
            className='w-full h-full object-cover bg-black'
            loading='lazy'
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
