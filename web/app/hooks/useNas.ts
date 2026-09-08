/* eslint-disable react/set-state-in-effect, react-hooks/exhaustive-deps -- useNas syncs server fetcher data into local state, justified effects */
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { manifestJumpSchema } from '@skydock/scripts'
import type { ManifestJump } from '../components/types'
import { useSafeFetcher } from '../helpers/routing'

const jumpsResponseSchema = z.object({ jumps: z.array(manifestJumpSchema) })
const nasStatusSchema = z.object({ connected: z.boolean() })
const errorResponseSchema = z.object({ success: z.literal(false) })

type UseNasReturn = {
  nasConnected: boolean
  showConnectionDialog: boolean
  nasError: string | null
  processingId: string | null
  uploadingId: string | null
  handleConnect: (host: string, user: string, password: string) => void
  handleDisconnect: () => void
  handleMerge: (leftId: string, rightId: string, anchorEpoch: number) => void
  handleProcess: (jumpId: string) => void
  handleUpload: (jumpId: string) => void
  setShowConnectionDialog: (show: boolean) => void
  setNasError: (err: string | null) => void
}

const useNas = (
  setJumps: (next: ManifestJump[]) => void,
  setCompareIds: (ids: string[]) => void,
  setShowComparison: (show: boolean) => void
): UseNasReturn => {
  const [nasConnected, setNasConnected] = useState(false)
  const [showConnectionDialog, setShowConnectionDialog] = useState(false)
  const [nasError, setNasError] = useState<string | null>(null)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const { submit, data } = useSafeFetcher()
  const nasSubmit = useSafeFetcher()
  const pendingRef = useRef<{ kind: 'merge' | 'process' | 'upload' | 'nas' } | null>(null)

  const handleMerge = (leftId: string, rightId: string, anchorEpoch: number) => {
    pendingRef.current = { kind: 'merge' }
    submit({
      url: '/api/manifest',
      actionArgs: { intent: 'merge-jumps', leftId, rightId, anchorEpoch }
    })
  }

  const handleProcess = (jumpId: string) => {
    pendingRef.current = { kind: 'process' }
    setProcessingId(jumpId)
    submit({ url: '/api/manifest', actionArgs: { intent: 'process-jump', jumpId } })
  }

  const handleUpload = (jumpId: string) => {
    if (!nasConnected) {
      setShowConnectionDialog(true)
      return
    }
    pendingRef.current = { kind: 'upload' }
    setUploadingId(jumpId)
    submit({ url: '/api/manifest', actionArgs: { intent: 'upload-jump', jumpId } })
  }

  const handleConnect = (host: string, user: string, password: string) => {
    setNasError(null)
    pendingRef.current = { kind: 'nas' }
    nasSubmit.submit({ url: '/api/nas', actionArgs: { intent: 'connect', host, user, password } })
  }

  const handleDisconnect = () => {
    pendingRef.current = { kind: 'nas' }
    nasSubmit.submit({ url: '/api/nas', actionArgs: { intent: 'disconnect' } })
  }

  useEffect(() => {
    if (!pendingRef.current) return
    const parsedJumps = jumpsResponseSchema.safeParse(data)
    if (parsedJumps.success) {
      const kind = pendingRef.current.kind
      pendingRef.current = null
      // eslint-disable-next-line react/set-state-in-effect -- syncing server response into state
      setJumps(parsedJumps.data.jumps)
      setProcessingId(null)
      setUploadingId(null)
      if (kind === 'merge') {
        setShowComparison(false)
        setCompareIds([])
      }
      return
    }
    const parsedError = errorResponseSchema.safeParse(data)
    if (parsedError.success) {
      pendingRef.current = null
      setProcessingId(null)
      setUploadingId(null)
    }
  }, [data, setCompareIds, setJumps, setShowComparison])

  useEffect(() => {
    const parsed = nasStatusSchema.safeParse(nasSubmit.data)
    if (!parsed.success) return
    pendingRef.current = null
    const connected = parsed.data.connected
    // eslint-disable-next-line react/set-state-in-effect -- syncing server response into state
    setNasConnected(connected)
    if (connected) {
      setShowConnectionDialog(false)
      setNasError(null)
    } else {
      setNasError('Connection failed. Please check your credentials.')
    }
  }, [nasSubmit.data])

  // eslint-disable-next-line react-hooks/exhaustive-deps -- submit once on mount
  useEffect(() => {
    nasSubmit.submit({ url: '/api/nas', actionArgs: { intent: 'status' } })
  }, [])

  return {
    nasConnected,
    showConnectionDialog,
    nasError,
    processingId,
    uploadingId,
    handleConnect,
    handleDisconnect,
    handleMerge,
    handleProcess,
    handleUpload,
    setShowConnectionDialog,
    setNasError
  }
}

export { useNas }
export type { UseNasReturn }
