import { useEffect, useRef, useCallback } from 'react'

type HlsType = typeof import('hls.js').default

type UseHlsPlayerOptions = {
  src: string
  videoRef: React.RefObject<HTMLVideoElement | null>
  autoplay?: boolean
  onReady?: () => void
  onError?: (error: string) => void
}

type UseHlsPlayerReturn = {
  destroy: () => void
}

const useHlsPlayer = ({
  src,
  videoRef,
  autoplay = true,
  onReady,
  onError
}: UseHlsPlayerOptions): UseHlsPlayerReturn => {
  const hlsInstanceRef = useRef<InstanceType<HlsType> | null>(null)
  const lastSrcRef = useRef('')

  const destroy = useCallback(() => {
    if (hlsInstanceRef.current) {
      hlsInstanceRef.current.destroy()
      hlsInstanceRef.current = null
    }
    lastSrcRef.current = ''
  }, [])

  useEffect(() => {
    const vid = videoRef?.current
    if (!vid || !src) return

    if (lastSrcRef.current === src) return
    lastSrcRef.current = src

    if (hlsInstanceRef.current) {
      hlsInstanceRef.current.destroy()
      hlsInstanceRef.current = null
    }

    const init = async () => {
      if (typeof window === 'undefined') return

      let HlsClass: HlsType
      try {
        HlsClass = (await import('hls.js')).default
      } catch {
        onError?.('Failed to load HLS library')
        return
      }

      if (HlsClass.isSupported()) {
        const hls = new HlsClass({
          enableWorker: true,
          lowLatencyMode: true,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          startFragPrefetch: true
        })

        hls.loadSource(src)
        hls.attachMedia(vid)

        hls.on(HlsClass.Events.MANIFEST_PARSED, () => {
          if (autoplay) {
            const p = vid.play()
            if (p && typeof p.catch === 'function') p.catch(() => {})
          }
          onReady?.()
        })

        hls.on(HlsClass.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            switch (data.type) {
              case HlsClass.ErrorTypes.NETWORK_ERROR:
                hls.startLoad()
                break
              case HlsClass.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError()
                break
              default:
                onError?.(`HLS fatal error: ${data.details}`)
                hls.destroy()
                hlsInstanceRef.current = null
                break
            }
          }
        })

        hlsInstanceRef.current = hls
      } else if (vid.canPlayType('application/vnd.apple.mpegurl')) {
        vid.src = src
        if (autoplay) {
          vid.addEventListener(
            'loadedmetadata',
            () => {
              const p = vid.play()
              if (p && typeof p.catch === 'function') p.catch(() => {})
              onReady?.()
            },
            { once: true }
          )
        }
      } else {
        onError?.('HLS is not supported in this browser')
      }
    }

    init()

    return () => {
      if (hlsInstanceRef.current) {
        hlsInstanceRef.current.destroy()
        hlsInstanceRef.current = null
      }
    }
  }, [src, videoRef, autoplay, onReady, onError])

  useEffect(() => {
    return () => {
      if (hlsInstanceRef.current) {
        hlsInstanceRef.current.destroy()
        hlsInstanceRef.current = null
      }
    }
  }, [])

  return { destroy }
}

export { useHlsPlayer }
export type { UseHlsPlayerOptions, UseHlsPlayerReturn }
