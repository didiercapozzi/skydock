import {
  asEmailHtml,
  DEFAULT_TEMPLATE,
  EMAIL_VARIABLES,
  fillEmailTemplate,
  htmlOfText,
  markVariables,
  variablesOf,
  gmailComposeUrl,
  mailtoUrl,
  renderPassengerEmail
} from '@skydock/scripts'
import { useState } from 'react'
import { cleanEmailHtml } from '../helpers/emailHtml'
import { setMailApp, useMailApp } from '../hooks/useMailApp'
import type { MailApp } from '../hooks/useMailApp'
import type { EmailFacts } from '@skydock/scripts'
import { setEmailTemplate, useEmailTemplate } from '../hooks/useEmailTemplate'
import { setSignature, useSignature } from '../hooks/useSignature'
import { Go, Mini } from './buttons'
import { Field, INPUT, Modal, Spacer } from './modal'

/* The passenger's link, ready to go. The email is written and laid out already, and shown exactly as
   it will arrive; one press copies it and opens a new Gmail message with the address and subject
   filled in, so all that is left is to paste it in and press Send. Nothing to connect, nothing to
   set up. Every word stays editable: the message and the signature are written in the email itself,
   as it will arrive, with bold, italic, lists and links. The heading, the button and the link are the
   point of it and stay as they are. */

/* What the toolbar does to what is picked in the email: the browser's own editing, which every
   browser and this app's own window still carry. */
const STYLES = [
  ['bold', 'Bold', 'B'],
  ['italic', 'Italic', 'I'],
  ['insertUnorderedList', 'List', '•'],
  ['removeFormat', 'Plain text', 'T̸']
] as const

/* the part of the email being written in, when the caret is in one */
const editing = () => {
  const at = window.getSelection()?.anchorNode
  const element = at instanceof Element ? at : at?.parentElement
  return element?.closest('[data-edit]') ?? null
}

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

/* What the email is about — a montage on this machine, or one the storage's list alone knows — and
   everything the template's variables are filled from. */
type EmailSubject = EmailFacts & { shareUrl: string }

const sentLabel = (at: number) => new Date(at * 1000).toLocaleDateString('de-CH')

