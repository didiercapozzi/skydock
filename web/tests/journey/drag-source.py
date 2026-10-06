import os
import sys
from urllib.parse import quote

import gi

gi.require_version("Gtk", "3.0")
gi.require_version("Gdk", "3.0")
from gi.repository import Gdk, Gtk

# What a file manager is to a drop: a window that offers real files, by address, to whatever they are
# dragged onto. The files — or folders, offered by their address just the same — are given as arguments; the window sits where the test says, always on top.
files = sys.argv[3:]
window = Gtk.Window(title="files to drag")
window.move(int(sys.argv[1]), int(sys.argv[2]))
window.set_default_size(320, 110)
window.set_keep_above(True)
window.set_decorated(False)
label = Gtk.Label(label="\n".join(f.rstrip("/").rsplit("/", 1)[-1] + ("/" if os.path.isdir(f) else "") for f in files))
window.add(label)
window.drag_source_set(Gdk.ModifierType.BUTTON1_MASK, [Gtk.TargetEntry.new("text/uri-list", 0, 0)], Gdk.DragAction.COPY)
window.connect("drag-data-get", lambda _w, _c, data, _i, _t: data.set_uris(["file://" + quote(f) for f in files]))
window.connect("destroy", Gtk.main_quit)
window.show_all()
Gtk.main()
