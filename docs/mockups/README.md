# SkyDock redesign mockups

These mockups show a new look for SkyDock with the same features: nothing is added or removed.
They are static pages, and none of the app's code uses them. Open any `.html` file in a browser
to see it. The fonts come from Google Fonts, so they need a network connection. Each version also
has a `screens/` folder with pictures of every page at 1440×900.

The same screens are on the design canvas at
https://claude.ai/artifact/Xea6NY8WUhxsqX5W3YFRan.

## Studio: the direction the app is drawn in today

`studio/` shows SkyDock as the installed app in its own window.

- **Window:** the desktop draws the title bar, shown here as KDE draws it. Under it are a
  toolbar, three panes side by side (the places, the list, and the open item) and a status bar.
  The status bar shows the storage connection, what is copying or uploading, proxies and zoom.
- **Type:** Inter for everything, and JetBrains Mono for file names.
- **Colour:** neutral greys with one blue for selection and the next action. A file's state is
  a small tinted badge: amber for local, violet for processed and green for uploaded.
- **Dark mode:** the same design in dark (`09-dark`).

| Page                     | What it shows                                       |
| ------------------------ | --------------------------------------------------- |
| `00-the-idea`            | The principles, colours, type and controls          |
| `01-fresh-files`         | The board: Fresh files by jump, one jump open       |
| `02-a-montage`           | A montage whose film is in, with upload next        |
| `03-a-dropzone`          | A dropzone by day, as thumbnails, with three picked |
| `04-trim-frame-turn`     | Trim, frame and turn, with the jump on its graph    |
| `05-overview`            | The overview of every montage                       |
| `06-upload`              | Uploading a montage: the zips, then where it goes   |
| `07-a-camera`            | A camera plugged in, and deleting from it           |
| `08-email-the-link`      | Sending the link: FR/EN/DE, QR code, "Sent it?"     |
| `09-dark`                | The board in dark mode                              |

## Horizon: a new direction, drawn as an installed app

`horizon/` draws SkyDock as the desktop app it is: a real window on a real desktop, with the
system's title bar and panel. Every page comes in a light and a dark version (`-light` and `-dark`),
which are the same design with the same names for everything. It is on the design canvas, light in
the left column and dark in the right, at https://claude.ai/artifact/NHrngyaqa2qDhpTRDG5BVh
(private until shared from its Share menu). Nothing is added or removed.

- **Frame:** under the title bar, three floating islands on a quiet backdrop: the places, the work
  and the details. The status bar sits under them.
- **Photographs lead:** a jump is a photograph with its name on it, a thumbnail is a photograph,
  and a picked selection gets a floating bar. The controls stay small and quiet.
- **Type:** Bricolage Grotesque for titles, Instrument Sans for the interface, and JetBrains Mono
  for file names.
- **Colour:** one ultramarine, for the next action and for what is selected. A file's state is a
  small tinted badge: amber for local, magenta for processed and green for uploaded.

| Page          | What it shows                                                   |
| ------------- | --------------------------------------------------------------- |
| `00-idea`     | The principles, colours, type and controls                      |
| `01-board`    | The board: Fresh files by jump, one jump open, a file's panel   |
| `02-dropzone` | A dropzone by day, as thumbnails, with three picked             |
| `03-montage`  | A montage with its film rendered and the upload next            |
| `04-upload`   | Uploading a montage: the zips, then where it goes               |
| `05-overview` | The overview of every montage                                   |

The pages share `horizon/horizon.css`. The footage stills are in `images/`.

## Canopy: a new direction

`canopy/` draws the same app again, with nothing added or removed. It is on the design canvas at
https://claude.ai/artifact/1nQwWQJUvHXwkL9J8on56y (private until shared from its Share menu).

- **Frame:** a deep ink rail down the left holds the places. The work sits on soft white cards over
  a cool mist, with the details panel on the right and the status bar along the foot.
- **Type:** Manrope for everything, and IBM Plex Mono for file names.
- **Colour:** one warm canopy orange, for the next action and for what is selected. A file's
  state is a small tinted badge: amber for local, violet for processed and green for uploaded.
- **Shapes:** large rounded cards, a pill search field, and segmented controls in place of tabs.
  A zip's contents sit in a dashed box on a tinted ground.
- **Dark mode:** the same design on deep navy (`06-dark`).

| Page               | What it shows                                                  |
| ------------------ | -------------------------------------------------------------- |
| `00-the-idea`      | The principles, colours, type and controls                     |
| `01-fresh-files`   | The board: Fresh files by jump, one jump open, a file's panel  |
| `02-a-dropzone`    | A dropzone by day, as thumbnails, with three picked            |
| `03-a-montage`     | A montage with its film rendered and the upload next           |
| `04-upload`        | Uploading a montage: the zips, then where it goes              |
| `05-overview`      | The overview of every montage                                  |
| `06-dark`          | The board in dark mode                                         |

The pages share `canopy/canopy.css`. The footage stills are in `images/`.

## Earlier versions

These are kept for reference only.

- `earlier/studio-web/` is Studio before it was drawn as a desktop window. It has a web-style
  header and no status bar.
- `earlier/logbook/` is a warm-paper design with a serif. It was set aside as not professional
  enough.

The first three rounds (the first colours, "Light", and "Clear air") were only drawn on the
canvas. They were never saved as files, so they are not in this folder.

`images/` holds the footage stills that every version uses. They are drawn, not real footage.
