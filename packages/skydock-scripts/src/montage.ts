import * as fs from 'node:fs'
import * as path from 'node:path'
import * as url from 'node:url'
import { randomUUID } from 'node:crypto'
import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser'
import { z } from 'zod'
import { toHostPath } from './hostPath'
import {
  assetsIn,
  attrsOf,
  childrenOf,
  encodeXml,
  fpsOf,
  nodeById,
  propOf,
  setProp,
  tagOf,
  textOf,
  walkAssets,
  xmlDocumentSchema,
  XML_OPTIONS
} from './lib/mlt'
import type { XmlNode } from './lib/mlt'
import { walkFiles } from './lib/fs'
import { marksFor } from './montageMarks'
import { jumpMomentsSchema } from './types'

const montageClipSchema = z.object({
  path: z.string(),
  proxy: z.string().optional(),
  seconds: z.number().optional(),
  moments: jumpMomentsSchema.nullable().optional(),
  cropStart: z.number().nullable().optional()
})

const montageOptionsSchema = z.object({
  groupDir: z.string(),
  outputDir: z.string(),
  baseName: z.string(),
  title: z.string(),
  clips: z.array(montageClipSchema),
  photos: z.array(z.string()).default([]),
  template: z.string().optional(),
  templatePath: z.string().optional()
})

const PHOTO_SECONDS = 5

type MontageClip = z.infer<typeof montageClipSchema>
type MontageOptions = z.input<typeof montageOptionsSchema>

const RENDER_PROFILE = 'MP4-H264/AAC'

const repoTemplateDir = () => {
  const told = process.env.SKYDOCK_TEMPLATES_DIR?.trim()
  if (told) return told
  return path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..', '..', '..', 'templates')
}

