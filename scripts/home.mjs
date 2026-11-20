export function validateHome(home, products) {
  if (!home || typeof home !== 'object') throw new Error('content/home.json 必须是首页配置对象')
  for (const key of ['headlineZh', 'headlineEn']) {
    if (typeof home[key] !== 'string' || !home[key].trim()) throw new Error(`首页缺少标题：${key}`)
  }
  if (home.image !== undefined && typeof home.image !== 'string') throw new Error('首页主图必须是文件路径')
  const ids = home.featuredProducts ?? []
  if (!Array.isArray(ids) || ids.length > 3 || new Set(ids).size !== ids.length
    || ids.some(id => !products.some(product => product.id === id))) {
    throw new Error('首页推荐须选择最多 3 款不同的现有原料')
  }
}

export function applyHome(html, filename, home) {
  if (filename !== 'cn-home.html' && filename !== 'en-home.html') return html
  const title = filename === 'cn-home.html' ? home.headlineZh : home.headlineEn
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;' }
  const headline = title.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
    .map(line => `<span class="line-mask"><span>${line.replace(/[&<>]/g, character => entities[character])}</span></span>`)
    .join('\n      ')
  html = html.replace(/(<div class="hero-inner">[\s\S]*?<h1>)[\s\S]*?(<\/h1>)/,
    (_, start, end) => `${start}\n      ${headline}\n    ${end}`)
  if (home.image?.trim()) {
    const src = home.image.trim().replace(/^\//, '').split('/').map(encodeURIComponent).join('/')
    html = html.replace('<div class="tex tex-plant"></div>', () =>
      `<img src="${src}" alt="" fetchpriority="high" style="width:100%;height:100%;object-fit:cover">`)
  }
  return html
}
