const I18n = {
  locale: 'en',
  data: {},

  detectLocale() {
    const path = window.location.pathname;
    if (path.startsWith('/da')) return 'da';
    if (path.startsWith('/es')) return 'es';
    return 'en';
  },

  langPrefix() {
    return this.locale === 'en' ? '' : `/${this.locale}`;
  },

  async init() {
    this.locale = this.detectLocale();
    document.documentElement.lang = this.locale;

    if (this.locale === 'en') return;

    try {
      const res = await fetch(`/locales/${this.locale}.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.data = await res.json();
    } catch (e) {
      console.warn('[i18n] Could not load locale:', this.locale, e);
      return;
    }

    this.apply();
    document.dispatchEvent(new CustomEvent('i18nready', { detail: { locale: this.locale } }));
  },

  t(key) {
    return key.split('.').reduce((obj, k) => (obj != null && k in obj ? obj[k] : undefined), this.data);
  },

  apply() {
    const prefix = this.langPrefix();

    // Text content
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const val = this.t(el.dataset.i18n);
      if (val != null) el.textContent = val;
    });

    // HTML content
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      const val = this.t(el.dataset.i18nHtml);
      if (val != null) el.innerHTML = val;
    });

    // Attributes: data-i18n-attr="attr:key" or "attr1:key1,attr2:key2"
    document.querySelectorAll('[data-i18n-attr]').forEach(el => {
      el.dataset.i18nAttr.split(',').forEach(pair => {
        const [attr, key] = pair.trim().split(':');
        const val = this.t(key);
        if (val != null) el.setAttribute(attr, val);
      });
    });

    // Language-prefixed hrefs
    document.querySelectorAll('[data-i18n-href]').forEach(el => {
      el.href = prefix + el.dataset.i18nHref;
    });

    // data-card-link on clickable articles
    document.querySelectorAll('[data-i18n-card-link]').forEach(el => {
      el.dataset.cardLink = prefix + el.dataset.i18nCardLink;
    });

    // Page title and meta description
    const title = this.t('page.title');
    if (title) document.title = title;

    const desc = this.t('page.description');
    if (desc) {
      const meta = document.querySelector('meta[name="description"]');
      if (meta) meta.content = desc;
    }
  },
};

document.addEventListener('DOMContentLoaded', () => I18n.init());
export default I18n;