const templatesIn = (dir: string) => {
  const kdenliveIn = (folder: string) =>
    fs
      .readdirSync(folder, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.kdenlive'))
      .map((e) => path.join(folder, e.name))
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .flatMap((entry) => {
        if (entry.name.startsWith('.')) return []
        if (entry.isFile() && entry.name.endsWith('.kdenlive'))
          return [{ name: entry.name.replace(/\.kdenlive$/, ''), path: path.join(dir, entry.name) }]
        if (!entry.isDirectory()) return []
        const found = kdenliveIn(path.join(dir, entry.name))[0]
        return found ? [{ name: entry.name, path: found }] : []
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
}

const listMontageTemplates = (outputDir: string) => templatesIn(path.join(outputDir, 'templates'))

const availableTemplates = (outputDir: string) => {
  const own = listMontageTemplates(outputDir)
  return own.length > 0 ? own : templatesIn(repoTemplateDir())
}

const DEFAULT_MARK = '.default'

const defaultTemplate = (outputDir: string) => {
  try {
    return fs.readFileSync(path.join(outputDir, 'templates', DEFAULT_MARK), 'utf-8').trim() || null
  } catch {
    return null
  }
}

const resolveTemplate = (options: z.infer<typeof montageOptionsSchema>) => {
  if (options.templatePath) return options.templatePath
  const available = availableTemplates(options.outputDir)
  if (options.template) {
    const chosen = available.find((t) => t.name === options.template)
    if (!chosen)
      throw new Error(
        `No montage template named ${options.template} in ${options.outputDir}/templates`
      )
    return chosen.path
  }
  const configured = process.env.SKYDOCK_MONTAGE_TEMPLATE
  if (configured && fs.existsSync(configured)) return configured
  const usual = available.find((t) => t.name === defaultTemplate(options.outputDir))
  if (usual) return usual.path
  if (available.length === 1) return available[0].path
  if (available.length > 1)
    throw new Error(`Choose a montage template: ${available.map((t) => t.name).join(', ')}`)
  throw new Error(`No montage template found — add one under ${options.outputDir}/templates`)
}

const assetLocator = (template: string, mltNode: XmlNode) => {
  const recordedRoot = attrsOf(mltNode)['@_root']
  const templateDir = path.dirname(template)
  const root = recordedRoot && fs.existsSync(recordedRoot) ? recordedRoot : templateDir
  const byName = new Map(
    (fs.existsSync(templateDir) ? walkFiles(templateDir) : []).map((f) => [path.basename(f), f])
  )
  return (asset: string) => {
    const resolved = path.resolve(root, asset)
    return {
      resolved,
      found: fs.existsSync(resolved) ? resolved : (byName.get(path.basename(asset)) ?? null)
    }
  }
}

const readTemplate = (template: string) => {
  const document = xmlDocumentSchema.parse(
    new XMLParser(XML_OPTIONS).parse(fs.readFileSync(template, 'utf-8'))
  )
  const mltNode = document.find((n) => tagOf(n) === 'mlt')
  if (!mltNode) throw new Error(`Template is not an MLT document: ${template}`)
  return { document, mltNode, mlt: childrenOf(mltNode) }
}

const inspectTemplate = (template: string) => {
  const { mltNode, mlt } = readTemplate(template)
  const locate = assetLocator(template, mltNode)
  const bin = nodeById(mlt, 'playlist', 'main_bin')
  const version = bin ? textOf(propOf(bin, 'kdenlive:docproperties.kdenliveversion')) : ''
  const assets = [...new Set(assetsIn(mlt))].map((asset) => ({
    name: path.basename(asset),
    found: locate(asset).found !== null
  }))
  return {
    version: version || null,
    assets,
    missing: assets.filter((a) => !a.found).map((a) => a.name)
  }
}

const createMontageProject = (rawOptions: MontageOptions) => {
  const options = montageOptionsSchema.parse(rawOptions)
  const template = resolveTemplate(options)
  const toHost = (target: string) => encodeXml(toHostPath(target, options.outputDir))

  const { document, mltNode, mlt } = readTemplate(template)
  const locate = assetLocator(template, mltNode)

  const missingAssets: string[] = []
  walkAssets(mlt, (asset) => {
    const { resolved, found } = locate(asset)
    if (!found) missingAssets.push(asset)
    return toHostPath(found ?? resolved, options.outputDir)
  })
  attrsOf(mltNode)['@_root'] = toHost(options.groupDir)
  attrsOf(mltNode)['@_title'] = encodeXml(options.title)

  const bin = nodeById(mlt, 'playlist', 'main_bin')
  if (!bin) throw new Error(`Template has no main_bin: ${template}`)
  const sequence = mlt.find(
    (n) => tagOf(n) === 'tractor' && textOf(propOf(n, 'kdenlive:uuid')) !== ''
  )
  if (!sequence) throw new Error(`Template has no sequence: ${template}`)

  const usedIds = mlt
    .map((n) => Number(textOf(propOf(n, 'kdenlive:id'))))
    .filter((n) => Number.isFinite(n))
  const firstId = Math.max(0, ...usedIds) + 1
  const fps = fpsOf(mlt)

  const chainOf = (clip: MontageClip, id: string, kdenliveId: number) => ({
    chain: [
      { property: [{ '#text': 'pause' }], ':@': { '@_name': 'eof' } },
      {
        property: [{ '#text': toHost(clip.proxy ?? clip.path) }],
        ':@': { '@_name': 'resource' }
      },
      {
        property: [{ '#text': clip.proxy ? toHost(clip.proxy) : '-' }],
        ':@': { '@_name': 'kdenlive:proxy' }
      },
      ...(clip.proxy
        ? [
            {
              property: [{ '#text': toHost(clip.path) }],
              ':@': { '@_name': 'kdenlive:originalurl' }
            }
          ]
        : []),
      { property: [{ '#text': 'avformat' }], ':@': { '@_name': 'mlt_service' } },
      { property: [{ '#text': '1' }], ':@': { '@_name': 'seekable' } },
      {
        property: [{ '#text': encodeXml(path.basename(clip.path)) }],
        ':@': { '@_name': 'kdenlive:clipname' }
      },
      { property: [{ '#text': '0' }], ':@': { '@_name': 'kdenlive:clip_type' } },
      { property: [{ '#text': String(kdenliveId) }], ':@': { '@_name': 'kdenlive:id' } }
    ],
    ':@': { '@_id': id }
  })

  const stillFrames = Math.round(PHOTO_SECONDS * fps)
  const stillOf = (file: string, id: string, kdenliveId: number) => ({
    producer: [
      { property: [{ '#text': String(stillFrames) }], ':@': { '@_name': 'length' } },
      { property: [{ '#text': 'pause' }], ':@': { '@_name': 'eof' } },
      { property: [{ '#text': toHost(file) }], ':@': { '@_name': 'resource' } },
      { property: [{ '#text': '25' }], ':@': { '@_name': 'ttl' } },
      { property: [{ '#text': '1' }], ':@': { '@_name': 'aspect_ratio' } },
      { property: [{ '#text': '1' }], ':@': { '@_name': 'seekable' } },
      { property: [{ '#text': 'qimage' }], ':@': { '@_name': 'mlt_service' } },
      { property: [{ '#text': '1' }], ':@': { '@_name': 'progressive' } },
      {
        property: [{ '#text': encodeXml(path.basename(file)) }],
        ':@': { '@_name': 'kdenlive:clipname' }
      },
      {
        property: [{ '#text': `00:00:${String(PHOTO_SECONDS).padStart(2, '0')}:00` }],
        ':@': { '@_name': 'kdenlive:duration' }
      },
      { property: [{ '#text': '2' }], ':@': { '@_name': 'kdenlive:clip_type' } },
      { property: [{ '#text': String(kdenliveId) }], ':@': { '@_name': 'kdenlive:id' } }
    ],
    ':@': { '@_id': id, '@_in': '0', '@_out': String(stillFrames - 1) }
  })

  const chains = options.clips.map((clip, index) => {
    const id = `chain_skydock_${index}`
    const chain = chainOf(clip, id, firstId + index)
    const seconds = clip.moments ? (clip.seconds ?? null) : null
    const marks = marksFor({
      moments: clip.moments,
      cropStart: clip.cropStart,
      length: seconds === null ? Number.POSITIVE_INFINITY : Math.floor(seconds * fps),
      fps
    })
    if (marks.length > 0) setProp(chain, 'kdenlive:markers', JSON.stringify(marks, null, 4))
    childrenOf(bin).push({ entry: [], ':@': { '@_producer': id } })
    return chain
  })
  const stills = options.photos.map((file, index) => {
    const id = `producer_skydock_photo_${index}`
    childrenOf(bin).push({ entry: [], ':@': { '@_producer': id } })
    return stillOf(file, id, firstId + options.clips.length + index)
  })
  mlt.splice(
    mlt.findIndex((n) => tagOf(n) === 'playlist'),
    0,
    ...chains,
    ...stills
  )

  const uuid = `{${randomUUID()}}`
  setProp(sequence, 'kdenlive:uuid', uuid)
  setProp(sequence, 'kdenlive:sequenceproperties.documentuuid', uuid)
  setProp(bin, 'kdenlive:docproperties.documentid', String(Date.now()))
  setProp(bin, 'kdenlive:docproperties.uuid', uuid)
  setProp(bin, 'kdenlive:docproperties.activetimeline', uuid)
  setProp(bin, 'kdenlive:docproperties.opensequences', uuid)

  const filmPath = path.join(options.groupDir, `${options.baseName}.mp4`)
  setProp(bin, 'kdenlive:docproperties.renderurl', toHost(filmPath))
  setProp(bin, 'kdenlive:docproperties.renderprofile', RENDER_PROFILE)

  const built = z
    .string()
    .parse(
      new XMLBuilder({ ...XML_OPTIONS, format: true, suppressEmptyNode: true }).build(document)
    )
  const xml = built.startsWith('<?xml') ? built : `<?xml version='1.0' encoding='utf-8'?>\n${built}`

  const verdict = XMLValidator.validate(xml)
  if (verdict !== true)
    throw new Error(
      `The montage came out malformed (${verdict.err.msg} at line ${verdict.err.line}). Nothing was written.`
    )

  const projectPath = path.join(options.groupDir, `${options.baseName}.kdenlive`)
  fs.mkdirSync(options.groupDir, { recursive: true })
  fs.writeFileSync(projectPath, xml, 'utf-8')
  return {
    projectPath,
    filmPath,
    template,
    clips: options.clips.length,
    photos: options.photos.length,
    missingAssets: [...new Set(missingAssets)]
  }
}

export {
  availableTemplates,
  createMontageProject,
  defaultTemplate,
  DEFAULT_MARK,
  inspectTemplate,
  listMontageTemplates,
  readTemplate
}
