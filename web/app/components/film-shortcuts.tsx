import { t } from '@lingui/core/macro'
import { useEffect, useRef, useState } from 'react'
import {
  DEFAULT_KEYS,
  FILM_ACTIONS,
  keyLabel,
  keyName,
  keyNames,
  keyOwner,
  moveKey,
  refusedKey,
  withoutKey,
  type FilmAction,
  type FilmKeys
} from '../helpers/filmKeys'
import { setFilmKeys, useFilmKeys } from '../hooks/useFilmKeys'
import { Mini } from './buttons'
import { ERROR, Modal, Spacer } from './modal'

const CHIP =
  'rounded-corner border border-line-2 bg-well px-1 text-micro leading-4 font-medium text-ink-2'

const HIT =
  'inline-flex min-h-6 min-w-6 items-center justify-center focus-visible:outline-2 focus-visible:outline-accent'

const actionName = (action: FilmAction) =>
  ({
    cut: t`Cut`,
    fade: t`Fade in`,
    ripple: t`Ripple`,
    snap: t`Snap`,
    title: t`Title`,
    delete: t`Delete`,
    marker: t`Marker`
  })[action]

type Capture = { action: FilmAction; replacing?: string }

const question = (asking: Capture & { key: string }, bound: FilmKeys) => {
  const key = keyLabel(asking.key)
  const used = actionName(keyOwner(bound, asking.key)!)
  const wanted = actionName(asking.action)
  return t`${key} is used by ${used}. Use it for ${wanted} instead?`
}

