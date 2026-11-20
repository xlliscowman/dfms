import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyContact, validateContact } from './contact.mjs'
import { applyHome, validateHome } from './home.mjs'
import { loadProducts, renderProductDetails, renderProductPage } from './products.mjs'

const root = await realpath(fileURLToPath(new URL('../', import.meta.url)))
const assets = join(root, 'assets')
const dist = join(root, 'dist')
const [catalog, contact, home, files, assetFiles] = await Promise.all([
  loadProducts(root),
  readFile(join(root, 'content', 'contact.json'), 'utf8').then(JSON.parse),
  readFile(join(root, 'content', 'home.json'), 'utf8').then(JSON.parse),
  readdir(root, { withFileTypes: true }),
  readdir(assets, { withFileTypes: true }),
])
validateContact(contact)
validateHome(home, catalog.products)
catalog.home = home

const pages = await Promise.all(files
  .filter(file => file.isFile() && /^(index|(?:cn|en)-[a-z-]+)\.html$/.test(file.name))
  .map(async file => {
    const html = await readFile(join(root, file.name), 'utf8')
    const productPage = renderProductPage(html, file.name, catalog)
    return [file.name, applyContact(applyHome(productPage, file.name, home), file.name, contact, catalog)]
  }))
const details = renderProductDetails(catalog)
pages.push(...Array.from(details, ([name, html]) => [name, applyContact(html, name, contact, catalog)]))

const publicAssets = new Set(assetFiles.filter(file => file.isFile()).map(file => `assets/${file.name}`))
function includeUpload(value, extensions) {
  if (!value) return
  const path = value.trim().replace(/^\//, '')
  if (!/^assets\/uploads\/(?:[^/\\%?#:<>"|*\x00-\x1f]+\/)*[^/\\%?#:<>"|*\x00-\x1f]+$/.test(path)
    || path.split('/').some(segment => segment === '.' || segment === '..')
    || !extensions.test(path)) {
    throw new Error(`媒体路径或文件类型无效：${value}`)
  }
  publicAssets.add(path)
}

const imageExtensions = /\.(?:jpe?g|png|webp|avif)$/i
includeUpload(contact.wechatQr, imageExtensions)
includeUpload(home.image, imageExtensions)
for (const product of catalog.products.filter(product => product.published)) {
  includeUpload(product.image, imageExtensions)
  for (const document of product.documents ?? []) includeUpload(document.file, /\.pdf$/i)
}

const staged = await mkdtemp(join(root, '.dist-build-'))
const output = join(staged, 'site')
const previous = join(staged, 'previous')
let preservePrevious = false
try {
  await mkdir(output)
  for (const [name, html] of pages) {
    if (!/^(index|(?:cn|en)-[a-z0-9-]+)\.html$/.test(name)) throw new Error(`无效页面路径：${name}`)
    const outputHtml = process.env.SITE_PREVIEW === '1'
      ? html.replace('</head>', '<meta name="robots" content="noindex">\n</head>')
      : html
    await writeFile(join(output, name), outputHtml, { flag: 'wx' })
  }
  for (const path of publicAssets) {
    const source = await realpath(join(root, path))
    const assetPath = relative(assets, source)
    if (!assetPath || isAbsolute(assetPath) || assetPath === '..' || assetPath.startsWith(`..${sep}`) || !(await stat(source)).isFile()) {
      throw new Error(`无法发布此媒体：${path}`)
    }
    const target = join(output, path)
    await mkdir(dirname(target), { recursive: true })
    await copyFile(source, target)
  }
  try {
    const entry = await lstat(dist)
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error('dist 必须是本站的普通构建目录')
    await rename(dist, previous)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  try {
    await rename(output, dist)
  } catch (error) {
    try {
      await rename(previous, dist)
    } catch (restoreError) {
      if (restoreError.code !== 'ENOENT') {
        preservePrevious = true
        throw new Error(`构建目录交换失败，旧版保存在 ${previous}`, { cause: restoreError })
      }
    }
    throw error
  }
} finally {
  if (!preservePrevious) await rm(staged, { recursive: true, force: true })
}

console.log(`已生成 ${pages.length} 个静态页面（其中 ${details.size} 个原料详情页）和 ${publicAssets.size} 份公开资源：${dist}`)
