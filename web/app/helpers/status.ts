import { fileStatus, lastSegment, outputKeyOf, uploadGate } from '@skydock/scripts/client'
import type { OutputFact, RemoteListing } from '@skydock/scripts'
import type { ManifestFile } from '../components/types'

const fileFacts = ({
  outputs,
  remote
}: {
  outputs: Record<string, OutputFact>
  remote: RemoteListing | null
}) => {
  const statusContext = (file: ManifestFile) => ({
    crop: {
      cropStart: file.cropStart,
      cropEnd: file.cropEnd,
      frame: file.frame,
      rotation: file.rotation
    },
    output: outputs[outputKeyOf(file)],
    remote
  })
  const statusOf = (file: ManifestFile) => fileStatus(file, statusContext(file))
  const gateFor = (files: ManifestFile[]) => uploadGate(files, statusContext)
  const deliveredName = (file: ManifestFile) =>
    file.processed && statusOf(file) !== 'local' ? lastSegment(file.processed.path) : null
  return { statusContext, statusOf, gateFor, deliveredName }
}

export { fileFacts }
