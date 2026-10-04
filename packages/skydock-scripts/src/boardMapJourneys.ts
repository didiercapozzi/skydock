type Journey = {
  title: string
  said: string
  uses: string[]
  drawn: string
}

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
    title: 'A montage',
    said: 'One name is one folder, and the edit is the one thing that cannot be made again — which is why a montage with a project stops accepting changes.',
    uses: ['save-groups', 'process', 'montage', 'upload-montage', 'mark-emailed', 'free-montage'],
    drawn: `flowchart LR
  jump[a jump] -->|save-groups| pax[filed under a passenger]
  pax -->|process| copies[copies in their folder]
  copies -->|montage| project[an editing project]
  project -->|the editor, by hand| film["the film, rendered"]
  film -->|upload-montage| storage[("their folder, and the backup")]
  storage -->|mark-emailed| told(["told, with their link"])
  storage -->|free-montage| room([room back])`
  },
  {
    title: 'Taking something back',
    said: 'Everything goes back one step at a time, and only a loose file in Fresh files — with nowhere further back to go — is ever offered the bin.',
    uses: ['reset-montage', 'delete-montage', 'delete-jump', 'move-files', 'trash-unsorted'],
    drawn: `flowchart LR
  pax[a montage] -->|reset-montage| before[back to before processing]
  pax -->|delete-montage| loose[loose in Fresh files]
  jump[a jump] -->|delete-jump| loose
  filed[a filed file] -->|move-files| loose
  loose -->|trash-unsorted| bin[("the bin, never emptied")]`
  }
]

const journeysAdrift = (named: string[]) =>
  JOURNEYS.flatMap((journey) =>
    journey.uses
      .filter((use) => !named.includes(use))
      .map((use) => `the journey “${journey.title}” names ${use}, which nothing can be asked for`)
  )

export { JOURNEYS, SPINE, journeysAdrift }