const FilmShortcuts = ({ scratch, onClose }: { scratch: boolean; onClose: () => void }) => {
  const bound = useFilmKeys()
  const [editing, setEditing] = useState(false)
  const [capture, setCapture] = useState<Capture | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [asking, setAsking] = useState<(Capture & { key: string }) | null>(null)
  const opener = useRef<Element | null>(null)
  const status = useRef<HTMLDivElement>(null)
  const [after, setAfter] = useState<{ selector: string } | null>(null)
  useEffect(() => {
    if (asking) status.current?.querySelector('button')?.focus()
  }, [asking])
  useEffect(() => {
    if (after) document.querySelector<HTMLElement>(after.selector)?.focus()
  }, [after])

  const begin = (next: Capture) => {
    opener.current = document.activeElement
    setRefusal(null)
    setAsking(null)
    setCapture(next)
  }

  const refocus = (action?: FilmAction) => {
    setAfter({ selector: action ? `[data-add="${action}"] button` : '[data-add] button' })
  }

  const finish = (action?: FilmAction) => {
    setCapture(null)
    setAsking(null)
    setRefusal(null)
    if (action) return refocus(action)
    const was = opener.current
    if (was instanceof HTMLElement && was.isConnected) was.focus()
    else document.querySelector<HTMLElement>('[aria-modal="true"] button')?.focus()
  }

  const bind = ({ action, replacing, key }: Capture & { key: string }) => {
    const moved = moveKey(bound, action, key)
    setFilmKeys(replacing && replacing !== key ? withoutKey(moved, action, replacing) : moved)
    finish(action)
  }

  useEffect(() => {
    if (!capture && !asking) return
    const listen = (e: KeyboardEvent) => {
      if (asking) {
        if (e.key !== 'Escape') return
        e.preventDefault()
        e.stopPropagation()
        return finish()
      }
      if (!capture) return
      if (['Shift', 'Control', 'Alt', 'Meta', 'Process', 'Unidentified'].includes(e.key)) return
      if (e.isComposing || e.keyCode === 229) return
      e.preventDefault()
      e.stopPropagation()
      if (e.repeat) return
      if (e.key === 'Dead') return setRefusal(t`A dead key cannot be set`)
      if (e.key === 'Escape') return finish()
      const key = keyName(e.key)
      const alias = keyNames(e).find((one) => one !== key && keyOwner(bound, one))
      const aliased = alias ? keyOwner(bound, alias)! : null
      const aliasLabel = alias ? keyLabel(alias) : ''
      const used = aliased ? actionName(aliased) : ''
      const reason =
        (e.ctrlKey || e.metaKey || e.altKey) && !e.getModifierState('AltGraph')
          ? t`Ctrl, Cmd and Alt are for other things`
          : e.shiftKey && /^\p{L}$/u.test(key)
            ? t`Shift cannot be held with a letter`
            : aliased && aliased !== capture.action
              ? t`${aliasLabel} on this keycap is used by ${used}`
              : refusedKey(key)
      if (reason) return setRefusal(reason)
      setRefusal(null)
      const owner = keyOwner(bound, key)
      if (owner && owner !== capture.action) {
        setAsking({ ...capture, key })
        setCapture(null)
      } else bind({ ...capture, key })
    }
    window.addEventListener('keydown', listen, true)
    return () => window.removeEventListener('keydown', listen, true)
  })

  const sections: [string, [FilmAction | string, string][]][] = [
    [
      t`Playing`,
      [
        ['Enter, Space', t`play or stop; in a text box they type instead`],
        ['←  →', t`move the playhead 0.1 second, 1 second with Shift`],
        ['Home, End', t`go to the start or the end of the timeline`]
      ]
    ],
    [
      t`Tools`,
      [
        [
          'cut',
          scratch
            ? t`cut at the playhead; Cut is off here, so this key does nothing`
            : t`cut at the playhead`
        ],
        ['fade', t`fade the picked clip in over the one before it, or take the fade off`],
        ['delete', t`delete the picked item`],
        ['ripple', t`turn Ripple on or off`],
        ['snap', t`turn Snap on or off`],
        ['title', t`add a text at the playhead`],
        ['marker', t`add a marker at the playhead, on the picked clip or piece of music`]
      ]
    ],
    [
      t`Editing`,
      [
        ...(scratch
          ? []
          : ([['Alt + ←  →', t`move the picked clip 0.1 second, 1 second with Shift`]] as [
              string,
              string
            ][])),
        ['⌘/Ctrl + Z', t`undo`],
        ['?', t`this list`],
        ['Esc', t`close this list, or the editor`]
      ]
    ]
  ]
  const isAction = (name: string): name is FilmAction => FILM_ACTIONS.some((one) => one === name)
  const changed = FILM_ACTIONS.some((one) => bound[one].join() !== DEFAULT_KEYS[one].join())

  const keyChips = (action: FilmAction) => {
    const tool = actionName(action)
    return (
      <span className='flex flex-wrap items-center gap-1'>
        {bound[action].map((key) => {
          const label = keyLabel(key)
          return (
            <span
              key={key}
              className={`${CHIP} inline-flex items-center`}>
              {editing ? (
                <>
                  <button
                    type='button'
                    aria-label={t`${label}, change the key of ${tool}`}
                    title={t`Change this key`}
                    className={`${HIT} px-1`}
                    onClick={() => begin({ action, replacing: key })}>
                    {label}
                  </button>
                  <button
                    type='button'
                    aria-label={t`Remove key ${label} from ${tool}`}
                    title={t`Remove this key`}
                    className={`${HIT} ml-1 px-2 text-ink-3 hover:text-ink`}
                    onClick={() => {
                      setRefusal(null)
                      setFilmKeys(withoutKey(bound, action, key))
                      refocus(action)
                    }}>
                    ×
                  </button>
                </>
              ) : (
                label
              )}
            </span>
          )
        })}
        {editing && (
          <>
            <span data-add={action}>
              <Mini
                label={t`Add a key to ${tool}`}
                onClick={() => begin({ action })}>
                {t`Add a key`}
              </Mini>
            </span>
            {bound[action].join() !== DEFAULT_KEYS[action].join() && (
              <Mini
                label={t`Reset ${tool}`}
                onClick={() => {
                  setRefusal(null)
                  setFilmKeys({ ...bound, [action]: DEFAULT_KEYS[action] })
                  refocus(action)
                }}>
                {t`Reset`}
              </Mini>
            )}
          </>
        )}
      </span>
    )
  }

  const capturing = capture ? actionName(capture.action) : ''

  return (
    <Modal
      label={t`Film editor shortcuts`}
      title={t`Film editor shortcuts`}
      onClose={onClose}
      footer={
        <>
          <span className='text-small text-ink-3'>
            {t`A button you clicked does not take Enter or Space: they play. Reach it with Tab and they press it.`}
          </span>
          <Spacer />
          {editing && changed && (
            <Mini
              onClick={() => {
                setFilmKeys(DEFAULT_KEYS)
                setCapture(null)
                setRefusal(null)
                refocus()
              }}>
              {t`Reset to defaults`}
            </Mini>
          )}
          <Mini
            pressed={editing}
            onClick={() => {
              setEditing(!editing)
              setCapture(null)
              setAsking(null)
              setRefusal(null)
            }}>
            {editing ? t`Done editing` : t`Edit shortcuts`}
          </Mini>
          <Mini onClick={onClose}>{t`Close`}</Mini>
        </>
      }>
      <div
        ref={status}
        role='status'
        aria-live='polite'
        className={
          capture || asking || refusal
            ? 'rounded-corner bg-well px-3 py-2 text-body text-ink-2'
            : 'sr-only'
        }>
        {asking ? (
          <span className='flex items-center gap-2'>
            <span>{question(asking, bound)}</span>
            <Spacer />
            <Mini onClick={() => bind(asking)}>{t`Move`}</Mini>
            <Mini onClick={() => finish()}>{t`Cancel`}</Mini>
          </span>
        ) : capture ? (
          t`Press the new key for ${capturing}. Esc cancels.`
        ) : null}
        {refusal && <span className={`mt-1 block ${ERROR}`}>{refusal}</span>}
      </div>
      {editing && (
        <p className='m-0 text-small text-ink-3'>
          {t`Only the keys of the tools can be changed. The other keys are fixed.`}
        </p>
      )}
      <div className='grid grid-cols-[fit-content(50%)_1fr] gap-x-4 gap-y-3'>
        {sections.map(([heading, keys]) => (
          <section
            key={heading}
            className='col-span-2 grid grid-cols-subgrid'>
            <h5 className='col-span-2 m-0 mb-1.5 text-micro font-bold text-ink-3'>{heading}</h5>
            <dl className='col-span-2 m-0 grid grid-cols-subgrid items-center gap-y-1.5 text-body'>
              {keys.map(([key, does]) => (
                <div
                  key={key}
                  className='contents'>
                  <dt>{isAction(key) ? keyChips(key) : <span className={CHIP}>{key}</span>}</dt>
                  <dd className='m-0 text-ink-2'>{does}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  )
}

export { FilmShortcuts }
