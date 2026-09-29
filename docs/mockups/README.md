# SkyDock redesign mockups

These mockups show a new look for SkyDock with the same features: nothing is added or removed.
They are static pages, and none of the app's code uses them. Open any `.html` file in a browser
to see it. The fonts come from Google Fonts, so they need a network connection. Each version also
has a `screens/` folder with pictures of every page at 1440×900.

The same screens are on the design canvas at
https://claude.ai/artifact/Xea6NY8WUhxsqX5W3YFRan.

## Studio: the current direction

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

## Earlier versions

These are kept for reference only.

- `earlier/studio-web/` is Studio before it was drawn as a desktop window. It has a web-style
  header and no status bar.
- `earlier/logbook/` is a warm-paper design with a serif. It was set aside as not professional
  enough.

The first three rounds (the first colours, "Light", and "Clear air") were only drawn on the
canvas. They were never saved as files, so they are not in this folder.

`images/` holds the footage stills that every version uses. They are drawn, not real footage.
