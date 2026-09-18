import {
  defaultPassengerEmail,
  gmailComposeUrl,
  mailtoUrl,
  renderPassengerEmail
} from '@skydock/scripts'
import { useState } from 'react'
import { setMailApp, useMailApp } from '../hooks/useMailApp'
import type { MailApp } from '../hooks/useMailApp'
import { setSignature, useSignature } from '../hooks/useSignature'
import { Go, Mini } from './buttons'
import { Field, INPUT, Modal, Spacer } from './modal'
import type { ManifestGroup } from './types'
import { isVideoFile } from './utils'

/* The passenger's link, ready to go. The email is written and laid out already, and shown exactly as
   it will arrive; one press copies it and opens a new Gmail message with the address and subject
   filled in, so all that is left is to paste it in and press Send. Nothing to connect, nothing to
   set up. Every word stays editable. */

/* On the clipboard as a laid-out email and as plain text both: pasted into Gmail — or any other mail
   program — it keeps the layout and the button, and one that takes only text still gets every word
   and the link. */
const copyEmail = async (html: string, text: string) => {
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' })
      })
    ])
    return true
  } catch {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return false
    }
  }
}

const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

const EmailDialog = ({
  group,
  shareUrl,
  onClose
}: {
  group: ManifestGroup
  shareUrl: string
  onClose: () => void
}) => {
  const firstname = group.passenger?.firstname ?? ''
  const drafted = defaultPassengerEmail({
    firstname,
    day: group.day,
    hasFilm: group.files.some((f) => isVideoFile(f.path)),
    photos: group.files.filter((f) => !isVideoFile(f.path)).length
  })
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState(drafted.subject)
  const [body, setBody] = useState(drafted.body)
  /* the signature is the club's, the same on every email, so it is remembered */
  const signature = useSignature()
  const { html, fragment, text } = renderPassengerEmail({ subject, body, signature, shareUrl })

  /* which of the copy buttons last worked, said on the button itself for a moment */
  const [copied, setCopied] = useState<string | null>(null)
  const copy = async (what: string, done: Promise<boolean>) => {
    if (!(await done)) return
    setCopied(what)
    setTimeout(() => setCopied((c) => (c === what ? null : c)), 2500)
  }

  /* Copied first, then the mail opened. The other way round, the new window takes the focus before
     the copy lands, and a browser refuses to write to the clipboard for a page that is not in front —
     so the mail opened with nothing to paste. The copy takes a moment, well inside the time the click
     still counts, so Gmail is not taken for a pop-up. The computer's own mail program is reached by
     a mailto link, which opens it without leaving this page. */
  const mailApp = useMailApp()
  const openMail = async (app: MailApp) => {
    setMailApp(app)
    await copy(app, copyEmail(fragment, text))
    if (app === 'gmail') window.open(gmailComposeUrl({ to, subject }), '_blank', 'noopener')
    else window.location.href = mailtoUrl({ to, subject })
  }
  const other: MailApp = mailApp === 'gmail' ? 'mailto' : 'gmail'
  const label = (app: MailApp) =>
    copied === app
      ? '✓ Copied — paste it into the message'
      : app === 'gmail'
        ? 'Copy & open Gmail'
        : 'Copy & open my mail app'

  return (
    <Modal
      label='Email the passenger'
      title={`Email ${firstname} their link`}
      wide
      onClose={onClose}
      footer={
        <>
          <Spacer />
          <Mini onClick={onClose}>Close</Mini>
          <Mini
            title='Laid out as shown, to paste into any mail'
            onClick={() => void copy('email', copyEmail(fragment, text))}>
            {copied === 'email' ? '✓ copied — paste it' : 'Copy email'}
          </Mini>
          {/* the one used last is the one offered first */}
          <Mini onClick={() => void openMail(other)}>{label(other)}</Mini>
          <Go
            title='Copies the email and opens a new message, addressed and titled — paste it in, then press Send'
            onClick={() => void openMail(mailApp)}>
            {label(mailApp)}
          </Go>
        </>
      }>
      <p className='m-0 rounded-r-md border-l-[3px] border-local bg-local-soft px-3 py-[9px] text-[12px] text-ink-2'>
        <b className='text-ink'>Copy & open</b> puts the email below on the clipboard and opens a
        new message with the address and the subject already filled in — in Gmail, or in the mail
        program this computer uses (Outlook, Apple Mail, Thunderbird…). Click into the message,
        paste it (Ctrl+V, or ⌘V on a Mac) and press Send. The one used last is offered first.
      </p>
      <Field label='To'>
        <input
          type='email'
          value={to}
          autoFocus
          placeholder='passenger@example.com — or type it in Gmail'
          onChange={(e) => setTo(e.target.value)}
          className={INPUT}
        />
      </Field>
      <Field label='Subject'>
        <input
          type='text'
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className={INPUT}
        />
      </Field>
      <Field label='Message'>
        <textarea
          value={body}
          rows={6}
          onChange={(e) => setBody(e.target.value)}
          className={`${INPUT} resize-y leading-[1.45]`}
        />
      </Field>
      <Field label='Signature — the same on every email'>
        <textarea
          value={signature}
          rows={2}
          onChange={(e) => setSignature(e.target.value)}
          className={`${INPUT} resize-y leading-[1.45]`}
        />
      </Field>
      <div className='flex items-center gap-2 text-[12px] text-ink-2'>
        <span>As it will arrive</span>
        <Spacer />
        <Mini onClick={() => void copy('subject', copyText(subject))}>
          {copied === 'subject' ? '✓ copied' : 'Copy subject'}
        </Mini>
        <Mini
          title={shareUrl}
          onClick={() => void copy('link', copyText(shareUrl))}>
          {copied === 'link' ? '✓ copied' : 'Copy link'}
        </Mini>
      </div>
      {/* sandboxed: the preview is only looked at, never run */}
      <iframe
        title='Email preview'
        sandbox=''
        srcDoc={html}
        className='h-[460px] w-full flex-none rounded-lg border border-line bg-[#eef1f4]'
      />
    </Modal>
  )
}

export { EmailDialog }
