const I18n = {
  locale: 'en',
  data: {},

  detectLocale() {
    const path = window.location.pathname;

    // If URL already has a language prefix, respect it
    if (path.startsWith('/da')) return 'da';
    if (path.startsWith('/es')) return 'es';

    // Check if the user has explicitly set a preferred language
    const prefLang = localStorage.getItem('preferred_language');
    if (prefLang === 'en') {
      return 'en';
    } else if (prefLang === 'es') {
      window.location.replace('/es' + path + window.location.search + window.location.hash);
      return 'es';
    } else if (prefLang === 'da') {
      window.location.replace('/da' + path + window.location.search + window.location.hash);
      return 'da';
    }

    // On root paths, auto-detect from browser language and redirect if no pref
    if (!prefLang) {
      const browserLang = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
      if (browserLang.startsWith('es')) {
        window.location.replace('/es' + path + window.location.search + window.location.hash);
        return 'es';
      }
      if (browserLang.startsWith('da')) {
        window.location.replace('/da' + path + window.location.search + window.location.hash);
        return 'da';
      }
    }

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
      const res = await fetch(`/locales/${this.locale}.json?v=1.2`);
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

  setMeta(attr, value, content) {
    let el = document.head.querySelector(`meta[${attr}="${value}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attr, value);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  },

  apply() {
    const prefix = this.langPrefix();

    // Text content
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const val = this.t(el.dataset.i18n);
      if (val != null) {
        el.textContent = val;
      } else if (this.locale !== 'en') {
        console.warn(`[i18n] Missing translation for key: "${el.dataset.i18n}"`);
      }
    });

    // HTML content
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      const val = this.t(el.dataset.i18nHtml);
      if (val != null) {
        el.innerHTML = val;
      } else if (this.locale !== 'en') {
        console.warn(`[i18n] Missing HTML translation for key: "${el.dataset.i18nHtml}"`);
      }
    });

    // Attributes: data-i18n-attr="attr:key" or "attr1:key1,attr2:key2"
    document.querySelectorAll('[data-i18n-attr]').forEach(el => {
      el.dataset.i18nAttr.split(',').forEach(pair => {
        const [attr, key] = pair.trim().split(':');
        const val = this.t(key);
        if (val != null) {
          el.setAttribute(attr, val);
        } else if (this.locale !== 'en') {
          console.warn(`[i18n] Missing attribute translation for key: "${key}" (attr: ${attr})`);
        }
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

    // Page title — body[data-i18n-title] overrides default 'page.title' key
    const titleKey = document.body.dataset.i18nTitle || 'page.title';
    const base = titleKey.replace(/\.title$/, '');
    const title = this.t(titleKey);
    if (title) {
      document.title = title;
      this.setMeta('property', 'og:title', title);
      this.setMeta('name', 'twitter:title', title);
    }

    // Meta description — locales use either `.description` or `.desc`
    const desc = this.t(`${base}.description`) ?? this.t(`${base}.desc`);
    if (desc) {
      this.setMeta('name', 'description', desc);
      this.setMeta('property', 'og:description', desc);
      this.setMeta('name', 'twitter:description', desc);
    }

    // og:locale
    const ogLocale = { en: 'en_US', es: 'es_ES', da: 'da_DK' }[this.locale];
    if (ogLocale) this.setMeta('property', 'og:locale', ogLocale);
  },
};

document.addEventListener('DOMContentLoaded', () => I18n.init());
export default I18n;
