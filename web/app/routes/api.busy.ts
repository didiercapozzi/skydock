import { workUnderWay } from '@skydock/scripts'

const SAID: Record<string, (label: string) => string> = {
  upload: (label) => `An upload is running (${label})`,
  process: () => 'Something is being processed',
  render: (label) => `${label}’s film is being rendered`,
  'camera-copy': (label) => `${label} is being copied`,
  import: (label) => `${label} is being copied in`,
  scan: () => 'A scan is running',
  free: (label) => `${label} is being freed`,
  'free-place': (label) => `${label} is being freed`,
  bring: () => 'A file is being brought back',
  'copy-back': () => 'Files are being copied back',
  bin: () => 'Files are being brought back from the bin',
  trash: () => 'Files are being put in the bin',
  template: (label) => `The template ${label} is being added`,
  'camera-delete': () => 'Files are being deleted off a camera'
}

const IF_STOPPED: Record<string, string> = {
  upload:
    'The files already sent stay on the storage and are passed over next time; the one being sent is sent again from its start.',
  process: 'The files already processed stay; the rest is left to process again.',
  render: 'The film is as it was before; it has to be rendered again from its start.',
  'camera-copy':
    'The files already copied stay; the rest is copied the next time the card is plugged in.'
}

const loader = () => {
  const work = workUnderWay()
  const said = [
    ...new Set(work.map(({ type, label }) => SAID[type]?.(label) ?? 'SkyDock is working'))
  ]
  const ifStopped = [...new Set(work.map(({ type }) => IF_STOPPED[type]))].filter(Boolean)
  return Response.json({ running: said.length > 0 ? said.join(' · ') : null, ifStopped })
}

export { loader }
