#!/usr/bin/env python3
"""A window to drag a file out of, standing in for the machine's file manager.

SkyDock's own window is drawn by WebKitGTK, and what that engine does with a file dragged onto it
cannot be asked of any browser: a test in Chromium says nothing about it. So the drag is made here,
in the same terms a file manager makes it — one `text/uri-list` target, holding the address of a real
file — and `scripts/try-drop.sh` drags from this window onto SkyDock's and says what came of it.

    drag-source.py <file to offer> [--title TITLE]

The window is plain and green, large enough for a pointer to find, and does nothing but be dragged
from.
"""

import sys
from urllib.parse import quote

import gi

gi.require_version("Gtk", "3.0")
gi.require_version("Gdk", "3.0")
from gi.repository import Gtk, Gdk  # noqa: E402


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        return 2
    path = sys.argv[1]
    uri = "file://" + quote(path)

    window = Gtk.Window(title="Drag from here")
    window.set_default_size(300, 200)
    window.move(0, 0)

    label = Gtk.Label(label="drag me")
    box = Gtk.EventBox()
    box.add(label)
    box.override_background_color(Gtk.StateFlags.NORMAL, Gdk.RGBA(0.2, 0.8, 0.3, 1))
    window.add(box)

    target = Gtk.TargetEntry.new("text/uri-list", 0, 2)
    box.drag_source_set(Gdk.ModifierType.BUTTON1_MASK, [target], Gdk.DragAction.COPY)

    def give(_widget, _context, data, _info, _time):
        data.set_uris([uri])
        print(f"[source] handed over {uri}", flush=True)

    def began(_widget, _context):
        print("[source] the drag began", flush=True)

    box.connect("drag-data-get", give)
    box.connect("drag-begin", began)

    window.connect("destroy", Gtk.main_quit)
    window.show_all()
    print(f"[source] offering {uri}", flush=True)
    Gtk.main()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
