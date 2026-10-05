import { t } from '@lingui/core/macro'
import qrcode from 'qrcode-generator'

/* The link as a QR code, for whoever it is for, standing at the counter to take with their phone before
   the email has even gone (RULES, Sending the link). Drawn square by square, with the quiet margin
   round it a phone's camera needs to find it. */
const ShareQr = ({ url, size = 220 }: { url: string; size?: number }) => {
  const code = qrcode(0, 'M')
  code.addData(url)
  code.make()
  const count = code.getModuleCount()
  const margin = 4
  const whole = count + margin * 2
  const dark: string[] = []
  for (let row = 0; row < count; row++)
    for (let col = 0; col < count; col++)
      if (code.isDark(row, col)) dark.push(`M${col + margin} ${row + margin}h1v1h-1z`)
  return (
    <svg
      role='img'
      aria-label={t`QR code of the link`}
      width={size}
      height={size}
      viewBox={`0 0 ${whole} ${whole}`}
      shapeRendering='crispEdges'
      className='rounded-chip bg-white'>
      <rect
        width={whole}
        height={whole}
        fill='#ffffff'
      />
      <path
        d={dark.join('')}
        fill='#000000'
      />
    </svg>
  )
}

export { ShareQr }
