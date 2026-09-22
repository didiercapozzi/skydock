/* Where a file goes, and what moves it.
 *
 * The rules say what the app does and the tables further down say every way it can be asked; this
 * is the shape between the two — a file's life from the moment a camera is plugged in, and then the
 * two or three journeys it can take, one small picture each.
 *
 * These are written here rather than read out of the code, because no code says "this is the
 * important case". What is checked is every name they use: an arrow naming something the board
 * cannot be asked for is said out loud rather than drawn, so a journey cannot quietly go stale
 * while the code moves underneath it.
 */

type Journey = {
  title: string
  said: string
  /* the intents an arrow names, checked against what the board can really be asked for */
  uses: string[]
  drawn: string
}

/* Where everything starts and where it can end, with what a person presses on each arrow. The words
   are the board's own: Scan, Process, Upload, Free. */
const SPINE = `\`\`\`mermaid
flowchart TB
  camera(["a camera, plugged in"]) -->|copied off by itself| originals["the originals<br/>one folder per day"]
  originals -->|Scan| jumps["jumps<br/>files shot close together"]
  jumps -->|dragged onto a dropzone| dz[a dropzone]
  jumps -->|dragged onto a passenger| pax[a passenger]
  dz -->|Process| copies["the copies<br/>renamed, cropped, turned"]
  pax -->|Process| paxcopies["the copies<br/>in their own folder"]
  paxcopies -->|Montage, then the editor| film[the film]
  copies -->|Upload| storage[(the storage)]
  film -->|Upload| storage
  storage -->|Email| told(["the passenger has their link"])
  storage -->|Free| room(["room back on this machine"])
\`\`\``

const JOURNEYS: Journey[] = [
  {
    title: 'A day at a dropzone',
    said: 'Nobody in particular owns these jumps, so the files go into the dropzone’s folder as they are — no folder per jump, videos and photos together.',
    uses: ['save-groups', 'process', 'upload-group', 'free-dropzone'],
    drawn: `flowchart LR
  jumps["the day's jumps"] -->|save-groups| dz[filed at the dropzone]
  dz -->|process| copies["copies, named for the place and the time"]
  copies -->|upload-group| storage[("the dropzone's folder")]
  storage -->|free-dropzone| room([room back])`
  },
  {
    title: 'A passenger’s tandem',
    said: 'One passenger is one folder, and the edit is the one thing that cannot be made again — which is why a tandem with a project stops accepting changes.',
    uses: ['save-groups', 'process', 'montage', 'upload-tandem', 'mark-emailed', 'free-tandem'],
    drawn: `flowchart LR
  jump[a jump] -->|save-groups| pax[filed under a passenger]
  pax -->|process| copies[copies in their folder]
  copies -->|montage| project[an editing project]
  project -->|the editor, by hand| film["the film, rendered"]
  film -->|upload-tandem| storage[("their folder, and the backup")]
  storage -->|mark-emailed| told(["told, with their link"])
  storage -->|free-tandem| room([room back])`
  },
  {
    title: 'Taking something back',
    said: 'Everything goes back one step at a time, and only a loose file in Fresh files — with nowhere further back to go — is ever offered the bin.',
    uses: ['reset-tandem', 'delete-tandem', 'delete-jump', 'move-files', 'trash-unsorted'],
    drawn: `flowchart LR
  pax[a tandem] -->|reset-tandem| before[back to before processing]
  pax -->|delete-tandem| loose[loose in Fresh files]
  jump[a jump] -->|delete-jump| loose
  filed[a filed file] -->|move-files| loose
  loose -->|trash-unsorted| bin[("the bin, never emptied")]`
  }
]

/* Anything an arrow names that the board cannot be asked for. A journey is only worth drawing while
   it is still true. */
const journeysAdrift = (named: string[]) =>
  JOURNEYS.flatMap((journey) =>
    journey.uses
      .filter((use) => !named.includes(use))
      .map((use) => `the journey “${journey.title}” names ${use}, which nothing can be asked for`)
  )

export { JOURNEYS, SPINE, journeysAdrift }
export type { Journey }
