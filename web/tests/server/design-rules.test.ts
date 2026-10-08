// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'

/* The visual design is one set of rules, kept in app.css as variables and written down in
   docs/visual-design-rules.md: seven type sizes, one corner, a few control sizes, the 4 px scale, a
   handful of shadows, and colours that are named. A component never says a size, a corner, a shadow or a
   colour in its own pixels or its own hex — it names the one it means — so the whole app is changed, and
   kept alike, from one place. This reads every component and says which one broke the rule. */

const app = path.join(__dirname, '..', '..', 'app')

const files = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? files(full) : full.endsWith('.tsx') ? [full] : []
  })

/* what each rule forbids, written the way a class would say it */
const RULES: Array<[string, RegExp]> = [
  ['a type size in pixels (use text-micro … text-display)', /(?<![\w-])text-\[\d/],
  ['a corner in pixels (use rounded-corner)', /(?<![\w-])rounded(?:-[a-z]{1,2})?-\[/],
  [
    'a corner of another size (there is one: rounded-corner — or rounded-full for a pill or a dot)',
    /(?<![\w-])rounded(?:-(?:t|b|r|l|tl|tr|bl|br))?(?:-(?:bar|chip|control|card|panel|xs|sm|md|lg|[2-4]?xl))?(?![\w-])/
  ],
  [
    'a letter spacing in em (use tracking-title, -display, -eyebrow or -spaced)',
    /(?<![\w-])tracking-\[-?[\d.]/
  ],
  [
    'a line height in pixels or a ratio (use leading-title, -text or -prose)',
    /(?<![\w-])leading-\[[\d.]/
  ],
  [
    'a shadow written out (name one in app.css: shadow-card, -hairline, -ring …)',
    /(?<![\w-])shadow-\[/
  ],
  [
    'a colour written out (name it in app.css)',
    /(?<![\w-])(?:bg|text|border|from|to|via|fill|stroke|ring)-\[[^\]]*(?:#[0-9a-f]{3}|rgba?\()/i
  ],
  [
    'a size, space or offset in pixels (use the 4 px scale: p-3, gap-2.5, top-4 — or a named size)',
    /(?<![\w[-])-?(?:p[xytblrse]?|m[xytblrse]?|gap(?:-[xy])?|top|left|right|bottom|inset(?:-[xy])?|w|h|size|min-w|min-h|max-w|max-h|basis|space-[xy]|translate-[xy])-\[-?[\d.]+(?:px|rem)\]/
  ],
  [
    'a breakpoint in pixels (use desk:, roomy:, wide: and their max- forms)',
    /(?<![\w-])(?:min|max)-\[\d+px\]:/
  ]
]

describe('the visual design rules', () => {
  const sources = files(app).map(
    (file) => [path.relative(app, file), fs.readFileSync(file, 'utf-8')] as const
  )

  for (const [rule, pattern] of RULES) {
    it(`no component writes ${rule}`, () => {
      const broken = sources.flatMap(([name, text]) =>
        text.split('\n').flatMap((line, at) => (pattern.test(line) ? [`${name}:${at + 1}`] : []))
      )
      expect(broken).toEqual([])
    })
  }
})
