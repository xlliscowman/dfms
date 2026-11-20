const prototypeEmail = 'DFMS@beaut-n-health.com';
const contactFields = ['email', 'phone', 'addressZh', 'addressEn', 'wechatQr'];
const contactCopy = {
  cn: {
    footerLocation: '北京研发中心 · 平谷生产基地。',
    helpLink: '查看直接联系渠道 →',
    helpIntro: '关于样品、报价或技术问题，可通过以下方式联系。',
    noScript: '浏览器需要启用 JavaScript 才能生成询盘邮件。',
    unavailable: '在线询盘暂未开放，请查看其他联系渠道。',
    noChannels: '联系渠道暂未开放。',
    prepared: '邮件草稿已准备好。',
    sendPrompt: '请使用下方按钮打开邮件客户端，并发送邮件。',
    wechat: '企业微信',
    scan: '扫码添加企业微信客服。',
    email: '邮箱',
    emailNote: '可发送需求、图纸或配方表。',
    phone: '电话',
    address: '联系地址',
    products: '原料产品',
  },
  en: {
    footerLocation: 'R&D center in Beijing · Production in Pinggu.',
    helpLink: 'See direct contact options →',
    helpIntro: 'Contact us about samples, quotations or technical questions.',
    noScript: 'Enable JavaScript to prepare an enquiry email.',
    unavailable: 'Online enquiries are currently unavailable. See other contact options below.',
    noChannels: 'Contact options are currently unavailable.',
    prepared: 'Your email draft is ready.',
    sendPrompt: 'Use the button below to open your email app and send the message.',
    wechat: 'WeCom',
    scan: 'Scan to add our team on WeCom.',
    email: 'Email',
    emailNote: 'Send a brief, drawings or a formula sheet.',
    phone: 'Phone',
    address: 'Contact address',
    products: 'Ingredients',
  },
};

