/* What the preview chapters (d-preview, d-screen, d-jump) guard: each RULES.md feature, by the title of the
   chapter that walks it. What needs SkyDock’s own window (A window of its own) is the window chapters’. */

const covers: Record<string, string[]> = {
  'Cropping and turning': [
    'opens a clip already trimmed where its trim starts, and the next clip on its own trim',
    'cuts a rectangle out of the picture by dragging a corner, keeping the shape the clip has',
    'turns a clip a quarter at a time with the button or R, a half turn, and back to as shot, the picture following',
    'takes the whole screen for the picture with the button, F or a double-click, and Escape comes back to the dialog'
  ],
  'Full screen': [
    'takes the whole screen for the picture with the button, F or a double-click, and Escape comes back to the dialog',
    'opens full screen on the small copy of a clip, and switches to the file itself and back with Proxy and Original',
    'gives a clip that is its own small copy no choice to make full screen',
    'shows a photo full screen at its own size, with no small copy to choose'
  ],
  "In the machine's own player": [
    'hands the clip itself to whatever plays videos, nothing copied or converted first'
  ],
  Trimming: [
    'opens a clip already trimmed where its trim starts, and the next clip on its own trim',
    'copies a clip that is only trimmed, losing nothing: the same pictures with the ends cut off'
  ],
  'Trimming to the jump': [
    'trims a clip to its jump in one press: from the exit, a second early, to eight seconds after the ground',
    'files the jump into Sion and makes the copy of the trimmed clip from the exit to the end of the jump, a clip with no exit whole'
  ],
  Framing: [
    'cuts a rectangle out of the picture by dragging a corner, keeping the shape the clip has',
    'gives the rectangle other shapes, and a free one',
    'opens a clip again with its rectangle where it was saved and its shape marked, and the next clip whole'
  ],
  'Landscape, blurred sides': [
    'leaves a clip already landscape as it is when asked for blurred sides',
    'delivers an upright clip as a landscape one, its sides filled with the picture blurred',
    'puts the clip back whole with Reset: no turn, no blurred sides, and the copy is as shot again'
  ],
  Turning: [
    'turns a clip a quarter at a time with the button or R, a half turn, and back to as shot, the picture following',
    'saves the turn, makes the copy out of date, and encodes the clip again turned',
    'gives the turn to every clip of the jump in one press',
    'offers a photo only the turn and what is known of it'
  ],
  'What it costs': [
    'copies a clip that is only trimmed, losing nothing: the same pictures with the ends cut off',
    'saves the rectangle, makes the copy out of date, and encodes the clip again at the size it came at',
    'saves the turn, makes the copy out of date, and encodes the clip again turned',
    'turns a photo by the orientation it carries, and no pixel of it is touched'
  ],
  'Leaving with changes not saved': [
    'asks before Escape, a click outside, Cancel, Previous or Next leave, and Keep editing keeps the change',
    'puts everything back when the change is discarded, and keeps it when it is saved on the way out'
  ],
  'What it will weigh': [
    'says what a trim will weigh with a tilde before the copy exists, and the copy’s own size after'
  ],
  'Where the jump is in a clip': [
    'finds the door of a clip off a camera that records what it felt, and flags it on its row',
    'shows the marks on the clip’s timeline and as rows that go to each, the exit a second early on a fun jump',
    'says plainly that a clip off a camera that measures nothing has no exit to hang a cut on',
    'moves the exit by dragging it, and offers to put every mark back where the camera measured them',
    'refuses a mark moved out of the order of a jump, door, opening, canopy, ground'
  ],
  'The jump on a graph': [
    'draws what the camera felt under the timeline, with the least and the most in g',
    'moves the footage to the instant a point on the graph is dragged to, and reads out what it weighed'
  ]
}

export { covers }
