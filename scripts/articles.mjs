import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const labels = {
  news: { cn: '新闻与媒体', en: 'News & media' },
  efficacy: { cn: '功效趋势', en: 'Efficacy trends' },
  botanical: { cn: '植物科学', en: 'Plant science' },
  regulation: { cn: '法规与合规', en: 'Regulation & compliance' },
}
const insightCategories = ['efficacy', 'botanical', 'regulation']
const copy = {
  cn: {
    brand: '东方淼森',
    insight: '洞察',
    archive: '年度新闻',
    archiveCount: count => `${count} 条`,
    expand: '展开',
    empty: '暂无已发布文章。',
    sample: '官网原型内容，正式资料待补充。',
    pending: '正文待发布。',
    read: '阅读全文 →',
    downloads: '查看公开资料 ↓',
    back: '返回列表',
  },
  en: {
    brand: 'Miusenphytech',
    insight: 'Insights',
    archive: 'News by year',
    archiveCount: count => count === 1 ? '1 item' : `${count} items`,
    expand: 'Expand',
    empty: 'No published articles yet.',
    sample: 'Website prototype content. Official material is pending.',
    pending: 'Full article pending.',
    read: 'Read more →',
    downloads: 'Browse public downloads ↓',
    back: 'Back to all articles',
  },
}

function validateArticle(article, filename) {
  const fail = message => { throw new Error(`content/articles/${filename}: ${message}`) }
  if (!article || typeof article !== 'object' || Array.isArray(article)) fail('文章须为 JSON 对象')
  if (typeof article.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.id)
    || filename !== `${article.id}.json`) fail('文章 ID 须与文件名一致，且只用小写字母、数字和连字符')
  if (!Object.hasOwn(labels, article.category)) fail('文章分类无效')
  if (typeof article.published !== 'boolean') fail('published 须为布尔值')
  for (const field of ['featured', 'prototype']) {
    if (article[field] !== undefined && typeof article[field] !== 'boolean') fail(`${field} 须为布尔值`)
  }
  for (const field of ['titleZh', 'titleEn', 'summaryZh', 'summaryEn', 'bodyZh', 'bodyEn', 'tagZh', 'tagEn']) {
    if (article[field] !== undefined && typeof article[field] !== 'string') fail(`${field} 须为文本`)
  }
  if (article.published && (!article.titleZh?.trim() || !article.titleEn?.trim())) fail('上架文章须提供中英文标题')
  if (article.date !== undefined && typeof article.date !== 'string') fail('发布日期须为文本')
  if (article.date || article.published) {
    const validFormat = /^\d{4}-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?$/.test(article.date ?? '')
    const fullDate = article.date?.length === 7 ? article.date + '-01' : article.date
    const day = validFormat ? new Date(fullDate + 'T00:00:00Z') : null
    if (!day || !Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== fullDate) fail('日期须为有效的 YYYY-MM 或 YYYY-MM-DD')
  }
}

export async function loadArticles(root) {
  const folder = join(root, 'content', 'articles')
  const names = await readdir(folder, { withFileTypes: true })
  const files = names.filter(entry => entry.isFile() && entry.name.endsWith('.json'))
  const articles = await Promise.all(files.map(async ({ name }) => {
    const article = JSON.parse(await readFile(join(folder, name), 'utf8'))
    validateArticle(article, name)
    return article
  }))
  const templates = await Promise.all(['cn-news', 'en-news', 'cn-insights', 'en-insights'].map(async name =>
    [name, await readFile(join(root, `${name}.html`), 'utf8')],
  ))
  return { articles, templates: Object.fromEntries(templates) }
}

