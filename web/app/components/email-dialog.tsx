import {
  asEmailHtml,
  DEFAULT_TEMPLATES,
  EMAIL_VARIABLES,
  fillEmailTemplate,
  htmlOfText,
  markVariables,
  variablesOf,
  gmailComposeUrl,
  mailtoUrl,
  renderPassengerEmail
} from '@skydock/scripts'
import { i18n } from '@lingui/core'
import { msg, t } from '@lingui/core/macro'
import { useRef, useState } from 'react'
import { cleanEmailHtml } from '../helpers/emailHtml'
import { setMailApp, useMailApp } from '../hooks/useMailApp'
import type { MailApp } from '../hooks/useMailApp'
import type { EmailFacts, EmailLanguage, EmailTemplate } from '@skydock/scripts'
import { readEmailTemplate, setEmailTemplate, useEmailTemplate } from '../hooks/useEmailTemplate'
import { setSignature, useSignature } from '../hooks/useSignature'
import { Go, Mini, Seg } from './buttons'
import { Field, INPUT, Modal, Spacer } from './modal'
import { ShareQr } from './share-qr'

/* The passenger's link, ready to go. The email is written and laid out already, and shown exactly as
   it will arrive; one press copies it and opens a new Gmail message with the address and subject
   filled in, so all that is left is to paste it in and press Send. Nothing to connect, nothing to
   set up. Every word stays editable: the message and the signature are written in the email itself,
   as it will arrive, with bold, italic, lists and links. The heading, the button and the link are the
   point of it and stay as they are. */

/* What the toolbar does to what is picked in the email: the browser's own editing, which every
   browser and this app's own window still carry. */
