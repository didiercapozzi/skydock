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

const loader = () => {
  const said = [
    ...new Set(workUnderWay().map(({ type, label }) => SAID[type]?.(label) ?? 'SkyDock is working'))
  ]
  return Response.json({ running: said.length > 0 ? said.join(' · ') : null })
}

export { loader }
