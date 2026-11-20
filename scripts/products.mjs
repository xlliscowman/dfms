import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const safeId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const uploadPath = /^assets\/uploads\/(?:[^/\\%?#:<>"|*\x00-\x1f]+\/)*[^/\\%?#:<>"|*\x00-\x1f]+$/
const imageExtension = /\.(?:jpe?g|png|webp|avif)$/i
const documentExtension = /\.pdf$/i
const badges = {
  award: { cn: '获奖', en: 'Award' },
  pat: { cn: '专利', en: 'Patent' },
  new: { cn: 'NEW', en: 'NEW' },
}
const copy = {
  cn: {
    suffix: 'Zh',
    company: '东方淼森',
    heroTitle: count => `${count} 款原料，<br>两条路。`,
    categoryHeading: count => `${count} 个功效方向`,
    catalogueNote: (products, entries) => `点开任意一类查看原料。共 ${products} 款原料，${entries} 条分类展示。`,
    categoryCount: count => `${count} 类`,
    plantHeading: count => `${count} 种植物来源`,
    plantCount: count => `${count} 种`,
    productCount: count => `${count} 款`,
    plantLegend: count => `当前索引收录 ${count} 种植物来源。`,
    plantEmpty: '原料整理中',
    categoryEmpty: '该分类暂无上架原料。',
    expand: '展开',
    close: '收起',
    back: '返回原料目录',
    sample: '申请样品',
    requestData: '咨询技术资料',
    detailInfo: '原料资料',
    category: '功效方向',
    plant: '植物来源',
    origin: '来源 / 体系',
    documents: '公开资料',
  },
  en: {
    suffix: 'En',
    company: 'Miusenphytech',
    heroTitle: count => `${count} ingredients, two ways in.`,
    categoryHeading: count => `${count} benefit categories`,
    catalogueNote: (products, entries) => `Open a category to explore its ingredients. ${products} ingredients across ${entries} category listings.`,
    categoryCount: count => count === 1 ? '1 category' : `${count} categories`,
    plantHeading: count => `${count} plant sources`,
    plantCount: count => count === 1 ? '1 plant' : `${count} plants`,
    productCount: count => count === 1 ? '1 product' : `${count} products`,
    plantLegend: count => `The index covers ${count} plant sources.`,
    plantEmpty: 'In development',
    categoryEmpty: 'No published ingredients in this category.',
    expand: 'Open',
    close: 'Close',
    back: 'Back to ingredients',
    sample: 'Request a sample',
    requestData: 'Ask for technical data',
    detailInfo: 'Ingredient information',
    category: 'Benefits',
    plant: 'Plant sources',
    origin: 'Source / system',
    documents: 'Public documents',
  },
}

function fail(context, message) {
  throw new Error(`${context}: ${message}`)
}

function isRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function readJson(file) {
  return readFile(file, 'utf8').then(contents => {
    try {
      return JSON.parse(contents)
    } catch (error) {
      throw new Error(`${file}: invalid JSON`, { cause: error })
    }
  })
}

function validateText(entry, fields, context, required = false) {
  for (const field of fields) {
    const value = entry[field]
    if ((!required && value === undefined) || (typeof value === 'string' && (!required || value.trim()))) {
      continue
    }
    fail(context, `${field} must be ${required ? 'nonempty ' : ''}text`)
  }
}

function validateList(value, accepts, field, context, required = false) {
  if (value === undefined && !required) return
  if (!Array.isArray(value) || value.some(entry => typeof entry !== 'string' || !accepts(entry))
    || new Set(value).size !== value.length) {
    fail(context, `${field} has invalid or duplicate entries`)
  }
}

function validateUpload(path, extension, field, context) {
  if (typeof path !== 'string') fail(context, `${field} must be an uploaded media path`)
  const relative = path.replace(/^\//, '')
  if (!uploadPath.test(relative) || !extension.test(relative)
    || relative.split('/').some(segment => segment === '.' || segment === '..')) {
    fail(context, `${field} must refer to a supported file under assets/uploads/`)
  }
}

function validateTaxonomy(taxonomy) {
  if (!isRecord(taxonomy)) fail('taxonomy.json', 'must contain an object')
  const ids = {}
  for (const group of ['categories', 'plants']) {
    if (!Array.isArray(taxonomy[group])) fail('taxonomy.json', `missing ${group} list`)
    ids[group] = new Set()
    for (const entry of taxonomy[group]) {
      const context = `taxonomy.json ${group}/${entry?.id}`
      if (!isRecord(entry) || typeof entry.id !== 'string' || !safeId.test(entry.id) || ids[group].has(entry.id)) {
        fail(context, 'invalid or duplicate ID')
      }
      ids[group].add(entry.id)
      validateText(entry, ['nameZh', 'nameEn'], context, true)
      validateText(entry, ['descriptionZh', 'descriptionEn', 'label', 'latin'], context)
      validateList(entry.productOrder, value => safeId.test(value), 'productOrder', context)
      for (const field of ['aliasesZh', 'aliasesEn']) {
        validateList(entry[field], value => value.trim().length > 0, field, context)
      }
    }
  }
  if (!ids.categories.size) fail('taxonomy.json', 'at least one benefit category is required')
  validateList(taxonomy.blendOrder, value => safeId.test(value), 'blendOrder', 'taxonomy.json')
  return ids
}

function validateProduct(product, file, ids) {
  if (!isRecord(product) || typeof product.id !== 'string' || !safeId.test(product.id)
    || `${product.id}.json` !== file) {
    fail(file, 'product ID must match its filename')
  }
  if (typeof product.published !== 'boolean') fail(file, 'published must be true or false')
  for (const flag of ['reviewed', 'blend']) {
    if (product[flag] !== undefined && typeof product[flag] !== 'boolean') fail(file, `${flag} must be true or false`)
  }
  validateText(product, ['inci', 'originZh', 'originEn', 'image'], file)
  validateText(product, ['nameZh', 'nameEn', 'summaryZh', 'summaryEn'], file, product.published)
  validateList(product.categories, id => ids.categories.has(id), 'categories', file, product.published)
  validateList(product.plants, id => ids.plants.has(id), 'plants', file)
  validateList(product.badges, badge => Object.hasOwn(badges, badge), 'badges', file)
  if (product.published && !product.categories.length) fail(file, 'published products require a benefit category')
  if (product.image) validateUpload(product.image, imageExtension, 'image', file)
  if (product.documents !== undefined && !Array.isArray(product.documents)) fail(file, 'documents must be a list')
  for (const document of product.documents ?? []) {
    if (!isRecord(document)) fail(file, 'invalid document')
    validateText(document, ['labelZh', 'labelEn'], file, true)
    validateUpload(document.file, documentExtension, 'document.file', file)
  }
  if (product.categorySummaries !== undefined && !Array.isArray(product.categorySummaries)) {
    fail(file, 'categorySummaries must be a list')
  }
  const summarized = new Set()
  for (const entry of product.categorySummaries ?? []) {
    if (!isRecord(entry) || !product.categories?.includes(entry.category) || summarized.has(entry.category)) {
      fail(file, 'categorySummaries has an invalid or duplicate category')
    }
    summarized.add(entry.category)
    validateText(entry, ['summaryZh', 'summaryEn'], file)
    if (!entry.summaryZh?.trim() && !entry.summaryEn?.trim()) {
      fail(file, 'categorySummaries requires a summary in at least one language')
    }
  }
}

export async function loadProducts(rootPath) {
  const contentPath = join(rootPath, 'content')
  const productsPath = join(contentPath, 'products')
  const [taxonomy, entries, cn, en] = await Promise.all([
    readJson(join(contentPath, 'taxonomy.json')),
    readdir(productsPath, { withFileTypes: true }),
    readFile(join(rootPath, 'cn-ingredients.html'), 'utf8'),
    readFile(join(rootPath, 'en-ingredients.html'), 'utf8'),
  ])
  const ids = validateTaxonomy(taxonomy)
  const files = entries.filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(entry => entry.name)
    .sort()
  const products = await Promise.all(files.map(async file => {
    const product = await readJson(join(productsPath, file))
    validateProduct(product, file, ids)
    return product
  }))
  return { products, taxonomy, templates: { cn, en } }
}

function escapeHtml(value) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return value.replace(/[&<>"']/g, character => entities[character])
}

function text(entry, field, lang) {
  return escapeHtml(entry[field + copy[lang].suffix] ?? '')
}

function productPage(lang, id) {
  return `${lang}-product-${id}.html`
}

function uploadedUrl(path) {
  return path.replace(/^\//, '').split('/').map(encodeURIComponent).join('/')
}

function sortProducts(products, order = []) {
  const sequence = new Map(order.map((id, index) => [id, index]))
  return [...products].sort((a, b) =>
    (sequence.get(a.id) ?? Infinity) - (sequence.get(b.id) ?? Infinity) || a.id.localeCompare(b.id, 'en'),
  )
}

function productName(product, lang, englishClass = 'pen') {
  const english = `<span class="${englishClass}">${escapeHtml(product.nameEn)}</span>`
  return lang === 'cn' ? `${english}&nbsp;&nbsp;<span class="pcn">${escapeHtml(product.nameZh)}</span>` : english
}

function productLink(product, lang, englishClass) {
  return `<a class="catalog-product-link" href="${productPage(lang, product.id)}">${productName(product, lang, englishClass)}</a>`
}

function renderBadges(product, lang) {
  if (!product.badges?.length) return ''
  const flags = product.badges.map(badge => `<i class="badge ${badge}">${badges[badge][lang]}</i>`).join('')
  return `<span class="pflags">${flags}</span>`
}

function renderCategory(category, index, products, lang) {
  const messages = copy[lang]
  const rows = products.map(product => {
    const entry = product.categorySummaries?.find(summary => summary.category === category.id)
    const localizedSummary = entry && text(entry, 'summary', lang).trim()
    const summary = localizedSummary || text(product, 'summary', lang)
    return `          <article class="p"><div class="pname">${productLink(product, lang)}</div><span class="porg">${text(product, 'origin', lang)}</span><p class="pdesc">${summary}${renderBadges(product, lang)}</p></article>`
  })
  const preview = products.map(product => text(product, 'name', lang)).join(' · ')
  const aliases = category['aliases' + messages.suffix] ?? []
  return `    <details class="idx" id="category-${category.id}" data-catalog-id="${category.id}" data-aliases="${escapeHtml(JSON.stringify(aliases))}">
      <summary>
        <span class="n">${String(index + 1).padStart(2, '0')}</span>
        <span class="nm"><span>${text(category, 'name', lang)}</span>${category.label ? `<em>${escapeHtml(category.label)}</em>` : ''}</span>
        <span class="ct">${messages.productCount(products.length)}</span>
        <span class="tg">${messages.expand}</span>
        <span class="idx-preview">${preview}</span>
      </summary>
      <div class="idx-body">
        <p class="hint">${text(category, 'description', lang)}</p>
        <div class="plist">
${rows.join('\n') || `          <p class="hint">${messages.categoryEmpty}</p>`}
        </div>
      </div>
    </details>`
}

function renderPlant(plant, products, lang) {
  const messages = copy[lang]
  const aliases = plant['aliases' + messages.suffix] ?? []
  const count = products.length ? `<span class="cnt">${messages.productCount(products.length)}</span>` : ''
  const latin = plant.latin ? `<span class="lat">${escapeHtml(plant.latin)}</span>` : ''
  const items = products.map(product => productLink(product, lang)).join(lang === 'cn' ? '、' : ', ')
  const productsLine = items ? `<p class="prods">${items}</p>` : `<p class="none">${messages.plantEmpty}</p>`
  return `      <div class="pl" id="plant-${plant.id}" data-catalog-id="${plant.id}" data-aliases="${escapeHtml(JSON.stringify(aliases))}"><div class="ph"><h3>${text(plant, 'name', lang)}</h3>${latin}${count}</div>${productsLine}</div>`
}

function renderCatalogue(html, lang, products, taxonomy) {
  const messages = copy[lang]
  const { categories, plants, blendOrder } = taxonomy
  const categoryRows = categories.map((category, index) => renderCategory(category, index,
    sortProducts(products.filter(product => product.categories.includes(category.id)), category.productOrder), lang,
  ))
  const plantRows = plants.map(plant => renderPlant(plant,
    sortProducts(products.filter(product => product.plants?.includes(plant.id)), plant.productOrder), lang,
  ))
  const blends = sortProducts(products.filter(product => product.blend), blendOrder)
  const categorySlots = products.reduce((total, product) => total + product.categories.length, 0)
  return html
    .replace(/<h1>.*?<\/h1>/, () => `<h1>${messages.heroTitle(products.length)}</h1>`)
    .replace(/(href="#by-benefit">[^<]+<span>).*?(<\/span>)/, (_, start, end) => start + messages.categoryCount(categories.length) + end)
    .replace(/(href="#by-plant">[^<]+<span>).*?(<\/span>)/, (_, start, end) => start + messages.plantCount(plants.length) + end)
    .replace(/(<section class="by-benefit".*?[\s\S]*?<h2[^>]*>).*?(<\/h2>[\s\S]*?<p class="note"[^>]*>)[\s\S]*?(<\/p>)/, (_, start, mid, end) =>
      start + messages.categoryHeading(categories.length) + mid + messages.catalogueNote(products.length, categorySlots) + end)
    .replace(/<details class="idx">[\s\S]*?<\/details>(?:\s+<details class="idx">[\s\S]*?<\/details>)*/, () => categoryRows.join('\n\n'))
    .replace(/(<section class="by-plant".*?[\s\S]*?<h2[^>]*>)[\s\S]*?(<\/h2>)/, (_, start, end) => start + messages.plantHeading(plants.length) + end)
    .replace(/(<div class="plants">\s*)<div class="pl">[\s\S]*?(\r?\n    <\/div>)/, (_, start, end) => start + plantRows.join('\n').trimStart() + end)
    .replace(/(<div class="legend">\s*<span>)[^<]+(<\/span>)/, (_, start, end) => start + messages.plantLegend(plants.length) + end)
    .replace(/(<div class="multi">[\s\S]*?<span class="cnt">)[^<]+(<\/span>[\s\S]*?<ul>)[\s\S]*?(<\/ul>)/, (_, start, mid, end) =>
      start + messages.productCount(blends.length) + mid + '\n' + blends.map(product => `        <li>${productLink(product, lang, 'en')}</li>`).join('\n') + '\n      ' + end)
    .replace('<section class="ing-foot">', '<section class="ing-foot" id="download">')
    .replace("if (nm && nm.textContent.trim().indexOf(cat) === 0) hit = d;", "if (d.dataset.catalogId === cat || nm.firstElementChild.textContent === cat || JSON.parse(d.dataset.aliases).includes(cat)) hit = d;")
    .replace("if (h && h.textContent.trim() === pl) hitP = b;", "if (b.dataset.catalogId === pl || h.textContent.trim() === pl || JSON.parse(b.dataset.aliases).includes(pl)) hitP = b;")
    .replace("if (d.open) idxs.forEach(function(o){ if (o !== d) o.open = false; });", `if (d.open) idxs.forEach(function(o){ if (o !== d) o.open = false; });
      d.querySelector('.tg').textContent = d.open ? ${JSON.stringify(messages.close)} : ${JSON.stringify(messages.expand)};`)
    .replace('</head>', '<style>.catalog-product-link:hover,.catalog-product-link:focus-visible{text-decoration:underline;text-underline-offset:.25em}</style>\n</head>')
}

function catalogueLink(lang, group, id) {
  const parameter = group === 'category' ? 'cat' : 'plant'
  return `${lang}-ingredients.html?${parameter}=${id}#${group}-${id}`
}

const originalFeaturedIds = ['auroarc', 'cactycalma', 'flexiglu-992']

function renderHome(html, lang, products, taxonomy, featuredIds) {
  const catalogueMenu = (list, group) => list.map(entry =>
    `          <li><a class="mlink" href="${catalogueLink(lang, group, entry.id)}">${text(entry, 'name', lang)}</a></li>`,
  ).join('\n')
  const featured = featuredIds.map(id => products.find(product => product.id === id)).filter(Boolean)
  return html
    .replace(/(<h6>(?:按功效|By benefit)<\/h6>\s*<ul>)[\s\S]*?(<\/ul>)/, (_, start, end) =>
      start + '\n' + catalogueMenu(taxonomy.categories, 'category') + '\n        ' + end)
    .replace(/(<ul class="plants three">)[\s\S]*?(<\/ul>)/, (_, start, end) =>
      start + '\n' + catalogueMenu(taxonomy.plants, 'plant') + '\n        ' + end)
    .replace(/(<b data-count=")31(" data-dec="0">)0(<\/b>)/, (_, start, mid, end) =>
      start + products.length + mid + products.length + end)
    .replace(/(<b data-count=")9(" data-dec="0">)0(<\/b>)/, (_, start, mid, end) =>
      start + taxonomy.categories.length + mid + taxonomy.categories.length + end)
    .replace(/href="#">(技术资料 TDS|Technical data \(TDS\))<\/a>/, (_, label) =>
      `href="${lang}-ingredients.html#download">${label}</a>`)
    .replace(/href="#">(产品手册|Product catalogue)<\/a>/, (_, label) =>
      `href="assets/ingredient-catalog-2026.pdf">${label}</a>`)
    .replace(/<section class="signature">[\s\S]*?<\/section>/, signature => {
      if (!featured.length) return ''
      const existing = [...signature.matchAll(/<article class="card reveal"[^>]*>[\s\S]*?<\/article>/g)]
      const originals = new Map(originalFeaturedIds.map((id, index) => [id, existing[index]?.[0] ?? '']))
      const cards = featured.map((product, position) => {
        const source = originals.get(product.id) ?? ''
        const image = product.image
          ? `<div class="thumb"><img src="${uploadedUrl(product.image)}" alt="${text(product, 'name', lang)}" loading="lazy" style="width:100%;height:100%;object-fit:cover"></div>`
          : source.match(/<div class="thumb[^>]*>.*?<\/div>/)?.[0] ?? ''
        const metric = source.match(/<div class="metric">.*?<\/div>/)?.[0] ?? ''
        return `      <article class="card reveal" style="--d:${position}">
        ${image}
        <div class="body">
          <h3>${productLink(product, lang, 'ce')}</h3>
          <p>${text(product, 'summary', lang)}</p>
          ${metric}
        </div>
      </article>`
      })
      return signature.replace(/<article class="card reveal"[^>]*>[\s\S]*?<\/article>(?:\s+<article class="card reveal"[^>]*>[\s\S]*?<\/article>)*/, () => cards.join('\n').trimStart())
    })
}

export function renderProductPage(html, filename, catalogue) {
  const page = filename.match(/^(cn|en)-(ingredients|home)\.html$/)
  if (!page) return html
  const [, lang, kind] = page
  const products = catalogue.products.filter(product => product.published)
  if (kind === 'home') {
    return renderHome(html, lang, products, catalogue.taxonomy, catalogue.home?.featuredProducts ?? originalFeaturedIds)
  }
  return renderCatalogue(html, lang, products, catalogue.taxonomy)
}

const detailStyles = `<style>
.product-hero .hero-grid{align-items:center}
.product-image{width:100%;max-height:460px;object-fit:contain;display:block}
.product-details{background:var(--ivory);padding:clamp(42px,8vw,110px) 0}
.product-details h2{margin:0 0 24px;font-size:clamp(25px,3vw,36px);font-weight:500}
.product-details dl{display:grid;grid-template-columns:minmax(110px,160px) 1fr;gap:12px 20px}
.product-details dt{font-family:var(--ui);font-weight:600}
.product-details dd{margin:0}
.product-details ul{margin:0;padding-left:20px}
.product-details a,.product-back{text-decoration:underline;text-underline-offset:.25em}
.product-details p{margin:.7em 0}
.product-summary{margin-bottom:20px}
.product-summary .pflags{display:inline-flex;gap:5px;margin-left:8px;vertical-align:middle}
.product-actions{display:flex;flex-wrap:wrap;gap:12px}
@media (max-width:600px){.product-details dl{grid-template-columns:1fr;gap:7px}.product-details dd{margin-bottom:12px}}
</style>`

function renderDetail(template, product, lang, taxonomy) {
  const messages = copy[lang]
  const title = text(product, 'name', lang)
  const summary = text(product, 'summary', lang)
  const categories = taxonomy.categories.filter(category => product.categories.includes(category.id))
  const plants = taxonomy.plants.filter(plant => product.plants?.includes(plant.id))
  const referenceList = (items, group) => items.map(item =>
    `<a href="${catalogueLink(lang, group, item.id)}">${text(item, 'name', lang)}</a>`,
  ).join(lang === 'cn' ? '、' : ', ')
  const flags = renderBadges(product, lang)
  const image = product.image ? `<img class="product-image" src="${uploadedUrl(product.image)}" alt="${title}">` : ''
  const documents = (product.documents ?? []).map(document =>
    `<li><a href="${uploadedUrl(document.file)}">${text(document, 'label', lang)} (PDF)</a></li>`,
  ).join('')
  const extraSummaries = (product.categorySummaries ?? []).map(entry => {
    const summary = text(entry, 'summary', lang).trim()
    if (!summary) return ''
    const category = categories.find(item => item.id === entry.category)
    return `<p><strong>${text(category, 'name', lang)}</strong> — ${summary}</p>`
  }).join('')
  const origin = text(product, 'origin', lang)
  const inquiry = `${lang}-contact.html?product=${product.id}`
  const main = `<main>
<section class="ing-hero product-hero">
  <div class="wrap hero-grid">
    <div>
      <a class="product-back" href="${lang}-ingredients.html">← ${messages.back}</a>
      <h1>${title}</h1>
      ${lang === 'cn' ? `<p class="kicker">${escapeHtml(product.nameEn)}</p>` : ''}
      <p class="lead product-summary">${summary}${flags}</p>
      <div class="product-actions">
        <a class="btn solid" href="${inquiry}&amp;path=sample#form">${messages.sample}</a>
        <a class="btn" href="${inquiry}&amp;path=rd#form">${messages.requestData}</a>
      </div>
    </div>
    ${image}
  </div>
</section>
<section class="product-details">
  <div class="wrap">
    <h2>${messages.detailInfo}</h2>
    <dl>
      <dt>${messages.category}</dt><dd>${referenceList(categories, 'category')}${extraSummaries}</dd>
      ${origin ? `<dt>${messages.origin}</dt><dd>${origin}</dd>` : ''}
      ${plants.length ? `<dt>${messages.plant}</dt><dd>${referenceList(plants, 'plant')}</dd>` : ''}
      ${product.inci ? `<dt>INCI</dt><dd>${escapeHtml(product.inci)}</dd>` : ''}
      ${documents ? `<dt>${messages.documents}</dt><dd><ul>${documents}</ul></dd>` : ''}
    </dl>
  </div>
</section>
</main>`
  return template
    .replace(/<title>[^<]*<\/title>/, () => `<title>${title} · ${messages.company}</title>
<meta name="description" content="${summary}">
<link rel="alternate" hreflang="zh-CN" href="${productPage('cn', product.id)}">
<link rel="alternate" hreflang="en" href="${productPage('en', product.id)}">`)
    .replace('</head>', () => detailStyles + '\n</head>')
    .replace(/<main>[\s\S]*?<\/main>/, () => main)
    .replace(/<span class="lang">[^\n]+/, languageLinks => languageLinks.replace(
      /(cn|en)-ingredients\.html/g, (_, locale) => productPage(locale, product.id),
    ))
    // The catalogue's accordion and deep links are absent from the detail layout.
    .replace(/  \/\* 同时只开一类[^\n]*\n[\s\S]*?\}\)\(\);/, '})();')
}

export function renderProductDetails(catalogue) {
  const pages = new Map()
  for (const product of catalogue.products.filter(entry => entry.published)) {
    for (const lang of Object.keys(copy)) {
      pages.set(productPage(lang, product.id), renderDetail(catalogue.templates[lang], product, lang, catalogue.taxonomy))
    }
  }
  return pages
}
