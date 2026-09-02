// oxlint-disable react-hooks/exhaustive-deps
import { useCallback, useEffect, useReducer } from 'react'
import type { ManifestFile } from '../../lib/types'
import { isVideoFile } from './utils'
import { useHlsPlayer } from './use-hls-player'

const LOADING_TIMEOUT_MS = 20_000

type MediaPreviewProps = {
  file: ManifestFile
  maxHeight?: string
  videoRef?: React.RefObject<HTMLVideoElement | null>
  seek?: number
}

type MediaState = {
  isLoading: boolean
  useFallback: boolean
  retryKey: number
  error: string | null
}

type MediaAction =
  | { type: 'ready' }
  | { type: 'fallback' }
  | { type: 'error'; message: string }
  | { type: 'retry'; resetFallback?: boolean }
  | { type: 'reset'; isVideo: boolean }

const reducer = (state: MediaState, action: MediaAction): MediaState => {
  switch (action.type) {
    case 'ready':
      return { ...state, isLoading: false, error: null }
    case 'fallback':
      return {
        ...state,
        useFallback: true,
        isLoading: true,
        retryKey: state.retryKey + 1,
        error: null
      }
    case 'error':
      return { ...state, isLoading: false, error: action.message }
    case 'retry':
      return {
        ...state,
        error: null,
        isLoading: true,
        retryKey: state.retryKey + 1,
        useFallback: action.resetFallback ? false : state.useFallback
      }
    case 'reset':
      return { isLoading: action.isVideo, useFallback: false, retryKey: 0, error: null }
    default:
      return state
  }
}

