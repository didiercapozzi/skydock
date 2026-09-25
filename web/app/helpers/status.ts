import { fileStatus, lastSegment, outputKeyOf, uploadGate } from '@skydock/scripts'
import type { OutputFact, RemoteListing } from '@skydock/scripts'
import type { ManifestFile } from '../components/types'

/* What is known about each file, from which its status is read (RULES, File status): everything
   decided about the picture — a copy made before any of it changed is out of date — what the disk
   says about the copy, what the storage holds, and whether its montage is frozen by an edit. */
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
  /* what a file is called on disk once a copy exists; null while there is none to name */
  const deliveredName = (file: ManifestFile) =>
    file.processed && statusOf(file) !== 'local' ? lastSegment(file.processed.path) : null
  return { statusContext, statusOf, gateFor, deliveredName }
}

export { fileFacts }
