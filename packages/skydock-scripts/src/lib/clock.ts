/* Times written into names, where they have to sort and have to be read by a person.

   The app writes a moment into a filename in two places that must agree — the bin a freed file is
   moved aside into, and the copies kept of every editing project — because both are read by
   somebody looking for "the one from just before I broke it". Written twice they would drift the
   first time either was touched. */

/* two digits, which is what every part of a written time is */
const two = (n: number) => String(n).padStart(2, '0')

/* A moment, in this machine's own time rather than UTC: whoever reads it is standing where it was
   written. Sorts as it reads, and holds no character a filesystem objects to — which is why the
   time is joined by dashes rather than by the colons a clock uses. */
const stampOf = (at: Date) =>
  `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}T${two(at.getHours())}-${two(at.getMinutes())}-${two(at.getSeconds())}`

export { stampOf, two }
