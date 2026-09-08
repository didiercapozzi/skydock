import { useState } from 'react'
import type { ManifestJump } from '../components/types'
import {
  buildGmailUrl,
  buildMailtoUrl,
  DEFAULT_EMAIL_BODY,
  DEFAULT_EMAIL_SUBJECT,
  getJumpDate,
  renderEmailTemplate
} from '../components/utils'

type EmailTemplates = { subject: string; body: string } | null

type UseEmailReturn = {
  emailTemplates: EmailTemplates
  mailPendingId: string | null
  getMailUrls: (jump: ManifestJump) => { gmailUrl: string; mailtoUrl: string } | null
  handleMail: (
    jumpId: string,
    jumps: ManifestJump[],
    getMailUrlsFn: (jump: ManifestJump) => { gmailUrl: string; mailtoUrl: string } | null
  ) => void
  handleMarkSent: (
    jumpId: string,
    jumps: ManifestJump[],
    setJumps: (next: ManifestJump[]) => void,
    saveJumps: (next: ManifestJump[]) => void
  ) => void
  handleCancelMail: () => void
  setMailPendingId: (id: string | null) => void
}

const useEmail = (initialTemplates: EmailTemplates): UseEmailReturn => {
  const [emailTemplates] = useState<EmailTemplates>(initialTemplates)
  const [mailPendingId, setMailPendingId] = useState<string | null>(null)

  const getMailUrls = (jump: ManifestJump) => {
    const shareUrl = jump.publish?.shareUrl
    if (!shareUrl) return null
    const vars = {
      firstname: jump.passenger?.firstname ?? '',
      lastname: jump.passenger?.lastname ?? '',
      jumpDate: getJumpDate(jump),
      shareUrl,
      fileCount: String(jump.files.length)
    }
    const subject = renderEmailTemplate(emailTemplates?.subject ?? DEFAULT_EMAIL_SUBJECT, vars)
    const body = renderEmailTemplate(emailTemplates?.body ?? DEFAULT_EMAIL_BODY, vars)
    const to = jump.passenger?.email ?? ''
    return {
      gmailUrl: buildGmailUrl(to, subject, body),
      mailtoUrl: buildMailtoUrl(to, subject, body)
    }
  }

  const handleMail = (
    jumpId: string,
    jumps: ManifestJump[],
    getMailUrlsFn: (jump: ManifestJump) => { gmailUrl: string; mailtoUrl: string } | null
  ) => {
    const jump = jumps.find((j) => j.id === jumpId)
    const urls = jump ? getMailUrlsFn(jump) : null
    if (!urls) return
    window.open(urls.gmailUrl, '_blank', 'noopener')
    setMailPendingId(jumpId)
  }

  const handleMarkSent = (
    jumpId: string,
    jumps: ManifestJump[],
    setJumps: (next: ManifestJump[]) => void,
    saveJumps: (next: ManifestJump[]) => void
  ) => {
    const emailedAt = new Date().toISOString()
    const next = jumps.map((j) => {
      if (j.id !== jumpId || !j.publish?.shareUrl) return j
      return { ...j, publish: { shareUrl: j.publish.shareUrl, emailedAt } }
    })
    setJumps(next)
    saveJumps(next)
    setMailPendingId(null)
  }

  const handleCancelMail = () => {
    setMailPendingId(null)
  }

  return {
    emailTemplates,
    mailPendingId,
    getMailUrls,
    handleMail,
    handleMarkSent,
    handleCancelMail,
    setMailPendingId
  }
}

export { useEmail }
export type { EmailTemplates, UseEmailReturn }