const STYLES = [
  ['bold', msg`Bold`, 'B'],
  ['italic', msg`Italic`, 'I'],
  ['insertUnorderedList', msg`List`, '•'],
  ['removeFormat', msg`Plain text`, 'T̸']
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
  /* in the language of whoever it is for: French, as the club writes, until another is picked —
     the language this screen is in says nothing of theirs */
  const [lang, setLang] = useState<EmailLanguage>('fr')
  const [showingQr, setShowingQr] = useState(false)
  const stored = useEmailTemplate(lang)
  const readable = (raw: EmailTemplate) => ({
    subject: raw.subject,
    body: cleanEmailHtml(asEmailHtml(raw.body))
  })
  const template = readable(stored)
  const drafted = fillEmailTemplate(template, about, lang)
  const values = variablesOf(about, lang)
  const [to, setTo] = useState(emailed?.to ?? '')
  const [subject, setSubject] = useState(drafted.subject)
  const [body, setBody] = useState(drafted.body)
  /* the signature is the club's, the same on every email, so it is remembered */
  const signature = cleanEmailHtml(asEmailHtml(useSignature()))
  const { fragment, text } = renderPassengerEmail({ subject, body, signature, shareUrl, lang })
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
    editable: true,
    lang
  }).fragment
  const retitle = (next: string) => {
    if (writingTemplate) {
      setEmailTemplate(lang, { ...template, subject: next })
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
    const filled = fillEmailTemplate(template, about, lang)
    setWritingTemplate(false)
    setSubject(filled.subject)
    setBody(filled.body)
    setLaid({ body: filled.body, signature })
  }
  const resetTemplate = () => {
    setEmailTemplate(lang, DEFAULT_TEMPLATES[lang])
    setLaid({ body: markVariables(DEFAULT_TEMPLATES[lang].body), signature })
  }
  /* another language: this email drafted again from that language's template */
  const speak = (next: EmailLanguage) => {
    const other = readable(readEmailTemplate(next))
    setLang(next)
    if (writingTemplate) {
      setLaid({ body: markVariables(other.body), signature })
      return
    }
    const filled = fillEmailTemplate(other, about, next)
    setSubject(filled.subject)
    setBody(filled.body)
    setLaid({ body: filled.body, signature })
  }
  /* what was written, cleaned down to what an email carries, kept as it is typed */
  const written = (target: EventTarget) => {
    const part = target instanceof Element ? target.closest('[data-edit]') : null
    if (!part) return
    const cleaned = cleanEmailHtml(part.innerHTML)
    if (part.getAttribute('data-edit') === 'signature') setSignature(cleaned)
    else if (writingTemplate) setEmailTemplate(lang, { ...template, body: cleaned })
    else setBody(cleaned)
  }
  /* A {variable} put where the caret was. Choosing it from the list takes the caret out of the email,
     so where it was is kept as it moves in the email and put back to write it in. */
  /* kept aside, not drawn: the caret moves with every key, and the email need not be drawn again for it */
  const caret = useRef<Range | null>(null)
  const keepCaret = () => {
    const selection = window.getSelection()
    if (editing() && selection && selection.rangeCount > 0)
      caret.current = selection.getRangeAt(0).cloneRange()
  }
  const putVariable = (name: string) => {
    const selection = window.getSelection()
    const at = caret.current
    if (!at || !selection) return
    const part = at.startContainer.parentElement?.closest('[data-edit]')
    if (part instanceof HTMLElement) part.focus()
    selection.removeAllRanges()
    selection.addRange(at)
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
  /* once the mail is open, whether it went is asked for where it is recorded — or the montage stays
     "to email" long after the email went */
  const [opened, setOpened] = useState(false)
  const openMail = async (app: MailApp) => {
    setMailApp(app)
    setOpened(true)
    await copy(app, copyEmail(fragment, text))
    if (app === 'gmail') window.open(gmailComposeUrl({ to, subject }), '_blank', 'noopener')
    else window.location.href = mailtoUrl({ to, subject })
  }
  const other: MailApp = mailApp === 'gmail' ? 'mailto' : 'gmail'
  const label = (app: MailApp) =>
    copied === app
      ? t`✓ Copied — paste it into the message`
      : app === 'gmail'
        ? t`Copy & open Gmail`
        : t`Copy & open my mail app`
  /* when it was said to have gone, and to whom */
  const sentOn = emailed ? sentLabel(emailed.at) : ''
  const sentTo = emailed?.to

  return (
    <Modal
      label={t`Email the link`}
      title={t`Email ${firstname} their link`}
      wide
      onClose={onClose}
      footer={
        writingTemplate ? (
          <>
            <span className='text-[12px] text-ink-2'>{t`Kept as it is written, for every email.`}</span>
            <Spacer />
            <Go onClick={closeTemplate}>{t`Done — back to this email`}</Go>
          </>
        ) : (
          <>
            {/* whether it went is only known once someone says so — sending happens in their mail */}
            {canRecord &&
              (emailed ? (
                <span className='flex items-center gap-2 text-[12px] font-semibold text-up'>
                  ✓ {sentTo ? t`Sent ${sentOn} to ${sentTo}` : t`Sent ${sentOn}`}
                  <Mini
                    title={t`It was not sent after all`}
                    onClick={() => onRecord(false, to)}>
                    {t`Undo`}
                  </Mini>
                </span>
              ) : opened ? (
                <span
                  role='status'
                  className='flex items-center gap-2 rounded-md bg-accent-soft px-2 py-1 text-[12px] font-semibold text-accent'>
                  {t`Sent it?`}
                  <Mini
                    title={t`Say on the storage’s list that they have their link`}
                    onClick={() => onRecord(true, to)}>
                    {t`Yes — mark as sent`}
                  </Mini>
                </span>
              ) : (
                <Mini
                  title={t`Say on the storage’s list that they have their link`}
                  onClick={() => onRecord(true, to)}>
                  {t`Mark as sent`}
                </Mini>
              ))}
            <Spacer />
            <Mini onClick={onClose}>{t`Close`}</Mini>
            <Mini
              title={t`Laid out as shown, to paste into any mail`}
              onClick={() => void copy('email', copyEmail(fragment, text))}>
              {copied === 'email' ? t`✓ copied — paste it` : t`Copy email`}
            </Mini>
            {/* the one used last is the one offered first */}
            <Mini onClick={() => void openMail(other)}>{label(other)}</Mini>
            <Go
              title={t`Copies the email and opens a new message, addressed and titled — paste it in, then press Send`}
              onClick={() => void openMail(mailApp)}>
              {label(mailApp)}
            </Go>
          </>
        )
      }>
      <p className='m-0 rounded-r-md border-l-[3px] border-local bg-local-soft px-3 py-[9px] text-[12px] text-ink-2'>
        <b className='text-ink'>{t`Copy & open`}</b>{' '}
        {t`puts the email below on the clipboard and opens a new message with the address and the subject already filled in — in Gmail, or in the mail program this computer uses (Outlook, Apple Mail, Thunderbird…). Click into the message, paste it (Ctrl+V, or ⌘V on a Mac) and press Send. The one used last is offered first.`}
      </p>
      <span className='flex flex-wrap items-center gap-2 text-[12px] text-ink-2'>
        <Mini
          pressed={showingQr}
          title={t`The link as a QR code, for a phone to take it now`}
          onClick={() => setShowingQr(!showingQr)}>
          {t`QR code`}
        </Mini>
        {t`Written in`}
        <Seg
          label={t`Language of the email`}
          value={lang}
          options={[
            ['fr', 'Français'],
            ['en', 'English'],
            ['de', 'Deutsch']
          ]}
          onPick={speak}
        />
      </span>
      {showingQr && (
        <span className='flex flex-col items-center gap-1.5'>
          <ShareQr url={shareUrl} />
          <span className='text-[11.5px] text-ink-2'>{t`Scan it with a phone’s camera to open the link`}</span>
        </span>
      )}
      <Field label={t`To`}>
        <input
          type='email'
          value={to}
          autoFocus
          placeholder={t`name@example.com — or type it in Gmail`}
          onChange={(e) => setTo(e.target.value)}
          className={INPUT}
        />
      </Field>
      {writingTemplate && (
        <p className='m-0 rounded-r-md border-l-[3px] border-accent bg-accent-soft px-3 py-[9px] text-[12px] text-ink-2'>
          <b className='text-ink'>{t`The template for every email.`}</b>{' '}
          {t`What is written here is kept on this machine and drafts every email; each`}{' '}
          {'{variable}'}{' '}
          {t`is filled from their montage. A line whose variables are all empty for a montage — no film, no photos — is left out of their email.`}
        </p>
      )}
      <Field label={writingTemplate ? t`Subject — for every email` : t`Subject`}>
        <input
          type='text'
          value={writingTemplate ? template.subject : subject}
          onChange={(e) => retitle(e.target.value)}
          className={INPUT}
        />
      </Field>
      <div className='flex flex-wrap items-center gap-2 text-[12px] text-ink-2'>
        <span>{t`Write in the email itself — the signature stays for every email`}</span>
        {/* pressed without taking the caret out of the email, so what is picked stays picked */}
        <span
          role='toolbar'
          aria-label={t`Style`}
          className='flex gap-1'>
          {STYLES.map(([command, name, mark]) => (
            <button
              key={command}
              type='button'
              aria-label={i18n._(name)}
              title={i18n._(name)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => style(command)}
              className={`w-7 rounded-[5px] border border-line bg-pane py-[2px] text-[12px] text-ink hover:border-ink-3 ${command === 'bold' ? 'font-bold' : command === 'italic' ? 'italic' : ''}`}>
              {mark}
            </button>
          ))}
          <button
            type='button'
            aria-label={t`Link`}
            title={t`Link`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={askLink}
            className='rounded-[5px] border border-line bg-pane px-2 py-[2px] text-[12px] text-ink hover:border-ink-3'>
            {t`Link`}
          </button>
        </span>
        {linking && (
          <span className='flex items-center gap-1'>
            <input
              aria-label={t`Link address`}
              value={linking.href}
              autoFocus
              onChange={(e) => setLinking({ ...linking, href: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') putLink()
                if (e.key !== 'Escape') return
                /* it puts the link away, not the whole email */
                e.stopPropagation()
                setLinking(null)
              }}
              className={`${INPUT} w-56 py-0.5 text-[12px]`}
            />
            <Mini onClick={putLink}>{t`Add link`}</Mini>
          </span>
        )}
        {writingTemplate && (
          <select
            aria-label={t`Put in a variable`}
            value=''
            onChange={(e) => e.target.value && putVariable(e.target.value)}
            className='rounded-[5px] border border-line bg-pane px-1.5 py-0.5 text-[12px] text-ink-2'>
            <option value=''>{t`Put in a variable…`}</option>
            {EMAIL_VARIABLES.map((variable) => {
              const here = values[variable.name]
              return (
                <option
                  key={variable.name}
                  value={variable.name}>
                  {`{${variable.name}} — ${variable.about}${here ? t` · here “${here}”` : t` · empty here`}`}
                </option>
              )
            })}
          </select>
        )}
        <Spacer />
        {writingTemplate ? (
          <Mini
            title={t`Put the template back as SkyDock first wrote it`}
            onClick={resetTemplate}>
            {t`Back to the first template`}
          </Mini>
        ) : (
          <Mini
            title={t`Change the email every montage sends, with the words that change as variables`}
            onClick={openTemplate}>
            {t`Edit the template…`}
          </Mini>
        )}
        <Mini onClick={() => void copy('subject', copyText(subject))}>
          {copied === 'subject' ? t`✓ copied` : t`Copy subject`}
        </Mini>
        <Mini
          title={shareUrl}
          onClick={() => void copy('link', copyText(shareUrl))}>
          {copied === 'link' ? t`✓ copied` : t`Copy link`}
        </Mini>
      </div>
      {/* The email as it will arrive, written in where it can be. What is typed or pasted is read
          back cleaned; a paste brings its words and the few styles an email keeps, nothing else. */}
      <div
        aria-label={t`Email preview`}
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