const MediaPreview = ({ file, maxHeight = '60vh', videoRef, seek }: MediaPreviewProps) => {
  const hlsSrc = `/api/hls?path=${encodeURIComponent(file.path)}${seek != null && seek > 0 ? `&seek=${seek}` : ''}`
  const fallbackSrc = `/api/file?path=${encodeURIComponent(file.path)}`
  const [state, dispatch] = useReducer(reducer, {
    isLoading: isVideoFile(file.filename),
    useFallback: false,
    retryKey: 0,
    error: null
  })
  const { isLoading, useFallback, retryKey, error: videoError } = state
  const effectiveSrc = useFallback ? fallbackSrc : hlsSrc

  useEffect(() => {
    dispatch({ type: 'reset', isVideo: isVideoFile(file.filename) })
  }, [file.path, file.filename])

  const triggerFallback = useCallback(() => {
    dispatch({ type: 'fallback' })
  }, [])

  const onReady = useCallback(() => {
    dispatch({ type: 'ready' })
  }, [])

  const onError = useCallback(
    (error: string) => {
      dispatch({ type: 'ready' })
      if (!useFallback) {
        triggerFallback()
        return
      }
      dispatch({
        type: 'error',
        message: error || 'Browser cannot decode this file. Try Open in native player.'
      })
    },
    [useFallback, triggerFallback]
  )

  const displaySrc = retryKey
    ? `${effectiveSrc}${effectiveSrc.includes('?') ? '&' : '?'}retry=${retryKey}`
    : effectiveSrc
  const hlsDisplaySrc = useFallback
    ? ''
    : retryKey
      ? `${hlsSrc}${hlsSrc.includes('?') ? '&' : '?'}retry=${retryKey}`
      : hlsSrc

  const hls = useHlsPlayer({
    src: isVideoFile(file.filename) ? hlsDisplaySrc : '',
    videoRef: (videoRef ?? { current: null }) as React.RefObject<HTMLVideoElement>,
    autoplay: true,
    onReady,
    onError
  })

  useEffect(() => {
    if (!isVideoFile(file.filename) || !isLoading) return
    const t = window.setTimeout(() => {
      dispatch({
        type: 'error',
        message:
          'Loading timeout — 429 Too many live transcodes or file is very large. Try Retry or Open. Stalled — Browser cannot decode this file.'
      })
    }, LOADING_TIMEOUT_MS)
    return () => window.clearTimeout(t)
  }, [file.filename, isLoading, retryKey, useFallback])

  useEffect(() => {
    return () => {
      hls.destroy()
    }
  }, [file.path])

  return isVideoFile(file.filename) ? (
    <div
      className='relative max-w-full'
      style={{ maxHeight }}>
      {isLoading && !videoError && (
        <div className='absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 rounded text-white text-xs p-4 z-10'>
          <div className='w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin' />
          <span>Loading video…</span>
          <span className='text-[10px] text-white/60 text-center max-w-[280px]'>
            HLS live transcode — adaptive streaming with smooth seeking.
          </span>
          <button
            type='button'
            onClick={triggerFallback}
            className='text-xs px-2 py-1 rounded border border-white/20 hover:bg-white/10'>
            Fallback to original
          </button>
        </div>
      )}
      {videoError ? (
        <div
          className='flex flex-col items-center justify-center gap-3 bg-gray-900 text-white rounded p-6 text-center'
          style={{ minHeight: 200, maxHeight }}>
          <p className='text-sm font-medium'>Video failed to load</p>
          <p className='text-xs text-white/70 max-w-[320px]'>{videoError}</p>
          <p className='text-[11px] text-white/50'>
            Codec: h264 High usually works; HEVC/h265 fails in Firefox/Chrome without hardware. 4 GB
            files may exceed browser memory.
          </p>
          <div className='flex gap-2'>
            <a
              href={fallbackSrc}
              target='_blank'
              rel='noreferrer'
              className='text-xs px-3 py-1.5 rounded bg-white text-gray-900 hover:bg-gray-100'>
              Open / Download
            </a>
            <button
              type='button'
              onClick={() => {
                const resetFallback = videoError.includes('429') || videoError.includes('Too many')
                dispatch({ type: 'retry', resetFallback })
              }}
              className='text-xs px-3 py-1.5 rounded border border-white/20 hover:bg-white/10'>
              Retry
            </button>
            {!useFallback && (
              <button
                type='button'
                onClick={triggerFallback}
                className='text-xs px-3 py-1.5 rounded border border-white/20 hover:bg-white/10'>
                Fallback to original
              </button>
            )}
          </div>
        </div>
      ) : useFallback ? (
        <video
          key={`${file.path}-${retryKey}-fallback`}
          ref={videoRef}
          controls
          autoPlay
          muted
          playsInline
          preload='metadata'
          className='max-w-full rounded bg-black'
          style={{ maxHeight }}
          src={displaySrc}
          onLoadedData={() => dispatch({ type: 'ready' })}
          onLoadedMetadata={(e) => {
            dispatch({ type: 'ready' })
            const v = e.currentTarget
            const p = v.play()
            if (p && typeof p.catch === 'function') p.catch(() => {})
          }}
          onDurationChange={() => dispatch({ type: 'ready' })}
          onCanPlay={() => dispatch({ type: 'ready' })}
          onError={() => {
            dispatch({
              type: 'error',
              message:
                'Browser cannot decode this file. Try Open in native player or re-encode with faststart.'
            })
          }}
          onStalled={() => {
            dispatch({
              type: 'error',
              message: 'Stalled — Range request failed or file moved. Retry or Open.'
            })
          }}
        />
      ) : (
        <video
          key={`${file.path}-${retryKey}`}
          ref={videoRef}
          controls
          autoPlay
          muted
          playsInline
          preload='metadata'
          className='max-w-full rounded bg-black'
          style={{ maxHeight }}
          onLoadedData={() => dispatch({ type: 'ready' })}
          onLoadedMetadata={(e) => {
            dispatch({ type: 'ready' })
            const v = e.currentTarget
            const p = v.play()
            if (p && typeof p.catch === 'function') p.catch(() => {})
          }}
          onDurationChange={() => dispatch({ type: 'ready' })}
          onCanPlay={() => dispatch({ type: 'ready' })}
          onError={() => {
            dispatch({ type: 'ready' })
            triggerFallback()
          }}
          onStalled={() => {
            triggerFallback()
          }}
        />
      )}
    </div>
  ) : (
    <img
      key={file.path}
      src={`/api/file?path=${encodeURIComponent(file.path)}`}
      alt={file.filename}
      className='max-w-full rounded object-contain'
      style={{ maxHeight }}
    />
  )
}

export { MediaPreview }
