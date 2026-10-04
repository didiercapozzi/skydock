const escapeText = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const escapeAttribute = (text: string) => escapeText(text).replace(/"/g, '&quot;')

const BLOCKS = new Set([
  'P',
  'DIV',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'BLOCKQUOTE',
  'PRE',
  'SECTION',
  'ARTICLE',
  'HEADER',
  'FOOTER',
  'TABLE',
  'TR'
])

const DROPPED = new Set([
  'SCRIPT',
  'STYLE',
  'TEMPLATE',
  'HEAD',
  'TITLE',
  'META',
  'LINK',
  'IFRAME',
  'OBJECT'
])

const safeHref = (href: string | null) =>
  href && /^(https?:|mailto:)/i.test(href.trim()) ? href.trim() : null

const inline = (node: Node): string => {
  if (node.nodeType === Node.TEXT_NODE) return escapeText(node.textContent ?? '')
  if (!(node instanceof Element) || DROPPED.has(node.tagName)) return ''
  const inner = [...node.childNodes].map(inline).join('')
  switch (node.tagName) {
    case 'BR':
      return '<br>'
    case 'B':
    case 'STRONG':
      return inner ? `<strong>${inner}</strong>` : ''
    case 'I':
    case 'EM':
      return inner ? `<em>${inner}</em>` : ''
    case 'A': {
      const href = safeHref(node.getAttribute('href'))
      return href && inner ? `<a href="${escapeAttribute(href)}">${inner}</a>` : inner
    }
    default:
      return BLOCKS.has(node.tagName) || node.tagName === 'LI' ? `${inner}<br>` : inner
  }
}

const hasWords = (html: string) => html.replace(/<br>|<[^>]+>|\s|&nbsp;/g, '') !== ''

const paragraph = (html: string) => {
  const trimmed = html.replace(/(<br>)+$/, '')
  return hasWords(trimmed) ? `<p>${trimmed}</p>` : ''
}

const blocksOf = (parent: Node): string[] => {
  const out: string[] = []
  let line = ''
  const flush = () => {
    out.push(paragraph(line))
    line = ''
  }
  for (const node of parent.childNodes) {
    if (node instanceof Element && (node.tagName === 'UL' || node.tagName === 'OL')) {
      flush()
      const items = [...node.children]
        .filter((child) => child.tagName === 'LI')
        .map((li) =>
          [...li.childNodes]
            .map(inline)
            .join('')
            .replace(/(<br>)+$/, '')
        )
        .filter(hasWords)
      if (items.length > 0) {
        const tag = node.tagName.toLowerCase()
        out.push(`<${tag}>${items.map((item) => `<li>${item}</li>`).join('')}</${tag}>`)
      }
    } else if (node instanceof Element && BLOCKS.has(node.tagName)) {
      flush()
      const nested = [...node.children].some(
        (child) => BLOCKS.has(child.tagName) || child.tagName === 'UL' || child.tagName === 'OL'
      )
      if (nested) out.push(...blocksOf(node))
      else out.push(paragraph([...node.childNodes].map(inline).join('')))
    } else line += inline(node)
  }
  flush()
  return out.filter(Boolean)
}

const cleanEmailHtml = (html: string) =>
  blocksOf(new DOMParser().parseFromString(html, 'text/html').body).join('')

export { cleanEmailHtml }
