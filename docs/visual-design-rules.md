# Visual design rules — the sky look

> How the board looks, in enough detail to draw a new screen or build the look into the app without guessing. What the app _does_ is in [RULES.md](../RULES.md); how the code is written is in [CODING.md](../CODING.md). This file is only about appearance.

**Status.** This is the look of the whole app, in both themes. It was drawn on the design canvas (https://claude.ai/artifact/8JWcdD51HGYSsybX8pp4SW, boards _B · Sheet_ and _B+ · Sheet with the details panel open_) for the main view — _Fresh files_, with and without one jump open — at 1280 × 800, and is built into `web/app/app.css` and the components. The dark theme is the same design redrawn in deep navy under the same token names (section 2.6). Where this file gives a value it is the mockup's. The pictures of a jump are one component, `web/app/components/slices.tsx`.

## 0. The variables — the one place a size, a corner or a colour is said

Everything below is built from variables in `web/app/app.css`. A component never writes a size, a corner, a shadow, a colour or a drawn shape in its own pixels, hex or SVG; it names the one it means, so the whole app is kept alike and changed from one place. `web/tests/server/design-rules.test.ts` reads every component and fails on the first one that breaks this. A new look is made by changing a variable, or by adding one to `app.css` first and then naming it.

| What | Names | Notes |
| --- | --- | --- |
| Type | `text-micro` 11 · `text-small` 12 · `text-body` 13 · `text-lead` 14 · `text-title` 16 · `text-subhead` 18 · `text-heading` 22 · `text-display` 28 | seven sizes, and no other |
| Letter spacing | `tracking-title` · `tracking-display` · `tracking-eyebrow` · `tracking-spaced` | |
| Line height | `leading-title` 1.15 · `leading-text` 1.3 · `leading-prose` 1.5 | |
| Corners | `rounded-corner` 10 · `rounded-full` | one corner, the size of the field that finds anything, on buttons, fields, cards and panels alike; only a state pill, a switch, a dot or a play mark laid over a picture is round. A radius this file gives anywhere is that one corner |
| Control sizes | `h-chip` 22 · `h-control-sm` 30 · `h-control` 34 · `h-control-lg` 42 · `size-mark` 18 | everything else is on the 4 px scale (`p-3`, `gap-2.5`, `top-4`), never in pixels |
| Breakpoints | `desk:` from 781 · `roomy:` from 901 · `wide:` from 1101, and `max-desk:` `max-roomy:` `max-wide:` below them | |
| Shadows | `shadow-soft` · `-card` · `-float` · `-overlay` · `-chip` · `-inset` · `-lift` · `-glow` · `-hairline` · `-divider` · `-edge-left`, and the rings `-ring` `-ring-2` `-ring-pick` `-ring-white` `-ring-dark` `-ring-stage` `-ring-current` `-picked` `-looked` `-halo` `-focus` `-inset-ring` `-inset-ring-accent` `-inset-bar` | a ring is a shadow, so it takes no room. `shadow-card` is a hairline ring and a soft lift in one |
| Colours | the roles in section 2, plus `divider` (the plain line between two parts), `on-accent` and `on-bin` (the ink on a solid fill), `stage` and `stage-ink` (the viewer and what is written over it), `scrim` and `veil` (what darkens), `paper`, `dot-local` `dot-proc` `dot-up` | each is defined for both themes |
| The surface | `--surface-mint` `--surface-periwinkle` `--surface-sky` `--surface-base`, `--hairline-fade`, and the made backgrounds `--ground-bg` `--rail-bg` `--pane-shapes` `--side-bg` `--head-tint` `--foot-tint` `--head-shadow` | used only through the shared looks below |
| Gradients | `bg-(image:--gradient-avatar-1)` … `-picture` `-marker` `-veil-bottom` `-veil-side` | named for what they colour |
| Files | one row everywhere — `FileRow` in `components/file-row.tsx`: a tick (or a lock, or nothing), the picture, the name with what is worth knowing under it, and the state badge (`State`) — under a `FileGroup` heading. A destination, a montage, the bin, a camera's card and the storage all list their files with it | a place may say different things in a row, never build it differently |
| Shared looks | `ground` (the surface), `isle-rail` `isle-head` `isle-pane` `isle-side` `isle-foot` (the five parts laid on it), `eyebrow` (the quiet capital line over a part), `tool-button` (a small square button in a panel's head), `bare-input` (a field with no box of its own), `go-fill` (the main button) | a part of the window takes its look from its class and nowhere else |

Dark is the same variables redefined once, under the `dark` variant: it applies when the app is set to dark and, only while the app is on automatic, when the machine is — so a `dark:` class and a variable always agree.

## 1. The idea in five lines

1. **Light, one pale surface.** A sheet of near-white blue with a breath of mint at its top right and periwinkle at its bottom left. Nothing is dark except text and photographs.
2. **Photographs come first.** A jump is told by pictures of its own files, never by an icon. They run edge to edge where they can.
3. **Fine lines draw the work.** A dot matrix and the routing of a board in the places, a honeycomb of cells and a system diagram's traces in the work, one soft green in the details. Every line is the accent blue at low strength, and no shape ever competes with content.
4. **One accent.** A single clear blue for the thing selected and the next thing to do. The only other colour is the amber of a file that is still local, and red for letting go of something.
5. **Parts laid edge to edge.** The places, the head, the work, the details and the foot touch, and are told apart by a plain line, a hairline that fades at both ends, or a very light shadow, never a heavy one.

## 2. Colour

### 2.1 Surface and parts

| Role | Value |
| --- | --- |
| The surface (`--ground-bg`) | `#f8fbfe` under three radial glows: mint `#d8f1ec` at the top right, periwinkle `#e0e8ff` at the bottom left, pale sky `#eaf4ff` in the middle |
| Places (`--rail-bg`) | a tint from `#e2eefb` at 80 % to `#f7fbfe` at 70 %, top to bottom, with a dot matrix at its top and traces at its foot (section 3) |
| Header (`--head-tint`) | white at 55 %, blurred behind, a very light shadow below it (`--head-shadow`) |
| Work (`--pane-shapes`) | no tint: the surface shows through. A honeycomb at its top right, traces and arcs at its foot (section 3) |
| Details (`--side-bg`) | white at 50 %, blurred behind, with one soft green in its bottom right corner — the surface's own mint `#d8f1ec` — and its left edge a hairline that fades at both ends |
| Footer (`--foot-tint`) | white at 62 %, blurred behind |
| Cards, rows, buttons | white |
| Well (a quiet fill: a tab's track, a search field, a note) | `#e8f2fa` — a very light tint of the accent blue |

The surface shows through the work completely, and through the other parts a little: they are tints, not solid fills. A picture, a card, a row and a button are the things that are opaque.

### 2.2 Ink

| Role | Value |
| --- | --- |
| Text | `#0f2f47` |
| Secondary text | `#38607d` |
| Quiet text, headings, hints | `#4a7090` |

Ink is a dark blue, never black and never grey.

### 2.3 Accent

| Role | Value |
| --- | --- |
| Accent | `#0b7fd6` |
| Accent, darker (pressed, section headings) | `#0762ab` |
| Accent soft (a chevron's disc, an active toolbar button) | `#e4f1fc` |
| Pick (whatever is selected, picked or chosen: a card's ring, a row's ring, a ticked box, a chosen option, the keyboard's outline) | `#56a9e6` — a lighter blue than the accent, with `#e4f1fc` (`pick-soft`) behind a chosen option; `#6fd0e6` in the dark theme |
| Accent gradient (the logo tile) | `linear-gradient(135deg, #43b0f5, #0b7fd6)` |
| The main button's fill (white text on it) | `linear-gradient(135deg, #1a8be0, #0b72c8)` — darker than the logo's so the white text reads |

### 2.4 State colours

| Role | Value |
| --- | --- |
| Local, to file (pill) | a white pill with a hairline ring (`shadow-hairline`), its word and its 6 px dot in amber `#7d4309` |
| Letting go (_Delete jump_, the bin) | text `#c0262d` |
| "new" on a destination | white pill, accent text |
| Count of what is waiting | solid accent pill, white text |

Amber is the one warm colour on the screen. It is kept for what is still local so that it can be told at a glance against all the blue. A state is never a coloured fill: its pill is white like every other thing that can be pressed or read, and the colour sits in its word and its dot. The status card is white whatever it says; its icon's disc carries the tone (amber, green or blue).

### 2.5 Lines and shadows

All lines are a tint of the accent blue; all shadows are that blue at low strength.

| Role | Value |
| --- | --- |
| Between the places and the work | one plain 1 px line, `divider` (`#cfe0f2`) |
| Header's foot, footer's head, details' left edge | a 1 px hairline of `--hairline-fade` (the accent at 26 %) that fades to nothing at both ends |
| Raised white things (cards, buttons, rows, the status card's disc, the page's tile) | `shadow-card`: a 1 px ring at 8 % and `0 8px 22px` at 9 %, both `rgba(40,100,170,…)` |
| A line drawn as a shadow (the status card) | `shadow-hairline` |
| The selected card (the open jump) and a picked file | a 3 px white ring, then a 2 px ring in the pick blue — `shadow-picked` |
| The main button | `0 8px 18px rgba(11,127,214,.32)` |

The details cast a soft shadow towards the work (`--side-shadow`, `-12px 0 28px -18px` at 16 %), so the work's edge reads as the lower layer; the footer casts none upward.

### 2.6 The dark theme

The same design on deep navy, one variable at a time: the surface is `#0a1119` under glows of `#103a3c` (top right), `#14284f` (bottom left) and `#10304a` (middle); the parts are dark tints (`--head-tint` `rgba(20,35,46,.55)`, `--foot-tint` `rgba(16,28,38,.62)`, the places 80 % to 70 % of `#142a33`, the details `rgba(20,34,45,.5)`); the lines and shapes are `#38bdd8` instead of the blue, at the same strengths; the details' green is `#103a3c`; the divider is `#1f3a4a`. Cards take the dark `shadow-card` (`0 1px 2px` at 40 % black) and the status card its tinted fill.

## 3. The drawn shapes

Every shape is drawn in a variable, as a layer of the part's background, so the whole look is changed in `app.css`. They are fine lines in the accent blue at 6–26 % strength, never filled except for a faint 5 %, and each sits where there is room.

- **The places.** A dot matrix, dots 14 px apart, coming down from the top of the panel and fading out by 230 px. At its foot, 150 px high, the routing of a board: three traces with chamfered corners and four small round nodes (white, with a blue ring).
- **The work, top right.** A honeycomb of nine hexagonal cells in the corner, three faintly filled, fading out from the corner.
- **The work, foot.** A system diagram: four traces with 45° bends joined by round nodes, one with a dashed connector, 230 px high and clipped where the work is narrower; and at the bottom right the arcs of a radar, three quarter circles at 10 %, 8 % and 6 %.
- **The details.** No lines. One soft green rises from the bottom right corner, a 340 × 300 px ellipse of the surface's mint fading to nothing at 72 %, and the panel's left edge is a hairline that fades at both ends.
- **The header and footer.** The line of section 2.5 and nothing else.
- **Nowhere else.** The cards, the rows, the pictures and the dialogs carry no shapes of their own.

## 4. Type

- **Text:** Plus Jakarta Sans, weights 400 to 800. **File names:** JetBrains Mono, 12 px, weight 500.
- Base size is 14 px with a line height of 1.45.

| Use | Size / weight |
| --- | --- |
| The page's title (_Fresh files_) | 28 px, 700, letter spacing −0.03 em |
| A panel's title (_Jump 3_) | 22 px, 700, letter spacing −0.03 em |
| Status line | 16 px, 600 |
| A card's title | 16 px, 600 |
| Items in the left panel | 15 px, 500 (selected: 600) |
| Body and buttons | 13–14 px, 600–700 |
| A card's date and count, hints | 12–13 px, 400, quiet ink |
| Section heading (_File it to_, _Destinations_) | 11 px, 700, capitals, letter spacing 0.08 em, quiet ink |
| Pills and badges | 11–12 px, 600–700 |

## 5. The window

The window is a header, three columns and a footer. All of it is flush: **there is no gap between parts**; they touch and are told apart by a line or a light shadow.

| Part | Size and position |
| --- | --- |
| Left panel | 264 px wide, from the top of the window to the footer. Carries the brand at its top |
| Header | 56 px high, to the right of the left panel, over the work and the details |
| Work | the rest of the width, between the header and the footer; 28 px padding |
| Details | 338 px wide, from the header to the footer; its picture touches the header |
| Footer | 30 px high, the full width |

A narrower window folds the details into a drawer as before (RULES.md, _The board_); the drawer takes the details' look. In SkyDock's own window, when it is not maximised, the whole is drawn with the one corner (10), clear at its corners.

### 5.1 Header

- **Left:** _Scan_ (a refresh icon and its word), a hairline divider, then the list and grid view buttons. The active one has the accent-soft fill and accent icon.
- **Centre:** the search field, 330 × 36, in white at 70 % with a search icon, _Find anything_ and a small white _Ctrl F_ key.
- **Right:** the keyboard-shortcuts and options icons, then the details-panel button, active when the panel is open.
- Header buttons are 34 px high, no outline.

### 5.2 Left panel

- **Brand:** a 32 px tile in the accent gradient with a white mark, then _SkyDock_ in 18 px, 800. The row is 56 px high, level with the header.
- **Sections** (_Work_, _Destinations_, _Montages_, _Elsewhere_): a small capital heading, then its items.
- **Item:** 42 px high, a 30 px icon tile at the left (white, accent icon), the name, and a badge at the right when there is something to say.
- **Selected item:** a white card with `shadow-card`, the name in bold, and its icon tile turned solid accent with a white icon.
- **Badges:** a count is a solid accent pill with white text; _new_ is a white pill with accent text.
- **Add a destination…:** a 38 px button with a dashed accent outline and a white fill, accent-dark text, a plus icon, centred.
- **Empty section:** a quiet one-line item with its icon (_No montage yet_).
- **Bottom:** the routing of section 3, and nothing else.

### 5.3 Work

1. **Page head.** A 48 px white tile with `shadow-card` and the accent icon — the same family as the buttons beside it — the title and its one-line description, and at the right a _Search_ button and a _more_ button.
2. **Status card.** At least 64 px high, white, a hairline outline. A round chevron, a 16 px sentence on where things stand, and a quiet line under it. It never takes a colour of its own.
3. **Jump cards** (section 6), three across with a 14 px gap.
4. **The open jump's heading:** its name in bold and a quiet pill saying what it holds.
5. **File rows** (section 7).

The _Search_ and _more_ buttons are the same family as every other button: white, `shadow-card`, accent-coloured icon and text. Both are 42 px high; _more_ is square, with the one corner, and three dots.

### 5.4 Details

From the top down:

1. **The picture** (section 6.2): 206 px high, edge to edge, no margin, no border, no rounded corners. It touches the header above it and the work beside it. There is no close button on it: the header's details button opens and closes the panel.
2. **Who:** a small capital line (_Jump · 26 September 2026_), the name at 22 px, and what it holds.
3. **File it to:** one white button per destination (section 8).
4. **Or make it a film:** the main button, and a hint under it.
5. **Starts:** a white box, 22 px time, date and _click to correct_ beside it.
6. **Foot:** _Select its n files_ and _Delete jump_, both white with `shadow-card` (the second with red text), pinned to the bottom of the panel.

Text sits 24 px from the panel's sides. The soft green of section 3 rises behind the foot, and the buttons stay opaque on it.

## 6. Pictures of files

### 6.1 The jump card

A white card with `shadow-card`, the one corner, 150 px high.

- **Top, 88 px:** a strip of its files' pictures (section 6.3).
- **Bottom:** the name (16 px, 600) and under it the date, time and file count in quiet 12 px, with the amber _to file_ pill at the right.
- **Selected:** the pick ring of section 2.5. The other cards have only their light shadow.

### 6.2 The picture at the top of the details

The same growing slices at full size: up to five across the panel's width and 206 px high, each wider than the one before, growing by 0.2 of the first's width instead of the card's 0.4 so the large picture stays even. A blurred, darkened copy of the first file's picture sits under them so a gap never shows a flat colour.

The app shows one slice per file up to five; when there are more files than that, the last slice carries a small dark pill, _+n_, for the rest.

### 6.3 Growing slices — how they are drawn

- Slices lean left by 14° (`skewX(-14deg)`); the picture inside each is skewed back by 14° so it stays upright.
- They go left to right in the order the files were shot, and each is wider than the one before: their visible widths are in the proportion 1 : 1.4 : 1.8 : 2.2 : 2.6, shared out over the strip's width.
- Each slice is drawn over the one before it and casts a thin shadow to its left, `-5px 0 10px` in a dark blue at 38 % (`-6px 0 14px` at 40 % in the panel's large picture). That shadow is what makes the edges read as layers.
- Each slice is 34 px wider than its visible part, so it overlaps the next and there is never a gap.
- Never a border or a white outline round a slice. A slice that cannot show its picture shows a blue fill (`#a6d8f6`).

## 7. File rows

- The same row, `FileRow`, in every list of files — a destination's, a montage's, the bin's, a camera's, the storage's, the compare dialog's. There is no flatter variant for a card of rows.
- 66 px high, white, with `shadow-card`, the one corner, 12 px padding at the left and 20 at the right.
- **Picked:** the fill turns accent-soft and the box takes the pick blue with a white tick (`border-pick bg-pick`). **Looked at** (the file open in the preview, or the one taken in the compare dialog): accent-soft with a 2 px ring in the pick blue.
- At the left a tick box: 20 px, a 2 px light-blue ring (`#86bfe6`) and no fill.
- Then the picture: 64 × 44.
- Then the file's name in mono, and under it its time, its size and its proxy in quiet 12 px.
- At the right its state as a pill: amber _Local_ with its dot.

## 8. Buttons and pills

All buttons use the one corner (10) — not a pill — unless stated, are **opaque** white, and are lifted by `shadow-card`. The accent is for the icon and the word; the fill stays white. A button that is only an outline (_Add a destination…_) is white inside it too.

| Button | Look |
| --- | --- |
| Ordinary (_Search_, _Select its files_) | White, accent-dark text, 700; 34–42 px high |
| Icon button | square, white, accent icon |
| Destination | 46 px white; at the left a 30 px accent-soft disc with a folder icon, the name in bold, at the right a 28 px accent-soft disc with a chevron |
| The main button (_Make a montage…_) | 48 px in the accent gradient, white 700 text at the left, a white-at-28 % disc with a chevron at the right, a blue glow |
| Letting go (_Delete jump_) | the ordinary button with red text, white like the rest; never filled red |
| Pill (state: _to file_, _Local_, _processed_, _uploaded_) | white with a hairline ring, 24 px high (22 on a card), radius 99, 12 px / 600; the state's colour only in its word and its dot — amber for local, blue for processed, green for uploaded |
| Hover | a white button takes the accent-soft fill |
| Tabs (_Local_ / _On the storage_, _All_ / _Videos_ / _Photos_) | a fully round track in the well colour with a faint inset shadow, 40 px high with 4 px inside; the chosen tab is a white pill with `shadow-card` and accent-dark text, the others quiet with a white 60 % wash on hover |

There is one main button on a screen at most. Everything that is not the next step is white.

## 9. Icons

Outline icons on a 24 px grid, 1.9 px stroke, round caps and joins, `currentColor`. They sit at 15–18 px in toolbars and lists, 20 px for the round buttons. An icon in a tile takes the accent colour; on a solid accent tile it is white.

## 10. Spacing

The base unit is 4 px. Panel padding is 24–28 px; the gap between cards is 14 px; rows are 8 px apart; a heading sits 16 px above its content and 8 px over it. Corners: one, 10, on cards, rows, the status card, the left panel's items and buttons alike; state pills fully round.

## 11. What not to do

- No grey fill on a tab, an icon tile or a note: use the light blue well or a white tile.
- No border or white outline round a picture.
- No gap between the parts of the window, and no heavy outline round one: a plain line, a hairline that fades, or a light shadow.
- No heavy shadow. The strongest in the whole design is a card's lift (`shadow-card`, 9 %).
- No shape other than the ones of section 3, and none in a card, a row or a dialog.
- No transparency on a button: it is opaque white.
- No second accent colour. Amber and red say something, and are used only for that.
- No filled red button, and no more than one filled button on a screen.
- No rounded corners on the details' picture, and no margin round it.
- No selectable text. The app's words are not picked up by a drag; only what is written in a field can be selected; what has to be copied is copied with a button.
- No value written in a component: not a pixel size, not a hex, not a drawn shape. Name the variable.

## 12. Known gaps

- **Contrast.** The quiet ink is `#4a7090` and the main button's fill `#1a8be0 → #0b72c8` for it. White text on the lighter end of that gradient is about 4 : 1, a little under the 4.5 : 1 for small text. A darker fill would pass without changing the look much.
- **Other pages.** A montage, a dropzone, a camera and the dialogs take the new surface, parts and shapes through the shared classes, but were not each drawn on the canvas.
- **Narrow windows and the drawer** are described but not drawn.
- **Motion.** Not designed; the app's current transitions are kept.
