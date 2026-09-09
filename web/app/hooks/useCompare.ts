import { useState } from 'react'

type UseCompareReturn = {
  compareIds: string[]
  showComparison: boolean
  handleCompareToggle: (jumpId: string) => void
  setCompareIds: (ids: string[]) => void
  setShowComparison: (show: boolean) => void
}

const useCompare = () => {
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [showComparison, setShowComparison] = useState(false)

  const handleCompareToggle = (jumpId: string) => {
    setCompareIds((prev) => {
      if (prev.includes(jumpId)) return prev.filter((id) => id !== jumpId)
      if (prev.length >= 2) return prev
      return [...prev, jumpId]
    })
  }

  return { compareIds, showComparison, handleCompareToggle, setCompareIds, setShowComparison }
}

export { useCompare }
export type { UseCompareReturn }
