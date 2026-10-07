import {
  asEmailHtml,
  DEFAULT_TEMPLATES,
  EMAIL_VARIABLES,
  fillEmailTemplate,
  kickerOf,
  htmlOfText,
  markVariables,
  variablesOf,
  gmailComposeUrl,
  mailtoUrl,
  renderPassengerEmail
} from '@skydock/scripts'
import { i18n } from '@lingui/core'
import { msg, plural, t } from '@lingui/core/macro'
import { useRef, useState } from 'react'
import { cleanEmailHtml } from '../helpers/emailHtml'
import { setMailApp, useMailApp } from '../hooks/useMailApp'
import type { MailApp } from '../hooks/useMailApp'
import type { EmailFacts, EmailLanguage, EmailTemplate } from '@skydock/scripts'
import { readEmailTemplate, setEmailTemplate, useEmailTemplate } from '../hooks/useEmailTemplate'
import { setSignature, useSignature } from '../hooks/useSignature'
import { Go, Mini, Seg } from './buttons'
import { Icon } from './icons'
import { INPUT, Modal, Spacer } from './modal'
import { ShareQr } from './share-qr'

const STYLES = [
  ['bold', msg`Bold`, 'B'],
  ['italic', msg`Italic`, 'I'],
  ['insertUnorderedList', msg`List`, '•'],
  ['removeFormat', msg`Plain text`, 'T̸']
] as const

const isOneLine = (part: Element) =>
  ['subject', 'kicker'].includes(part.getAttribute('data-edit') ?? '')

const editing = () => {
  const at = window.getSelection()?.anchorNode
  const element = at instanceof Element ? at : at?.parentElement
  return element?.closest('[data-edit]') ?? null
}

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

type EmailSubject = EmailFacts & { shareUrl: string }

const EYEBROW = 'text-micro font-bold text-ink-3'
const FIELD =
  'h-9.5 min-w-0 flex-1 rounded-corner border-0 bg-well px-3 text-body text-ink placeholder:font-normal placeholder:text-ink-3'
const TOOL =
  'grid h-7 w-7 place-items-center rounded-corner text-body text-ink-2 hover:bg-well hover:text-ink'
const QUIET =
  'inline-flex h-7 items-center rounded-corner px-2.25 text-body font-medium text-ink-2 hover:bg-well hover:text-ink'

const sentLabel = (at: number) => new Date(at * 1000).toLocaleDateString('de-CH')

