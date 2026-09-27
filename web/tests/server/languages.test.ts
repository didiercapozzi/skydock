// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import { languageOf } from '../../app/helpers/language'

/* The app speaks English, French and German (RULES, Languages): the one chosen by hand, else the one
   the machine asks for, else English — and every sentence it has is there in each. */

const asking = (headers: Record<string, string>) => new Request('http://localhost/', { headers })

describe('the language the app speaks', () => {
  it('is the one chosen by hand, whatever the machine asks for', () => {
    expect(languageOf(asking({ Cookie: 'x=1; skydock.lang=de', 'Accept-Language': 'fr-CH' }))).toBe(
      'de'
    )
  })

  it('is the first the machine asks for that the app speaks', () => {
    expect(languageOf(asking({ 'Accept-Language': 'it-CH,it;q=0.9,fr-CH;q=0.8,en;q=0.5' }))).toBe(
      'fr'
    )
  })

  it('is English when nothing asked for is spoken', () => {
    expect(languageOf(asking({ 'Accept-Language': 'ja' }))).toBe('en')
    expect(languageOf(asking({ Cookie: 'skydock.lang=xx' }))).toBe('en')
  })
})

describe('the sentences of the app', () => {
  const untranslated = (language: string) => {
    const po = fs.readFileSync(
      path.join(import.meta.dirname, '../../app/locales', language, 'messages.po'),
      'utf-8'
    )
    return [...po.matchAll(/^msgid "(.+)"\nmsgstr ""$/gm)].map((m) => m[1])
  }

  it('are all said in French', () => {
    expect(untranslated('fr')).toEqual([])
  })

  it('are all said in German', () => {
    expect(untranslated('de')).toEqual([])
  })
})
