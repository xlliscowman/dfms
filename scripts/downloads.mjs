const handbook = 'ingredient-catalog-2026'
const handbookPath = `assets/${handbook}.pdf`
const copy = {
  cn: {
    title: 'titleZh',
    description: 'descriptionZh',
    handbook: '原料手册',
    download: '下载 PDF ↓',
    library: '查看公开资料 →',
    note: '下载以下公开 PDF 资料。引用请注明来源。',
    empty: '暂无可公开下载的资料。',
  },
  en: {
    title: 'titleEn',
    description: 'descriptionEn',
    handbook: 'Catalogue',
    download: 'Download PDF ↓',
    library: 'See public downloads →',
    note: 'Download the public PDFs below. Please cite the source.',
    empty: 'There are no public downloads yet.',
  },
}

function filePath(file) {
  return (file ?? '').trim().replace(/^\//, '')
}

export function validateDownloads(config) {
  if (!Array.isArray(config?.documents)) {
    throw new Error('content/downloads.json 的 documents 必须是资料列表。')
  }

  const ids = new Set()
  for (const document of config.documents) {
    if (!document || typeof document.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(document.id)
      || ids.has(document.id)) {
      throw new Error(`公开资料编号格式错误或重复：${document?.id ?? ''}`)
    }
    ids.add(document.id)
    const { id, titleZh, titleEn, descriptionZh, descriptionEn, file, published } = document
    if (!titleZh || typeof titleZh !== 'string' || !titleZh.trim()
      || !titleEn || typeof titleEn !== 'string' || !titleEn.trim()
      || [descriptionZh, descriptionEn].some(value => value != null && typeof value !== 'string')) {
      throw new Error(`公开资料 ${id} 需要中英文标题，简介必须是文字。`)
    }
    if (typeof published !== 'boolean' || (file != null && typeof file !== 'string')) {
      throw new Error(`公开资料 ${id} 的发布状态或文件格式无效。`)
    }
    const path = filePath(file)
    if (published && !path) throw new Error(`公开资料 ${id} 发布前需要上传 PDF。`)
    if (path && path !== handbookPath && (
      !path.startsWith('assets/uploads/documents/')
      || !/\.pdf$/i.test(path)
      || /[\\%?#:<>"|*\u0000-\u001f\u007f]/.test(path)
      || path.split('/').some(segment => !segment || /[. ]$/.test(segment))
    )) {
      throw new Error(`公开资料 ${id} 的 PDF 必须位于公开资料上传目录。`)
    }
  }
}

export function getPublishedDownloadPaths(config) {
  return config.documents.filter(document => document.published).map(document => filePath(document.file))
}

function escapeHtml(value) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return (value ?? '').replace(/[&<>"']/g, character => entities[character])
}

function downloadUrl(document) {
  return filePath(document.file).split('/').map(encodeURIComponent).join('/')
}

export function applyDownloads(html, filename, config) {
  const page = /^(cn|en)-(home|ingredients|insights|capability)\.html$/.exec(filename)
  if (!page) return html
  const [, language, section] = page
  const labels = copy[language]
  const saved = config.documents.filter(document => document.published)
  const catalogue = saved.find(document => document.id === handbook)

  if (section === 'home') {
    return html
      .replace(/<a class="mlink" href="(?:#|assets\/ingredient-catalog-2026\.pdf)">(产品手册|Product catalogue)<\/a>/,
        (_, label) => catalogue ? `<a class="mlink" href="${downloadUrl(catalogue)}" download>${label}</a>` : '')
      .replace(/(?:<a class="mlink" href="(?:cn|en)-insights\.html#lib">[^<]+<\/a>)+/,
        () => `<a class="mlink" href="${language}-insights.html#lib">${labels.library}</a>`)
  }
  if (section === 'ingredients') {
    return html
      .replace('<section class="ing-foot">', '<section class="ing-foot" id="download">')
      .replace(/<a class="entry" href="assets\/ingredient-catalog-2026\.pdf" download>[\s\S]*?<\/a>/, () =>
        catalogue ? `<a class="entry" href="${downloadUrl(catalogue)}" download>
        <span class="ek">${labels.handbook}</span>
        <h3>${escapeHtml(catalogue[labels.title])}</h3>
        <p>${escapeHtml(catalogue[labels.description])}</p>
        <span class="go">${labels.download}</span>
      </a>` : '')
  }
  if (section === 'capability') {
    return html.replace(/(<a class="btn" href=")assets\/ingredient-catalog-2026\.pdf(" download>[^<]+<\/a>)/,
      (_, start, end) => catalogue ? `${start}${downloadUrl(catalogue)}${end}` : '')
  }

  const rows = saved.map(document => `<a class="dl" id="download-${document.id}" href="${downloadUrl(document)}" download>
        <span class="tag">PDF</span>
        <h3>${escapeHtml(document[labels.title])}</h3>
        <span class="spec">${escapeHtml(document[labels.description])}</span>
        <span class="go" aria-hidden="true">↓</span>
      </a>`).join('\n      ')
  return html
    .replace('grid-template-columns:88px 1fr 88px 196px 28px;', 'grid-template-columns:52px 1fr minmax(132px, 196px) 28px;')
    .replace(/(<div class="lib-head">[\s\S]*?<p class="note">)[^<]*(<\/p>)/,
      (_, start, end) => start + labels.note + end)
    .replace(/(<div class="dl-list reveal">)[\s\S]*?(\r?\n    <\/div>)/,
      (_, start, end) => `${start}\n      ${rows || `<p>${labels.empty}</p>`}${end}`)
    .replace(/(<div class="lib-foot">\s*)<p>[^<]*<\/p>/, '$1')
}
