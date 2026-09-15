import { useState } from 'react'

type UseCompareReturn = {
  compareIds: string[]
  showComparison: boolean
  handleCompareToggle: (groupId: string) => void
  setCompareIds: (ids: string[]) => void
  setShowComparison: (show: boolean) => void
}

const useCompare = () => {
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [showComparison, setShowComparison] = useState(false)

  const handleCompareToggle = (groupId: string) => {
    setCompareIds((prev) => {
      if (prev.includes(groupId)) return prev.filter((id) => id !== groupId)
      if (prev.length >= 2) return prev
      return [...prev, groupId]
    })
  }

  return { compareIds, showComparison, handleCompareToggle, setCompareIds, setShowComparison }
}

export { useCompare }
export type { UseCompareReturn }
