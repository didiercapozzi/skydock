# TODO

## Rework the kdenlive template process

The montage now writes a project kdenlive can open, but the way templates themselves are supplied,
chosen and checked is still the weak part. Three things found while getting the first real tandem
through show why.

**The committed default template is incomplete.** `templates/tandem.kdenlive` references four files
that were never committed beside it:

```
template files/ASHUTOSH - Destiny.mp3
template files/Sky_MBB_&_ASHUTOSH_…mp3
template files/logo-epco.png
epco template files/romandieparachutisme.kdenlivetitle
```

Any montage that falls back to it opens with no music, no logo and a broken title. That is exactly
what happened to the first real tandem, because there was no `output/templates/` for it to find.
Decide one of: commit the assets alongside it, ship no default at all and refuse until a template is
installed, or keep it as a deliberately bare "no branding" template and say so. Refusing is probably
right — a default nobody chose is how someone's branding goes out by accident.

**A template can be for a different kdenlive than the one in use.** The committed template is MLT
7.18 / kdenlive 23.08; the machine that will edit runs 26.04.3. It opened, but nothing checks, and a
template written by a much newer kdenlive against a much older one is the kind of thing that fails
confusingly. Worth reading the version out of the template and saying something when it is far from
the editor's.

**Installing a template is still a manual folder copy.** It works, and it is easy to get subtly
wrong. Build the import:

- Accept a kdenlive **Archive Project** bundle (`.tar.gz` or `.zip`) rather than a hand-made zip.
  File → Archive Project collects every asset the project actually uses, including the images inside
  title clips — which are referenced by absolute path in the escaped XML of the clip and are the ones
  a hand-made zip silently leaves behind.
- Extract to `output/templates/{name}/`, rewrite the asset paths, and **validate that every file the
  project references exists, refusing the upload and naming any that do not**. The montage already
  reports missing files after the fact; the import should stop them getting in.

Then the rest of what a template needs:

- **Choose one per tandem.** The montage already accepts a template name and records which one it
  used, so the group can be re-montaged the same way. There is no picker yet — add one to the tandem
  row, defaulting to the last used.
- **Record what a template is** in a small `template.json` written at import: display name, the video
  track detection resolved to a number, the render profile, the kdenlive version it came from.
- **A default template per dropzone**, once two dropzones actually differ. Not before.

### Still unverified

The render destination is written into the project as `kdenlive:docproperties.renderurl` and
`renderprofile`. That kdenlive pre-fills its render dialog from those in a project it did not itself
write is inferred from a real saved project, not tested — kdenlive is not installed in the
devcontainer. Confirm it once by hand; if it does not, the project and the film share a name in one
folder, so kdenlive's own default already lands in the right place.

### Deferred

**Pre-generate the proxies.** kdenlive transcodes every GoPro clip on first open, which is a long
wait before any editing starts. SkyDock could produce them in advance with the template's own proxy
settings and point `kdenlive:proxy` at them. Worth its own change once the template process is
settled.

## Done

- **Montage, delivery and the board's tandem row** — process, write the project, deliver the film and
  photos to the passenger and the rushes to a backup folder.
