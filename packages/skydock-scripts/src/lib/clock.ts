const two = (n: number) => String(n).padStart(2, '0')

const stampOf = (at: Date) =>
  `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}T${two(at.getHours())}-${two(at.getMinutes())}-${two(at.getSeconds())}`

export { stampOf, two }
