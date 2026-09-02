const FFMPEG_SHARED_FLAGS: string[] = ['-hide_banner', '-loglevel', 'error', '-hwaccel', 'auto']

const CRF = '28'
const KEYFRAME_INTERVAL = '60'
const AUDIO_BITRATE = '64k'

const FFMPEG_VIDEO_FLAGS: string[] = [
  '-c:v',
  'libx264',
  '-preset',
  'ultrafast',
  '-tune',
  'zerolatency',
  '-crf',
  CRF,
  '-g',
  KEYFRAME_INTERVAL,
  '-force_key_frames',
  'expr:gte(t,n_forced*2)',
  '-pix_fmt',
  'yuv420p'
]

const FFMPEG_AUDIO_FLAGS: string[] = ['-c:a', 'aac', '-b:a', AUDIO_BITRATE]

const buildBaseArgs = (resolved: string, seek: number): string[] => {
  const ssArgs: string[] = []
  if (Number.isFinite(seek) && seek > 0) ssArgs.push('-ss', String(seek))

  return [...FFMPEG_SHARED_FLAGS, ...ssArgs, '-i', resolved]
}

export { FFMPEG_AUDIO_FLAGS, FFMPEG_SHARED_FLAGS, FFMPEG_VIDEO_FLAGS, buildBaseArgs }
