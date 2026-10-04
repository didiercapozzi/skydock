import { fileStatus, lastSegment, outputKeyOf, uploadGate } from '@skydock/scripts'
import type { OutputFact, RemoteListing } from '@skydock/scripts'
import type { ManifestFile } from '../components/types'

const fileFacts = ({
  outputs,
  remote,
  frozenFiles
}: {
  outputs: Record<string, OutputFact>
  remote: RemoteListing | null
  frozenFiles: Set<string>
}) => {
  const statusContext = (file: ManifestFile) => ({
    crop: {
      cropStart: file.cropStart,
      cropEnd: file.cropEnd,
      frame: file.frame,
      rotation: file.rotation
    },
    output: outputs[outputKeyOf(file)],
    remote,
    inEdit: !!file.id && frozenFiles.has(file.id)
  })
  const statusOf = (file: ManifestFile) => fileStatus(file, statusContext(file))
  const gateFor = (files: ManifestFile[]) => uploadGate(files, statusContext)
  const deliveredName = (file: ManifestFile) =>
    file.processed && statusOf(file) !== 'local' ? lastSegment(file.processed.path) : null
  return { statusContext, statusOf, gateFor, deliveredName }
}

export { fileFacts }