const EmailDialog = ({
  about,
  emailed,
  canRecord,
  onRecord,
  onClose
}: {
  about: EmailSubject
  /* whether the storage's list says it was sent, and to whom */
  emailed?: { at: number; to?: string } | null
  /* whether it can be said on the list at all — only once the montage is on it */
  canRecord: boolean
  onRecord: (sent: boolean, to: string) => void
  onClose: () => void
}) => {
  const { firstname, shareUrl } = about
  /* The club's email, written once with its {variables}, and this one drafted from it. It is kept on
     this machine, and cleaned again as it is read, like anything written in the email. */
  const stored = useEmailTemplate()
  const template = { subject: stored.subject, body: cleanEmailHtml(asEmailHtml(stored.body)) }
  const drafted = fillEmailTemplate(template, about)
  const values = variablesOf(about)
  const [to, setTo] = useState(emailed?.to ?? '')
  const [subject, setSubject] = useState(drafted.subject)
  const [body, setBody] = useState(drafted.body)
  /* the signature is the club's, the same on every email, so it is remembered */
  const signature = cleanEmailHtml(asEmailHtml(useSignature()))
  const { fragment, text } = renderPassengerEmail({ subject, body, signature, shareUrl })
  /* This email, or the template every email is drafted from. */
  const [writingTemplate, setWritingTemplate] = useState(false)
  /* What the email shown is laid out from. What is written in it is read from it as it is typed and
     never laid back over it — that would move the caret — so it is laid again only when the heading
     changes or the template is opened or closed, from what has been written so far. */
  const [laid, setLaid] = useState({ body, signature })
  const shown = renderPassengerEmail({
    subject: writingTemplate ? template.subject : subject,
    body: laid.body,
    signature: laid.signature,
    shareUrl,
    editable: true
  }).fragment
  const retitle = (next: string) => {
    if (writingTemplate) {
      setEmailTemplate({ ...template, subject: next })
      setLaid({ body: markVariables(template.body), signature })
    } else {
      setSubject(next)
      setLaid({ body, signature })
    }
  }
  /* The template opened: its {variables} shown as such. Closed again: this email drafted afresh from
     it, since that is what changing the template was for. */
  const openTemplate = () => {
    setWritingTemplate(true)
    setLaid({ body: markVariables(template.body), signature })
  }
  const closeTemplate = () => {
    const filled = fillEmailTemplate(template, about)
    setWritingTemplate(false)
    setSubject(filled.subject)
    setBody(filled.body)
    setLaid({ body: filled.body, signature })
  }
  const resetTemplate = () => {
    setEmailTemplate(DEFAULT_TEMPLATE)
    setLaid({ body: markVariables(DEFAULT_TEMPLATE.body), signature })
  }
  /* what was written, cleaned down to what an email carries, kept as it is typed */
  const written = (target: EventTarget) => {
    const part = target instanceof Element ? target.closest('[data-edit]') : null
    if (!part) return
    const cleaned = cleanEmailHtml(part.innerHTML)
    if (part.getAttribute('data-edit') === 'signature') setSignature(cleaned)
    else if (writingTemplate) setEmailTemplate({ ...template, body: cleaned })
    else setBody(cleaned)
  }
  /* A {variable} put where the caret was. Choosing it from the list takes the caret out of the email,
     so where it was is kept as it moves in the email and put back to write it in. */
  const [caret, setCaret] = useState<Range | null>(null)
  const keepCaret = () => {
    const selection = window.getSelection()
    if (editing() && selection && selection.rangeCount > 0)
      setCaret(selection.getRangeAt(0).cloneRange())
  }
  const putVariable = (name: string) => {
    const selection = window.getSelection()
    if (!caret || !selection) return
    const part = caret.startContainer.parentElement?.closest('[data-edit]')
    if (part instanceof HTMLElement) part.focus()
    selection.removeAllRanges()
    selection.addRange(caret)
    document.execCommand('insertText', false, `{${name}}`)
  }
  /* a link asked for: the words picked are kept, and the address is asked for beside the toolbar */
  const [linking, setLinking] = useState<{ range: Range; href: string } | null>(null)
  const style = (command: string) => {
    if (!editing()) return
    document.execCommand(command)
    if (command === 'removeFormat') document.execCommand('unlink')
  }
  const askLink = () => {
    const selection = window.getSelection()
    if (!editing() || !selection || selection.rangeCount === 0) return
    setLinking({ range: selection.getRangeAt(0).cloneRange(), href: 'https://' })
  }
  const putLink = () => {
    if (!linking) return
    const href = linking.href.trim()
    const selection = window.getSelection()
    setLinking(null)
    if (!/^(https?:\/\/.+|mailto:.+)/.test(href) || !selection) return
    selection.removeAllRanges()
    selection.addRange(linking.range)
    if (linking.range.collapsed)
      document.execCommand('insertHTML', false, cleanEmailHtml(`<a href="${href}">${href}</a>`))
    else document.execCommand('createLink', false, href)
  }

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
      label='Email the link'
      title={`Email ${firstname} their link`}
      wide
      onClose={onClose}
      footer={
        writingTemplate ? (
          <>
            <span className='text-[12px] text-ink-2'>Kept as it is written, for every email.</span>
            <Spacer />
            <Go onClick={closeTemplate}>Done — back to this email</Go>
          </>
        ) : (
          <>
            {/* whether it went is only known once someone says so — sending happens in their mail */}
            {canRecord &&
              (emailed ? (
                <span className='flex items-center gap-2 text-[12px] font-semibold text-up'>
                  ✓ Sent {sentLabel(emailed.at)}
                  {emailed.to ? ` to ${emailed.to}` : ''}
                  <Mini
                    title='It was not sent after all'
                    onClick={() => onRecord(false, to)}>
                    Undo
                  </Mini>
                </span>
              ) : (
                <Mini
                  title='Say on the storage’s list that they have their link'
                  onClick={() => onRecord(true, to)}>
                  Mark as sent
                </Mini>
              ))}
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
        )
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
          placeholder='name@example.com — or type it in Gmail'
          onChange={(e) => setTo(e.target.value)}
          className={INPUT}
        />
      </Field>
      {writingTemplate && (
        <p className='m-0 rounded-r-md border-l-[3px] border-accent bg-accent-soft px-3 py-[9px] text-[12px] text-ink-2'>
          <b className='text-ink'>The template for every email.</b> What is written here is kept on
          this machine and drafts every passenger’s email; each {'{variable}'} is filled from their
          montage. A line whose variables are all empty for a montage — no film, no photos — is left
          out of their email.
        </p>
      )}
      <Field label={writingTemplate ? 'Subject — for every email' : 'Subject'}>
        <input
          type='text'
          value={writingTemplate ? template.subject : subject}
          onChange={(e) => retitle(e.target.value)}
          className={INPUT}
        />
      </Field>
      <div className='flex flex-wrap items-center gap-2 text-[12px] text-ink-2'>
        <span>Write in the email itself — the signature stays for every email</span>
        {/* pressed without taking the caret out of the email, so what is picked stays picked */}
        <span
          role='toolbar'
          aria-label='Style'
          className='flex gap-1'>
          {STYLES.map(([command, name, mark]) => (
            <button
              key={command}
              type='button'
              aria-label={name}
              title={name}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => style(command)}
              className={`w-7 rounded-[5px] border border-line bg-pane py-[2px] text-[12px] text-ink hover:border-ink-3 ${command === 'bold' ? 'font-bold' : command === 'italic' ? 'italic' : ''}`}>
              {mark}
            </button>
          ))}
          <button
            type='button'
            aria-label='Link'
            title='Link'
            onMouseDown={(e) => e.preventDefault()}
            onClick={askLink}
            className='rounded-[5px] border border-line bg-pane px-2 py-[2px] text-[12px] text-ink hover:border-ink-3'>
            Link
          </button>
        </span>
        {linking && (
          <span className='flex items-center gap-1'>
            <input
              aria-label='Link address'
              value={linking.href}
              autoFocus
              onChange={(e) => setLinking({ ...linking, href: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') putLink()
                if (e.key === 'Escape') setLinking(null)
              }}
              className={`${INPUT} w-56 py-0.5 text-[12px]`}
            />
            <Mini onClick={putLink}>Add link</Mini>
          </span>
        )}
        {writingTemplate && (
          <select
            aria-label='Put in a variable'
            value=''
            onChange={(e) => e.target.value && putVariable(e.target.value)}
            className='rounded-[5px] border border-line bg-pane px-1.5 py-0.5 text-[12px] text-ink-2'>
            <option value=''>Put in a variable…</option>
            {EMAIL_VARIABLES.map((variable) => (
              <option
                key={variable.name}
                value={variable.name}>
                {`{${variable.name}} — ${variable.about}${values[variable.name] ? ` · here “${values[variable.name]}”` : ' · empty here'}`}
              </option>
            ))}
          </select>
        )}
        <Spacer />
        {writingTemplate ? (
          <Mini
            title='Put the template back as SkyDock first wrote it'
            onClick={resetTemplate}>
            Back to the first template
          </Mini>
        ) : (
          <Mini
            title='Change the email every passenger gets, with the words that change as variables'
            onClick={openTemplate}>
            Edit the template…
          </Mini>
        )}
        <Mini onClick={() => void copy('subject', copyText(subject))}>
          {copied === 'subject' ? '✓ copied' : 'Copy subject'}
        </Mini>
        <Mini
          title={shareUrl}
          onClick={() => void copy('link', copyText(shareUrl))}>
          {copied === 'link' ? '✓ copied' : 'Copy link'}
        </Mini>
      </div>
      {/* The email as it will arrive, written in where it can be. What is typed or pasted is read
          back cleaned; a paste brings its words and the few styles an email keeps, nothing else. */}
      <div
        aria-label='Email preview'
        onInput={(e) => {
          written(e.target)
          keepCaret()
        }}
        onKeyUp={keepCaret}
        onMouseUp={keepCaret}
        onPaste={(e) => {
          if (!editing()) return
          e.preventDefault()
          const pasted = e.clipboardData.getData('text/html')
          const plain = e.clipboardData.getData('text/plain')
          document.execCommand(
            'insertHTML',
            false,
            pasted ? cleanEmailHtml(pasted) : htmlOfText(plain.replace(/\n/g, '\n\n'))
          )
        }}
        dangerouslySetInnerHTML={{ __html: shown }}
        className='h-[460px] w-full flex-none overflow-y-auto rounded-lg border border-line bg-[#eef1f4] text-[#171c22]'
      />
    </Modal>
  )
}

export { EmailDialog }
export type { EmailSubject }