const EmailDialog = ({
  about,
  emailed,
  canRecord,
  onRecord,
  onClose
}: {
  about: EmailSubject
  emailed?: { at: number; to?: string } | null
  canRecord: boolean
  onRecord: (sent: boolean, to: string) => void
  onClose: () => void
}) => {
  const { firstname, shareUrl } = about
  const [lang, setLang] = useState<EmailLanguage>('fr')
  const [showingQr, setShowingQr] = useState(false)
  const stored = useEmailTemplate(lang)
  const readable = (raw: EmailTemplate): EmailTemplate => ({
    ...raw,
    body: cleanEmailHtml(asEmailHtml(raw.body))
  })
  const template = readable(stored)
  const drafted = fillEmailTemplate(template, about, lang)
  const values = variablesOf(about, lang)
  const [to, setTo] = useState(emailed?.to ?? '')
  const [subject, setSubject] = useState(drafted.subject)
  const [kicker, setKicker] = useState(drafted.kicker)
  const [body, setBody] = useState(drafted.body)
  const signature = cleanEmailHtml(asEmailHtml(useSignature()))
  const { fragment, text } = renderPassengerEmail({
    subject,
    kicker,
    body,
    signature,
    shareUrl,
    lang
  })
  const [writingTemplate, setWritingTemplate] = useState(false)
  const [laid, setLaid] = useState({ subject, kicker, body, signature })
  const shown = renderPassengerEmail({
    subject: laid.subject,
    kicker: laid.kicker,
    body: laid.body,
    signature: laid.signature,
    shareUrl,
    editable: true,
    lang
  }).fragment
  const retitle = (next: string) => {
    if (writingTemplate) {
      setEmailTemplate(lang, { ...template, subject: next })
      setLaid({
        subject: next,
        kicker: kickerOf(template, lang),
        body: markVariables(template.body),
        signature
      })
    } else {
      setSubject(next)
      setLaid({ subject: next, kicker, body, signature })
    }
  }
  const openTemplate = () => {
    setWritingTemplate(true)
    setLaid({
      subject: template.subject,
      kicker: kickerOf(template, lang),
      body: markVariables(template.body),
      signature
    })
  }
  const closeTemplate = () => {
    const filled = fillEmailTemplate(template, about, lang)
    setWritingTemplate(false)
    setSubject(filled.subject)
    setKicker(filled.kicker)
    setBody(filled.body)
    setLaid({ subject: filled.subject, kicker: filled.kicker, body: filled.body, signature })
  }
  const resetTemplate = () => {
    const first = DEFAULT_TEMPLATES[lang]
    setEmailTemplate(lang, first)
    setLaid({
      subject: first.subject,
      kicker: kickerOf(first, lang),
      body: markVariables(first.body),
      signature
    })
  }
  const speak = (next: EmailLanguage) => {
    const other = readable(readEmailTemplate(next))
    setLang(next)
    if (writingTemplate) {
      setLaid({
        subject: other.subject,
        kicker: kickerOf(other, next),
        body: markVariables(other.body),
        signature
      })
      return
    }
    const filled = fillEmailTemplate(other, about, next)
    setSubject(filled.subject)
    setKicker(filled.kicker)
    setBody(filled.body)
    setLaid({ subject: filled.subject, kicker: filled.kicker, body: filled.body, signature })
  }
  const written = (target: EventTarget) => {
    const part = target instanceof Element ? target.closest('[data-edit]') : null
    if (!part) return
    const which = part.getAttribute('data-edit')
    if (which === 'subject' || which === 'kicker') {
      const typed = (part.textContent ?? '').replace(/\s+/g, ' ')
      if (writingTemplate) setEmailTemplate(lang, { ...template, [which]: typed })
      else if (which === 'subject') setSubject(typed)
      else setKicker(typed)
      return
    }
    const cleaned = cleanEmailHtml(part.innerHTML)
    if (part.getAttribute('data-edit') === 'signature') setSignature(cleaned)
    else if (writingTemplate) setEmailTemplate(lang, { ...template, body: cleaned })
    else setBody(cleaned)
  }
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
  const [linking, setLinking] = useState<{ range: Range; href: string } | null>(null)
  const styleable = () => {
    const part = editing()
    return part !== null && !isOneLine(part)
  }
  const style = (command: string) => {
    if (!styleable()) return
    document.execCommand(command)
    if (command === 'removeFormat') document.execCommand('unlink')
  }
  const askLink = () => {
    const selection = window.getSelection()
    if (!styleable() || !selection || selection.rangeCount === 0) return
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

  const [copied, setCopied] = useState<string | null>(null)
  const copy = async (what: string, done: Promise<boolean>) => {
    if (!(await done)) return
    setCopied(what)
    setTimeout(() => setCopied((c) => (c === what ? null : c)), 2500)
  }

  const mailApp = useMailApp()
  const [opened, setOpened] = useState<MailApp | null>(null)
  const [asking, setAsking] = useState(false)
  const openMail = async (app: MailApp) => {
    setMailApp(app)
    setOpened(app)
    if (canRecord && !emailed) setAsking(true)
    await copy(app, copyEmail(fragment, text))
    if (app === 'gmail') window.open(gmailComposeUrl({ to, subject }), '_blank', 'noopener')
    else window.location.href = mailtoUrl({ to, subject })
  }
  const label = (app: MailApp) =>
    copied === app
      ? t`✓ Copied — paste it into the message`
      : app === 'gmail'
        ? t`Copy & open Gmail`
        : t`Copy & open my mail app`
  const sentOn = emailed ? sentLabel(emailed.at) : ''
  const sentTo = emailed?.to
  const holds = [
    about.videos ? t`film` : '',
    about.photos ? plural(about.photos, { one: '# photo', other: '# photos' }) : ''
  ]
    .filter(Boolean)
    .join(t` and `)

  return (
    <>
      <Modal
        label={t`Email the link`}
        title={t`Email the link`}
        sub={[`${firstname} ${about.lastname}`.trim(), about.day, holds]
          .filter(Boolean)
          .join(' · ')}
        aside={
          <Seg
            label={t`Language of the email`}
            value={lang}
            options={[
              ['fr', 'Français', 'FR'],
              ['en', 'English', 'EN'],
              ['de', 'Deutsch', 'DE']
            ]}
            onPick={speak}
          />
        }
        full
        onClose={onClose}
        footer={
          writingTemplate ? (
            <>
              <span className='text-micro text-ink-3'>{t`Kept as it is written, for every email.`}</span>
              <Spacer />
              <Go onClick={closeTemplate}>{t`Done — back to this email`}</Go>
            </>
          ) : (
            <>
              <span className='min-w-0 text-micro leading-normal text-ink-3'>
                {t`SkyDock sends nothing: it copies the email and opens a new message with the address and subject filled in. Click into it, paste (Ctrl+V, or ⌘V on a Mac) and press Send.`}
              </span>
              <Spacer />
              <Mini onClick={onClose}>{t`Close`}</Mini>
              <Seg
                label={t`Open the message in`}
                value={mailApp}
                options={[
                  ['gmail', 'Gmail'],
                  ['mailto', t`Mail program`]
                ]}
                onPick={setMailApp}
              />
              <Go
                title={t`Copies the email and opens a new message, addressed and titled — paste it in, then press Send`}
                onClick={() => void openMail(mailApp)}>
                <Icon name='mail' />
                <span aria-hidden='true'>
                  {copied === mailApp ? label(mailApp) : t`Copy & open`}
                </span>
                <span className='sr-only'>{label(mailApp)}</span>
              </Go>
            </>
          )
        }>
        <div className='grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_340px]'>
          <div className='flex min-h-0 flex-col gap-3 overflow-y-auto border-r border-line-2 px-6 py-4.5'>
            <label className='flex items-center gap-3.5'>
              <span className={`${EYEBROW} w-11 flex-none`}>{t`To`}</span>
              <input
                type='email'
                value={to}
                autoFocus
                placeholder={t`name@example.com — or type it in Gmail`}
                onChange={(e) => setTo(e.target.value)}
                className={`${FIELD} font-medium`}
              />
            </label>
            {writingTemplate && (
              <p className='m-0 rounded-r-corner border-l-3 border-pick bg-pick-soft px-3 py-2.25 text-small text-ink-2'>
                <b className='text-ink'>{t`The template for every email.`}</b>{' '}
                {t`What is written here is kept on this machine and drafts every email; each`}{' '}
                {'{variable}'}{' '}
                {t`is filled from their montage. A line whose variables are all empty for a montage — no film, no photos — is left out of their email.`}
              </p>
            )}
            <label className='flex items-center gap-3.5'>
              <span className={`${EYEBROW} max-w-24 min-w-11 flex-none`}>
                {writingTemplate ? t`Subject — for every email` : t`Subject`}
              </span>
              <input
                type='text'
                value={writingTemplate ? template.subject : subject}
                onChange={(e) => retitle(e.target.value)}
                className={`${FIELD} font-semibold`}
              />
            </label>
            <div className='flex min-h-75 flex-1 flex-col overflow-hidden rounded-corner border border-line-2'>
              <div className='flex flex-none flex-wrap items-center gap-0.5 border-b border-line-2 bg-well px-2 py-1.5'>
                <span
                  role='toolbar'
                  aria-label={t`Style`}
                  className='flex gap-0.5'>
                  {STYLES.map(([command, name, mark]) => (
                    <button
                      key={command}
                      type='button'
                      aria-label={i18n._(name)}
                      title={i18n._(name)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => style(command)}
                      className={`${TOOL} ${command === 'bold' ? 'font-bold' : command === 'italic' ? 'font-serif text-title italic' : ''}`}>
                      {command === 'insertUnorderedList' ? <Icon name='rows' /> : mark}
                    </button>
                  ))}
                  <button
                    type='button'
                    aria-label={t`Link`}
                    title={t`Link`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={askLink}
                    className={TOOL}>
                    <Icon name='link' />
                  </button>
                </span>
                {linking && (
                  <span className='ml-1.5 flex items-center gap-1'>
                    <input
                      aria-label={t`Link address`}
                      value={linking.href}
                      autoFocus
                      onChange={(e) => setLinking({ ...linking, href: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') putLink()
                        if (e.key !== 'Escape') return
                        e.stopPropagation()
                        setLinking(null)
                      }}
                      className={`${INPUT} w-56 py-0.5 text-small`}
                    />
                    <Mini onClick={putLink}>{t`Add link`}</Mini>
                  </span>
                )}
                {writingTemplate && (
                  <select
                    aria-label={t`Put in a variable`}
                    value=''
                    onChange={(e) => e.target.value && putVariable(e.target.value)}
                    className='ml-1.5 h-7 rounded-corner border border-line-strong bg-pane px-1.5 text-small text-ink-2'>
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
                <span className='ml-auto pr-1.5 pl-3 text-micro text-ink-3'>
                  {t`Shown as it will arrive — write in it; the signature stays for every email`}
                </span>
              </div>
              <div
                aria-label={t`Email preview`}
                onInput={(e) => {
                  written(e.target)
                  keepCaret()
                }}
                onKeyUp={keepCaret}
                onMouseUp={keepCaret}
                onKeyDown={(e) => {
                  const part = editing()
                  if (e.key === 'Enter' && part && isOneLine(part)) e.preventDefault()
                }}
                onPaste={(e) => {
                  const part = editing()
                  if (!part) return
                  e.preventDefault()
                  const pasted = e.clipboardData.getData('text/html')
                  const plain = e.clipboardData.getData('text/plain')
                  if (isOneLine(part)) {
                    document.execCommand('insertText', false, plain.replace(/\s+/g, ' '))
                    return
                  }
                  document.execCommand(
                    'insertHTML',
                    false,
                    pasted ? cleanEmailHtml(pasted) : htmlOfText(plain.replace(/\n/g, '\n\n'))
                  )
                }}
                dangerouslySetInnerHTML={{ __html: shown }}
                className='min-h-0 w-full flex-1 overflow-y-auto bg-paper text-stage-ink'
              />
            </div>
            <div className='flex flex-none flex-wrap items-center gap-2'>
              <Mini
                title={t`Laid out as shown, to paste into any mail`}
                onClick={() => void copy('email', copyEmail(fragment, text))}>
                {copied === 'email' ? t`✓ copied — paste it` : t`Copy email`}
              </Mini>
              <Mini onClick={() => void copy('subject', copyText(subject))}>
                {copied === 'subject' ? t`✓ copied` : t`Copy subject`}
              </Mini>
              <Mini
                title={shareUrl}
                onClick={() => void copy('link', copyText(shareUrl))}>
                {copied === 'link' ? t`✓ copied` : t`Copy link`}
              </Mini>
              <Spacer />
              {writingTemplate ? (
                <button
                  type='button'
                  title={t`Put the template back as SkyDock first wrote it`}
                  onClick={resetTemplate}
                  className={QUIET}>
                  {t`Back to the first template`}
                </button>
              ) : (
                <button
                  type='button'
                  title={t`Change the email every montage sends, with the words that change as variables`}
                  onClick={openTemplate}
                  className={QUIET}>
                  {t`Edit the template…`}
                </button>
              )}
            </div>
          </div>
          <div className='flex min-h-0 flex-col gap-3.5 overflow-y-auto bg-well px-5.5 py-5'>
            <span className={EYEBROW}>{t`At the counter`}</span>
            <span className='text-title leading-title font-semibold tracking-title'>
              {t`${firstname} can take the link with a phone, before the email has even gone.`}
            </span>
            {showingQr ? (
              <span className='self-start rounded-corner border border-line-2 bg-white p-1.5'>
                <ShareQr
                  url={shareUrl}
                  size={196}
                />
              </span>
            ) : (
              <span className='grid h-52.5 w-52.5 place-items-center rounded-corner border border-dashed border-line-strong'>
                <Mini
                  pressed={false}
                  title={t`The link as a QR code, for a phone to take it now`}
                  onClick={() => setShowingQr(true)}>
                  {t`QR code`}
                </Mini>
              </span>
            )}
            <span className='flex items-center gap-2'>
              <span className='min-w-0 font-mono text-micro break-all text-ink-3'>
                {shareUrl.replace(/^https?:\/\//, '')}
              </span>
              {showingQr && (
                <>
                  <Spacer />
                  <Mini
                    pressed
                    title={t`Scan it with a phone’s camera to open the link`}
                    onClick={() => setShowingQr(false)}>
                    {t`QR code`}
                  </Mini>
                </>
              )}
            </span>
            {canRecord && (
              <div
                role={opened && !emailed ? 'status' : undefined}
                className='mt-auto flex flex-col gap-2 rounded-corner border border-line-2 bg-pane p-4'>
                {emailed ? (
                  <>
                    <span className='text-title leading-none font-semibold tracking-title text-up'>
                      ✓ {sentTo ? t`Sent ${sentOn} to ${sentTo}` : t`Sent ${sentOn}`}
                    </span>
                    <span className='flex'>
                      <Mini
                        title={t`It was not sent after all`}
                        onClick={() => onRecord(false, to)}>
                        {t`Undo`}
                      </Mini>
                    </span>
                  </>
                ) : (
                  <>
                    <span className='text-title leading-none font-semibold tracking-title'>
                      {t`Sent it?`}
                    </span>
                    <span className='text-micro leading-normal text-ink-3'>
                      {opened === 'gmail'
                        ? t`The mail was opened in Gmail from here. Say so once it went, and the storage’s list records it.`
                        : opened
                          ? t`The mail was opened in the mail program from here. Say so once it went, and the storage’s list records it.`
                          : t`Say so once the email went, and the storage’s list records it.`}
                    </span>
                    <span className='mt-1 flex'>
                      {opened ? (
                        <Go
                          title={t`Say on the storage’s list that they have their link`}
                          onClick={() => onRecord(true, to)}>
                          {t`Yes — mark as sent`}
                        </Go>
                      ) : (
                        <Mini
                          title={t`Say on the storage’s list that they have their link`}
                          onClick={() => onRecord(true, to)}>
                          {t`Mark as sent`}
                        </Mini>
                      )}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </Modal>
      {asking && (
        <Modal
          label={t`Was the email sent?`}
          title={t`Was the email sent?`}
          sub={`${firstname} ${about.lastname}`.trim()}
          footer={
            <>
              <Spacer />
              <Mini
                title={t`Not sent: it stays to email`}
                onClick={() => setAsking(false)}>
                {t`Not sent`}
              </Mini>
              <Go
                title={t`Say on the storage’s list that they have their link`}
                onClick={() => {
                  setAsking(false)
                  onRecord(true, to)
                }}>
                {t`Yes — it was sent`}
              </Go>
            </>
          }>
          <p className='m-0 text-body text-ink-2'>
            {t`The mail was opened from here. Say whether it went: the storage’s list records it, and the montage stays to email until it does.`}
          </p>
        </Modal>
      )}
    </>
  )
}

export { EmailDialog }
