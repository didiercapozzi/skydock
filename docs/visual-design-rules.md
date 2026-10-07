# Visual design rules — the sky look

> How the board looks in its light theme, in enough detail to draw a new screen or build the look into the app without guessing. What the app _does_ is in [RULES.md](../RULES.md); how the code is written is in [CODING.md](../CODING.md). This file is only about appearance.

**Status.** This is the light theme of the app. It was drawn on the design canvas (https://claude.ai/artifact/WdR97TrNkiiseJ49fQrfsT, board _Growing slices_) for the main view — _Fresh files_ with one jump open — at 1520 × 820, and is built into `web/app/app.css` and the components. The dark theme is not redrawn here and keeps its own values under the same token names. Where this file gives a value it is the mockup's, except where a value was darkened for contrast when it was built, which the table says. The pictures of a jump are one component, `web/app/components/slices.tsx`.

## 0. The variables — the one place a size, a corner or a colour is said

Everything below is built from variables in `web/app/app.css`. A component never writes a size, a corner, a
shadow or a colour in its own pixels or hex; it names the one it means, so the whole app is kept alike and
changed from one place. `web/tests/server/design-rules.test.ts` reads every component and fails on the
first one that breaks this.

| What | Names | Notes |
| --- | --- | --- |
| Type | `text-micro` 11 · `text-small` 12 · `text-body` 13 · `text-lead` 14 · `text-title` 16 · `text-subhead` 18 · `text-heading` 22 · `text-display` 28 | seven sizes, and no other |
| Letter spacing | `tracking-title` · `tracking-display` · `tracking-eyebrow` · `tracking-spaced` | |
| Line height | `leading-title` 1.15 · `leading-text` 1.3 · `leading-prose` 1.5 | |
| Corners | `rounded-corner` 10 · `rounded-full` | one corner, the size of the field that finds anything, on buttons, fields, cards and panels alike; only a state pill, a switch, a dot or a play mark laid over a picture is round. The radii the mockup sections below give (6, 8, 14, 16, 18) are drawn as this one corner |
| Control sizes | `h-chip` 22 · `h-control-sm` 30 · `h-control` 34 · `h-control-lg` 42 · `size-mark` 18 | everything else is on the 4 px scale (`p-3`, `gap-2.5`, `top-4`), never in pixels |
| Breakpoints | `desk:` from 781 · `roomy:` from 901 · `wide:` from 1101, and `max-desk:` `max-roomy:` `max-wide:` below them | |
| Shadows | `shadow-soft` · `-card` · `-float` · `-overlay` · `-chip` · `-inset` · `-lift` · `-glow` · `-hairline` · `-divider` · `-edge-left`, and the rings `-ring` `-ring-2` `-ring-pick` `-ring-white` `-ring-dark` `-ring-stage` `-ring-current` `-picked` `-looked` `-halo` `-focus` `-inset-ring` `-inset-ring-accent` `-inset-bar` | a ring is a shadow, so it takes no room |
| Colours | the roles in section 2, plus `on-accent` and `on-bin` (the ink on a solid fill), `stage` and `stage-ink` (the viewer and what is written over it), `scrim` and `veil` (what darkens), `paper`, `dot-local` `dot-proc` `dot-up` | each is defined for both themes |
| Gradients | `bg-(image:--gradient-avatar-1)` … `-paper-todo` `-paper-done` `-paper-plain` `-picture` `-marker` `-veil-bottom` `-veil-side` | named for what they colour |
| Files | one row everywhere — `FileRow` in `components/file-row.tsx`: a tick (or a lock, or nothing), the picture, the name with what is worth knowing under it, and the state badge (`State`) — under a `FileGroup` heading. A destination, a montage, the bin, a camera's card and the storage all list their files with it | a place may say different things in a row, never build it differently |
| Shared looks | `eyebrow` (the quiet capital line over a part), `tool-button` (a small square button in a panel's head), `bare-input` (a field with no box of its own), `go-fill` (the main button) | |

Dark is the same variables redefined once, under the `dark` variant: it applies when the app is set to dark and, only while the app is on automatic, when the machine is — so a `dark:` class and a variable always agree.


## 1. The idea in five lines

1. **Light, soft grey-teal, easy to see.** The app's original pale grey-teal ground, with white panels on it. Nothing is dark except text and photographs.
2. **Photographs come first.** A jump is told by pictures of its own files, never by an icon. They run edge to edge where they can.
3. **No grey fills.** The quiet fills — a tab's track, an icon's tile, a note — are a light blue, never grey; lines and shadows are tints of the accent blue. The ground is the app's soft grey-teal wash.
4. **One accent.** A single clear blue for the thing selected and the next thing to do. The only other colour is the amber of a file that is still local, and red for letting go of something.
5. **Soft layers.** Panels sit one above another. The left panel is above the main area, the main area is above the right panel, and the footer is above all three. The order is shown with a line or a very light shadow, never a heavy one.

## 2. Colour

### 2.1 Ground and surfaces

| Role                  | Value                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Window ground         | a soft sky-blue wash: `#dbebf8` under three radial glows (`#6fabd1` top left, `#4d7ca3` top right, `#6595aa` bottom right) |
| Header strip          | `linear-gradient(90deg, #f2f9fb, #edf5f8)`, fully opaque so nothing shows through it |
| Left panel            | the same wash as the right panel, `linear-gradient(180deg, #f0f8fa, #f6fbfc 45%, #ffffff)`, with the waves and a white haze at its foot over it |
| Main area             | `linear-gradient(180deg, #eff8fa 0, #ffffff 240px)` — pale at its head, white from 240 px down |
| Right panel           | `linear-gradient(180deg, #f0f8fa 0%, #f6fbfc 45%, #ffffff 100%)` |
| Footer                | white at 60 %                                                                                                       |
| Cards, rows, buttons  | white                                                                                                               |
| Well (a quiet fill: a tab's track, a search field, a note) | `#e8f2fa` — a very light tint of the accent blue |

The main area and the right panel both run from a pale grey-teal at the top to white at the bottom. The panels are opaque, so the ground's shapes (section 3) show only on the left panel and the window's edges.

### 2.2 Ink

| Role                           | Value     |
| ------------------------------ | --------- |
| Text                           | `#0f2f47` |
| Secondary text                 | `#38607d` |
| Quiet text, headings, hints    | `#4a7090` (the mockup's `#5f86a3` was darkened to pass 4.5 : 1) |

Ink is a dark blue, never black and never grey.

### 2.3 Accent

| Role                                         | Value     |
| -------------------------------------------- | --------- |
| Accent                                       | `#0b7fd6` |
| Accent, darker (pressed, section headings)   | `#0762ab` |
| Accent soft (an icon's tile, a chevron's disc, an active toolbar button) | `#e4f1fc` |
| Accent gradient (the logo tile)              | `linear-gradient(135deg, #43b0f5, #0b7fd6)` |
| The main button's fill (white text on it)    | `linear-gradient(135deg, #1a8be0, #0b72c8)` — darker than the logo's so the white text reads |

### 2.4 State colours

| Role                                    | Value                                                                  |
| --------------------------------------- | ---------------------------------------------------------------------- |
| Local, to file (pill)                   | fill `#fdeacb`, text `#7d4309`, a 6 px dot `#e8590c`                   |
| Letting go (_Delete jump_, the bin)     | text `#c0262d`                                                         |
| "new" on a destination                  | white pill, accent text                                                |
| Count of what is waiting                | solid accent pill, white text                                          |

Amber is the one warm colour on the screen. It is kept for what is still local so that it can be told at a glance against all the blue.

### 2.5 Lines and shadows

All lines are white or a tint of the accent blue; all shadows are that blue at low strength.

| Role                                                                         | Value                                               |
| ---------------------------------------------------------------------------- | --------------------------------------------------- |
| Header's bottom line, footer's top line                                      | 1 px `rgba(11,127,214,.24)`                         |
| Between the main area and the right panel                                    | 2 px white, from under the picture down to the footer |
| Raised white things (buttons, rows, the status card, the start box)          | `0 2px 8px rgba(10,110,180,.16)`                    |
| A card that is not selected                                                  | `0 1px 4px rgba(10,100,170,.08)`                    |
| The selected card                                                            | a 3 px white ring, then a 2 px accent ring, then `0 10px 22px rgba(11,127,214,.32)` |
| The main button                                                              | `0 8px 18px rgba(11,127,214,.32)`                   |
| The left panel onto the main area                                            | `2px 0 10px rgba(8,80,150,.10)`                     |

The main area casts **no** shadow onto the right panel, and the footer casts none upward. Between the header and the right panel's picture there is no line at all.

## 3. The ground's own shapes

Behind everything, on the ground only, there are quiet white shapes. Only the left panel and the margins of the window are not covered by a panel, so the beams are seen mostly through the panels' slight transparency. They are there to give the sky some life and must never compete with content.

- **Light from above.** Ten white beams fan out from a point above and outside the window's top-right corner, running down to the left. They are strongest near their origin and fade to nothing at 1500 px. Peak opacity is 20 %. There is **no sun** and no glow.
- **Rays in the left panel.** Eleven straight white beams fan out from a point above and just outside the panel's top-right corner, running down to the left across its whole height. Each is a thin wedge of white, 38 % at its origin and fading to nothing at 900 px, so they read as light falling across the places. Under them the panel keeps its 22 % white film, and its last 150 px thicken to white (90 %) so it ends in a clean white edge. There are no clouds.
- **Nowhere else.** The header, the main area and the right panel carry no shapes of their own.

## 4. Type

- **Text:** Plus Jakarta Sans, weights 400 to 800. **File names:** JetBrains Mono, 12 px, weight 500.
- Base size is 14 px with a line height of 1.45.

| Use                                              | Size / weight                                  |
| ------------------------------------------------ | ---------------------------------------------- |
| The page's title (_Fresh files_)                 | 30 px, 700, letter spacing −0.03 em            |
| A panel's title (_Jump 3_)                       | 26 px, 700, letter spacing −0.03 em            |
| Status line                                      | 17 px, 600                                     |
| A card's title                                   | 18 px, 700                                     |
| Items in the left panel                          | 15 px, 500 (selected: 700)                     |
| Body and buttons                                 | 14 px, 600–700                                 |
| A card's date and count, hints                   | 12–13 px, 400, quiet ink                       |
| Section heading (_File it to_, _Destinations_)   | 11 px, 700, capitals, letter spacing 0.09 em, accent-dark at 70 % in the left panel, quiet ink in the right |
| Pills and badges                                 | 12 px, 600–700                                 |

## 5. The window

The window is a header, three columns and a footer. All of it is flush: **there is no gap between panels**; they touch and are told apart by a line or a light shadow.

| Part               | Size and position                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| Left panel         | 264 px wide, from the top of the window to the footer. Carries the brand at its top                |
| Header             | 56 px high, to the right of the left panel, over the main area and the right panel                 |
| Main area          | 919 px wide at 1520, between the header and the footer; 28 px padding                              |
| Right panel        | 337 px wide, from the header to the footer; its picture touches the header                         |
| Footer             | 30 px high, the full width                                                                         |

Stacking from front to back: footer, left panel, main area, right panel, header. A narrower window folds the right panel into a drawer as before (RULES.md, _The board_); the drawer takes the right panel's look.

### 5.1 Header

- **Left:** _Scan_ (a refresh icon and its word), a hairline divider, then the list and grid view buttons. The active one has the accent-soft fill and accent icon.
- **Centre:** the search field, a 330 × 36 pill-rounded box (radius 12) in 70 % white with a search icon, _Find anything_ and a small white _Ctrl F_ key.
- **Right:** the keyboard-shortcuts and options icons, then the details-panel button, active when the panel is open.
- Header buttons are 34 px high, no outline, radius 10.

### 5.2 Left panel

- **Brand:** a 32 px tile, radius 10, in the accent gradient with a white mark, then _SkyDock_ in 18 px, 800. The row is 56 px high, level with the header.
- **Sections** (_Work_, _Destinations_, _Montages_, _Elsewhere_): a small capital heading, then its items.
- **Item:** 42 px high, radius 14, a 30 px rounded icon tile at the left (white at 70 %, accent icon), the name, and a badge at the right when there is something to say.
- **Selected item:** a white card with a soft shadow, the name in bold, and its icon tile turned solid accent with a white icon and a faint blue glow.
- **Badges:** a count is a solid accent pill with white text; _new_ is a white pill with accent text.
- **Add a destination…:** a 40 px button with a 1.5 px dashed white outline and a 25 % white fill, accent-dark text, a plus icon, centred.
- **Empty section:** a quiet one-line item with its icon (_No montage yet_).
- **Bottom:** the clouds of section 3, and nothing else.

### 5.3 Main area

1. **Page head.** A 48 px rounded tile (radius 14, accent-soft, accent icon), the title and its one-line description, and at the right a _Search_ pill and a round _more_ button.
2. **Status card.** 64 px high, radius 18, a pale-blue-to-white gradient (`#e8f3fb` to `#f5faff`) with the white raised shadow. A white round chevron, a 17 px sentence on where things stand, and a quiet line under it.
3. **Jump cards** (section 6), three across with a 15 px gap.
4. **The open jump's heading:** its name in bold and a quiet pill saying what it holds.
5. **File rows** (section 7).

The _Search_ and _more_ buttons are the same family as every other button: white, no outline, the raised shadow, accent-coloured icon and text. _Search_ is a pill with its word, 42 px high; _more_ is a 42 px circle with three dots.

### 5.4 Right panel

From the top down:

1. **The picture** (section 6.2): 206 px high, edge to edge, no margin, no border, no rounded corners. It touches the header above it and the main area beside it.
2. **Who:** a small capital line (_Jump · 26 September 2026_), the name at 26 px, and what it holds.
3. **File it to:** one white pill per destination (section 8).
4. **Or make it a film:** the main button, and a hint under it.
5. **Starts:** a white box, 22 px time, date and _click to correct_ beside it.
6. **Foot:** _Select its n files_ and _Delete jump_ as small white pills, pinned to the bottom with 10 px above and 14 px below.

Text sits 24 px from the panel's sides. The bottom of the panel is white, so the foot sits on white.

## 6. Pictures of files

### 6.1 The jump card

A white card, radius 18, 277 × 146 at the mockup's width.

- **Top, 88 px:** a strip of its files' pictures (section 6.3).
- **Bottom, 58 px:** the name (18 px, 700) and under it the date, time and file count in quiet 12 px, with the amber _to file_ pill at the right.
- **Selected:** the ring and glow of section 2.5. The other cards have only their light shadow.

### 6.2 The picture at the top of the right panel

The same growing slices at full size: up to five across the panel's width and 206 px high, each wider than the one before, growing by 0.2 of the first's width instead of the card's 0.4 so the large picture stays even. A blurred, darkened copy of the first file's picture sits under them so a gap never shows a flat colour.

The mockup shows five slices. The app shows one slice per file up to five; when there are more files than that, the last slice carries a small dark pill, _+n_, for the rest.

### 6.3 Growing slices — how they are drawn

- Slices lean left by 14° (`skewX(-14deg)`); the picture inside each is skewed back by 14° so it stays upright.
- They go left to right in the order the files were shot, and each is wider than the one before: their visible widths are in the proportion 1 : 1.4 : 1.8 : 2.2 : 2.6, shared out over the strip's width.
- Each slice is drawn over the one before it and casts a thin shadow to its left, `-5px 0 10px` in a dark blue at 38 % (`-6px 0 14px` at 40 % in the panel's large picture). That shadow is what makes the edges read as layers.
- Each slice is 34 px wider than its visible part, so it overlaps the next and there is never a gap.
- Never a border or a white outline round a slice. A slice that cannot show its picture shows a blue fill (`#a6d8f6`).

## 7. File rows

- 66 px high, radius 16, white, with the raised shadow, 12 px padding at the left and 20 at the right.
- At the left a tick box: 20 px, radius 6, a 2 px light-blue ring (`#86bfe6`) and no fill.
- Then the picture: 64 × 44, radius 8.
- Then the file's name in mono, and under it its time, its size and its proxy in quiet 12 px.
- At the right its state as a pill: amber _Local_ with its dot.

## 8. Buttons and pills

All buttons use the one corner (10) — not a pill — unless stated, white, without an outline, and lifted by the raised shadow. The accent is for the icon and the word; the fill stays white.

| Button                                  | Look                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Ordinary (_Search_, _Select its files_) | White pill, accent-dark text, 700; 34–42 px high                                                  |
| Round icon button                       | 42 px circle, white, accent icon                                                                  |
| Destination                             | 46 px white pill; at the left a 30 px accent-soft disc with a folder icon, the name in bold, at the right a 28 px accent-soft disc with a chevron |
| The main button (_Make a montage…_)     | 48 px pill in the accent gradient, white 700 text at the left, a white-at-28 % disc with a chevron at the right, a blue glow |
| Letting go (_Delete jump_)              | the ordinary pill with red text; never filled red                                                 |
| Pill (state)                            | 24 px high, radius 99, 12 px / 600; amber for local                                               |
| Hover                                   | a white button takes the accent-soft fill                                                         |
| Tabs (_Local_ / _On the storage_, _All_ / _Videos_ / _Photos_) | a fully round track in the well colour with a faint inset shadow, 40 px high with 4 px inside; the chosen tab is a white pill with the raised shadow and accent-dark text, the others quiet with a white 60 % wash on hover |

There is one main button on a screen at most. Everything that is not the next step is white.

## 9. Icons

Outline icons on a 24 px grid, 1.9 px stroke, round caps and joins, `currentColor`. They sit at 15–18 px in toolbars and lists, 20 px for the round buttons. An icon in a tile takes the accent colour; on a solid accent tile it is white.

## 10. Spacing

The base unit is 4 px. Panel padding is 24–28 px; the gap between cards is 15 px; rows are 8 px apart; a heading sits 16 px above its content and 8 px over it. Corners: one, 10, on cards, rows, the status card, the left panel's items and header buttons alike; state pills fully round.

## 11. What not to do

- No grey fill on a tab, an icon tile or a note: use the light blue well or the accent-soft tile.
- No border or white outline round a picture.
- No gap between the panels, and no outline round a panel.
- No heavy shadow. The strongest in the whole design is the selected card's glow.
- No shapes in the header, the main area or the right panel. The left panel's clouds are the only drawn scenery, and they stay at its bottom.
- No second accent colour. Amber and red say something, and are used only for that.
- No filled red button, and no more than one filled button on a screen.
- No rounded corners on the right panel's picture, and no margin round it.

## 12. Known gaps to settle before it is built

- **Contrast.** The quiet ink was darkened to `#4a7090` and the main button's fill to `#1a8be0 → #0b72c8` for it. White text on the lighter end of that gradient is still about 4 : 1, a little under the 4.5 : 1 for small text. A darker fill would pass without changing the look much.
- **Dark theme.** Not redrawn. The same structure — layers, one accent, cool neutral lines — would apply, with a deep cool-grey ground.
- **Other pages.** A montage, a dropzone, a camera and the dialogs are not drawn in this look.
- **Narrow windows and the drawer** are described but not drawn.
- **Motion.** Not designed; the app's current transitions are kept.
