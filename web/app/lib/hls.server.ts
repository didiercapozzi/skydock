import * as path from 'node:path'
import { FFMPEG_AUDIO_FLAGS, FFMPEG_VIDEO_FLAGS, buildBaseArgs } from './ffmpeg.server'

export const buildHlsArgs = (resolved: string, seek: number, hlsDir: string): string[] => [
  ...buildBaseArgs(resolved, seek),
  '-vf',
  'scale=360:-2',
  ...FFMPEG_VIDEO_FLAGS,
  ...FFMPEG_AUDIO_FLAGS,
  '-hls_time',
  '4',
  '-hls_list_size',
  '0',
  '-hls_segment_filename',
  path.join(hlsDir, 'seg%03d.ts'),
  '-f',
  'hls',
  path.join(hlsDir, 'playlist.m3u8')
]

export const rewritePlaylist = (playlist: string, baseUrl: string): string =>
  playlist.replace(/(seg\d+\.ts)/g, `${baseUrl}&segment=$1`)