function escapeHtml(text) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return text.replace(/[&<>"']/g, character => entities[character])
}

function field(article, name, lang) {
  return escapeHtml(article[name + (lang === 'cn' ? 'Zh' : 'En')]?.trim() ?? '')
}

function articlePath(article, lang) {
  return `${lang}-article-${article.id}.html`
}

function dateText(article) {
  return article.date.replaceAll('-', '.')
}

function tagText(article, lang) {
  return field(article, 'tag', lang) || escapeHtml(labels[article.category][lang])
}

function textParagraphs(text) {
  return text.split(/\r?\n\s*\r?\n/).filter(Boolean)
    .map(paragraph => `<p>${paragraph.replace(/\r?\n/g, '<br>')}</p>`).join('\n')
}

function publishedArticles(catalogue) {
  return catalogue.articles.filter(article => article.published)
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
}

function featureFirst(articles) {
  const lead = articles.find(article => article.featured)
  return lead ? [lead, ...articles.filter(article => article.id !== lead.id)] : articles
}

function renderNews(html, articles, lang) {
  const recent = featureFirst(articles).slice(0, 10)
  const [lead, ...shorts] = recent
  const feature = lead ? `
    <div class="feature reveal">
      <a class="cover" href="${articlePath(lead, lang)}" aria-label="${field(lead, 'title', lang)}">
        <div class="tex tex-powder"></div>
      </a>
      <div>
        <p class="date">${dateText(lead)}　${tagText(lead, lang)}</p>
        <h3>${field(lead, 'title', lang)}</h3>
        ${textParagraphs(field(lead, 'summary', lang))}
        <a class="go" href="${articlePath(lead, lang)}">${copy[lang].read}</a>
      </div>
    </div>
    ` : `<p class="note">${copy[lang].empty}</p>\n    `
  const rows = shorts.map(article => `<a class="nrow" href="${articlePath(article, lang)}"><span class="d">${dateText(article)}</span><span class="c">${tagText(article, lang)}</span><h3>${field(article, 'title', lang)}</h3><span class="a" aria-hidden="true">↗</span></a>`)
  const recentIds = new Set(recent.map(article => article.id))
  const byYear = new Map()
  for (const article of articles) {
    if (recentIds.has(article.id)) continue
    const year = article.date.slice(0, 4)
    if (!byYear.has(year)) byYear.set(year, [])
    byYear.get(year).push(article)
  }
  const archive = Array.from(byYear, ([year, entries]) => `
    <details class="year reveal">
      <summary>
        <span class="y">${year}</span><span class="lbl">${copy[lang].archive}</span>
        <span class="cnt">${copy[lang].archiveCount(entries.length)}</span><span class="tg">${copy[lang].expand}</span>
      </summary>
      <div class="year-body">
        ${entries.map(article => `<a class="yl" href="${articlePath(article, lang)}"><span>${dateText(article)}</span>${field(article, 'title', lang)}</a>`).join('\n        ')}
      </div>
    </details>`).join('\n')
  return html
    .replace(/<a class="more" href="#">(?:公众号原文|Read on WeChat) ↗<\/a>/, '')
    .replace(/<div class="feature reveal">[\s\S]*?(?=<div class="nlist">)/, () => feature)
    .replace(/<div class="nlist">[\s\S]*?<\/div>/, () => rows.length ? `<div class="nlist">\n      ${rows.join('\n      ')}\n    </div>` : '')
    .replace(/<p class="foot-note">[^<]*<\/p>/, () => articles.some(article => article.prototype) ? `<p class="foot-note">${copy[lang].sample}</p>` : '')
    .replace(/<details class="year reveal">[\s\S]*?<\/details>/, () => archive)
}

function renderInsights(html, articles, lang) {
  const lead = featureFirst(articles)[0]
  const coverLabel = lead && field(lead, 'title', lang)
  const leadSection = lead ? `
<section class="featured">
  <div class="wrap">
    <div class="f-grid">
      <a class="f-cover" href="${articlePath(lead, lang)}" aria-label="${coverLabel}">
        <div class="top"><span>${tagText(lead, lang)}</span><span>${dateText(lead)}</span></div>
        <div class="big" style="font-size:clamp(2.6rem,8vw,6rem)">${lead.id === 'skin-longevity-ecm' ? 'ECM' : 'INSIGHTS'}</div>
        <div class="bot">${coverLabel}</div>
      </a>
      <div class="f-text">
        <p class="date">${dateText(lead)}　·　${tagText(lead, lang)}</p>
        <h2>${coverLabel}</h2>
        ${textParagraphs(field(lead, 'summary', lang))}
        <div class="f-acts">
          <a class="btn solid" href="${articlePath(lead, lang)}">${copy[lang].read}</a>
          <a class="btn" href="#lib">${copy[lang].downloads}</a>
        </div>
      </div>
    </div>
  </div>
</section>` : ''
  let pillar = 0
  return html
    .replace(/<section class="featured">[\s\S]*?<\/section>/, () => leadSection)
    .replace(/<div class="p-list">[\s\S]*?<\/div>\s*<a class="all" href="#">[^<]*<\/a>/g, () => {
      const category = insightCategories[pillar++]
      const entries = articles.filter(article => article.category === category)
      const links = entries.map(article => `<a href="${articlePath(article, lang)}"><span>${dateText(article)}</span><b>${field(article, 'title', lang)}</b></a>`)
      return links.length ? `<div class="p-list">\n          ${links.join('\n          ')}\n        </div>` : `<p class="scope">${copy[lang].empty}</p>`
    })
}

function renderHome(html, news, insights, lang) {
  const homeNews = featureFirst(news).slice(0, 3).map((article, index) => `
      <a class="news-item reveal" style="--d:${index}" href="${articlePath(article, lang)}">
        <span class="d">${dateText(article)}</span>
        <h3>${field(article, 'title', lang)}</h3>
        <p>${tagText(article, lang)}</p>
      </a>`)
  const homeInsights = insightCategories.map((category, index) => {
    const [article] = featureFirst(insights.filter(entry => entry.category === category))
    if (!article) return ''
    const texture = ['lab', 'powder', 'plant'][index]
    return `
      <a class="ins-row" href="${articlePath(article, lang)}">
        <span class="date">${dateText(article)}</span><span class="cat">${tagText(article, lang)}</span>
        <h3>${field(article, 'title', lang)}</h3><span class="arrow" aria-hidden="true">↗</span>
        <span class="ins-thumb tex tex-${texture}"></span>
      </a>`
  })
  return html
    .replace(/(<div class="news-head">[\s\S]*?<a href=")#(")/, `$1${lang}-news.html$2`)
    .replace(/<div class="news-grid">[\s\S]*?<\/div>/, () => `<div class="news-grid">${homeNews.join('')}\n    </div>`)
    .replace(/<div class="ins-list">[\s\S]*?<\/div>/, () => `<div class="ins-list">${homeInsights.join('')}\n    </div>`)
}

export function renderArticlePage(html, filename, catalogue) {
  const match = /^(cn|en)-(home|news|insights)\.html$/.exec(filename)
  if (!match) return html
  const [, lang, section] = match
  const all = publishedArticles(catalogue)
  const news = all.filter(article => article.category === 'news')
  const insights = all.filter(article => article.category !== 'news')
  if (section === 'news') return renderNews(html, news, lang)
  if (section === 'insights') return renderInsights(html, insights, lang)
  return renderHome(html, news, insights, lang)
}

function renderDetail(article, lang, templates) {
  const kind = article.category === 'news' ? 'news' : 'insights'
  const section = kind === 'news' ? labels.news[lang] : copy[lang].insight
  const title = field(article, 'title', lang)
  const summary = textParagraphs(field(article, 'summary', lang))
  const body = textParagraphs(field(article, 'body', lang))
  const articleMarkup = `<main>
    <section class="${kind === 'news' ? 'news-hero' : 'ins-hero'}">
      <div class="wrap">
        <p class="kicker">${escapeHtml(section)}　·　${tagText(article, lang)}　·　${dateText(article)}</p>
        <h1>${title}</h1>
        ${summary ? `<div class="lead">${summary}</div>` : ''}
        ${article.prototype ? `<p class="micro">${copy[lang].sample}</p>` : ''}
      </div>
    </section>
    <section style="padding:clamp(2.5rem,6vw,6rem) 0">
      <div class="wrap">
        ${body ? `<article style="max-width:72ch;line-height:1.8">${body}</article>` : (!summary ? `<p>${copy[lang].pending}</p>` : '')}
        <p style="margin-top:1.5rem"><a class="btn" href="${lang}-${kind}.html">← ${copy[lang].back}</a></p>
      </div>
    </section>
  </main>`
  return templates[`${lang}-${kind}`]
    .replace(/<title>[^<]*<\/title>/, () => `<title>${title} · ${copy[lang].brand}</title>`)
    .replace(/<main>[\s\S]*?<\/main>/, () => articleMarkup)
    .replace(/<a href="cn-(?:news|insights)\.html"([^>]*>)CN<\/a>/, (_, rest) => `<a href="${articlePath(article, 'cn')}"${rest}CN</a>`)
    .replace(/<a href="en-(?:news|insights)\.html"([^>]*>)EN<\/a>/, (_, rest) => `<a href="${articlePath(article, 'en')}"${rest}EN</a>`)
}

export function renderArticleDetails(catalogue) {
  return new Map(publishedArticles(catalogue).flatMap(article => ['cn', 'en'].map(lang =>
    [articlePath(article, lang), renderDetail(article, lang, catalogue.templates)],
  )))
}
