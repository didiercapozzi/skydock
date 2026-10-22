const exempt: Record<string, string> = {
  'What SkyDock is':
    'the overview of the whole app: it names what the chapters of every part guard, and states no behaviour of its own to walk',
  Principles:
    'the principles the rest of RULES.md is written from (never held, never deleted unasked, nothing leaves the machine unasked): each is walked by the chapter of the feature that keeps it, named in that feature',
  'An overlap is said the same on the video and on the music':
    'the band over an overlap is walked by the editor tests of the film editor, which draw both tracks; the journey does not open the film editor on two overlapping items',
  'A clip forgotten before the edit began is added from the editor':
    'the list of clips, the adding and the states of a clip being prepared are walked by the editor tests of the film editor and by the route tests of the clips and of the import into a montage; the journey does not open the film editor on a montage with a clip still to add',
  'What the film does not use yet is easy to find':
    'the marks, the filter and the button for photos are walked by the editor tests of the film editor; the journey does not open the editor on a montage with photos',
  "What the board did to a clip is the clip; what the editor does is the film's":
    'the length, the small copy, the start and the frame of a clip the board changed are walked by the scripts tests of the montage’s clips and of the render, which cut and render real clips; the journey has no clip changed on the board in its film',
  'A square drawn on the timeline picks what it touches':
    'the square and what it picks are walked by the editor tests of the film editor, which press and drag on the timeline; the journey does not draw one',
  'A montage hands over its origins':
    'what is sent of a file changed on the board and of one left alone is walked by the scripts tests of the upload and of freeing; the journey sends no file the board changed',
  'A montage is finished when the person says so':
    'Done, Reopen and Open its folder are walked by the board tests of a montage set as done and by the route tests of mark-done and open-folder; a chapter of the journey is still to be written, and opening a folder needs the machine’s own file manager, which the journey does not have'
}

export { exempt }