export function validateContact(contact) {
  if (!contact || typeof contact !== 'object' || Array.isArray(contact)) {
    throw new Error('content/contact.json must contain a contact object');
  }

  for (const field of contactFields) {
    if (Object.hasOwn(contact, field) && typeof contact[field] !== 'string') {
      throw new Error(`Contact field ${field} must be text`);
    }
  }

  const email = contact.email?.trim() ?? '';
  const phone = contact.phone?.trim() ?? '';
  const qr = contact.wechatQr?.trim().replace(/^\//, '') ?? '';
  if (email && !/^[a-z0-9_+.-]+@(?:[a-z0-9-]+\.)+[a-z0-9-]+$/i.test(email)) {
    throw new Error('Contact email must be a single email address');
  }
  if (phone && (!/^\+?[0-9 ()-]+$/.test(phone) || !/^\d{7,15}$/.test(phone.replace(/\D/g, '')))) {
    throw new Error('Contact phone must contain 7–15 digits, optionally prefixed with +');
  }
  if (qr && (
    !qr.startsWith('assets/uploads/') ||
    // A QR code is an uploaded image, addressed relative to the published site root.
    /[\\:%?#\u0000-\u001f]/.test(qr) ||
    qr.split('/').some(part => !part || part === '.' || part === '..') ||
    !/\.(png|jpe?g|webp|avif)$/i.test(qr)
  )) {
    throw new Error('Contact wechatQr must point to an uploaded image under assets/uploads/');
  }
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

export function applyContact(html, filename, contact, catalog = { products: [] }) {
  const language = /^en-/.test(filename) ? 'en' : 'cn';
  const copy = contactCopy[language];
  const email = contact.email?.trim() ?? '';
  const phone = contact.phone?.trim() ?? '';
  const address = (language === 'en' ? contact.addressEn : contact.addressZh)?.trim() ?? '';
  const qr = contact.wechatQr?.trim().replace(/^\//, '') ?? '';

  if (address) {
    html = html.replace(copy.footerLocation, () => escapeHtml(address));
  }
  if (!email) {
    html = html
      .replace(/<p class="micro">[^<]*<a href="mailto:DFMS@beaut-n-health\.com">[^<]*<\/a><\/p>/g, '')
      .replace(/<a class="btn solid" href="mailto:DFMS@beaut-n-health\.com[^"]*">[^<]*<\/a>/g, '');
  }
  html = html.replaceAll(prototypeEmail, email);
  if (filename !== `${language}-contact.html`) {
    return html;
  }

  const tel = phone.replace(/[^+\d]/g, '');
  const cards = [];
  if (qr) {
    const src = qr.split('/').map(encodeURIComponent).join('/');
    cards.push([copy.wechat, `<img class="qr" src="${src}" alt="${copy.wechat}" width="104" height="104" style="object-fit:contain"><p>${copy.scan}</p>`]);
  }
  if (email) {
    cards.push([copy.email, `<a href="mailto:${email}">${email}</a><p>${copy.emailNote}</p>`]);
  }
  if (phone) {
    cards.push([copy.phone, `<a href="tel:${tel}">${escapeHtml(phone)}</a>`]);
  }
  if (address) {
    cards.push([copy.address, `<p>${escapeHtml(address)}</p>`]);
  }
  const directItems = cards.map(([heading, body], index) =>
    `<div class="di"><span class="di-n">${String(index + 1).padStart(2, '0')}</span><h3>${heading}</h3>${body}</div>`
  ).join('\n        ') || `<p>${copy.noChannels}</p>`;

  html = html
    .replace(/(<p class="micro">[^<]*<a href="#help">)[^<]+/, `$1${copy.helpLink}`)
    .replace(/(<div class="direct-lead">[\s\S]*?<h2>[^<]*<\/h2>\s*<p>)[^<]+/, `$1${copy.helpIntro}`)
    .replace(/<div class="direct-items">[\s\S]*?(?=<\/section>)/, () =>
      `<div class="direct-items">\n        ${directItems}\n      </div>\n    </div>\n  </div>\n`)
    .replace('.direct-items{display:grid;grid-template-columns:repeat(3,1fr)}',
      '.direct-items{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));row-gap:22px}');

  if (!email) {
    return html
      .replace(/<section class="form-sec" id="form">[\s\S]*?<\/section>/, () =>
        `<section class="form-sec" id="form"><div class="wrap"><p>${copy.unavailable}</p></div></section>`)
      .replace('  var META = {', "  if (!document.getElementById('leadForm')) return;\n  var META = {");
  }

  const productOptions = catalog.products
    .filter(product => product.published)
    .map(product => {
      const id = escapeHtml(product.id);
      const name = escapeHtml(language === 'en' ? product.nameEn : product.nameZh);
      return `<option data-product-id="${id}" value="${name} [${id}]">${name}</option>`;
    })
    .join('\n                      ');
  if (productOptions) {
    html = html.replace(
      /(<select name="(?:原料或功效方向|ingredient_benefit)" required)(>[\s\S]*?)(<\/select>)/,
      (_, select, options, close) => `${select} data-product-select${options.trimEnd()}
                    <optgroup label="${copy.products}">
                      ${productOptions}
                    </optgroup>
                  ${close}`,
    );
    html = html.replace('  setPath(current, false);', `  if (current === 'sample') {
    var requestedProduct = new URLSearchParams(location.search).get('product');
    var productSelect = document.querySelector('[data-product-select]');
    if (requestedProduct && productSelect) {
      var option = Array.from(productSelect.options).find(function (item) {
        return item.dataset.productId === requestedProduct;
      });
      if (option) productSelect.selectedIndex = option.index;
    }
  }
  setPath(current, false);`);
  }

  return html
    .replace('<form id="leadForm">', () =>
      `<noscript><p>${copy.noScript} <a href="#help">${copy.helpLink}</a></p></noscript>\n        <form id="leadForm" hidden>`)
    .replace('  setPath(current, false);', '  setPath(current, false);\n  form.hidden = false;')
    .replace(/(<div class="success"[^>]*>\s*<div class="ok">[^<]*<\/div>\s*<h3>)[^<]+/, `$1${copy.prepared}`)
    .replace(/(<p class="s-sub">)[^<]+/, `$1${copy.sendPrompt}`)
    .replace(/<a class="btn" href="#help">(?:加企业微信|Add on WeCom)<\/a>/,
      qr ? '$&' : '')
    .replace(/<a class="btn" href="tel:\+8610xxxxxxx">[^<]*<\/a>/,
      phone ? link => link.replace('+8610xxxxxxx', tel) : '');
}
