/**
 * Seaduced Experience — GA4 Event Tracking
 * All custom events for Google Analytics 4
 */

function gaEvent(name, params = {}) {
  if (typeof gtag === 'function') {
    gtag('event', name, params);
  }
}

document.addEventListener('DOMContentLoaded', () => {

  // ─────────────────────────────────────────
  // 1. TOUR PAGE VIEW
  //    Fires on any experience page load
  // ─────────────────────────────────────────
  const experienceId = document.body.dataset.experienceId;
  const pagePath = window.location.pathname;

  if (experienceId || pagePath.includes('/experiences/')) {
    const tourName = document.querySelector('h1')?.textContent?.trim() || pagePath;
    gaEvent('tour_page_view', {
      tour_id: experienceId || pagePath,
      tour_name: tourName,
      page_path: pagePath,
    });
  }

  // ─────────────────────────────────────────
  // 2. CTA CLICKS — Book Now (nav, hero, sections)
  //    All generic "Book Now" buttons
  // ─────────────────────────────────────────
  const ctaIds = ['nav-cta', 'mob-cta', 'hero-book-cta', 'experience-book-cta', 'cta-book-now'];
  ctaIds.forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => {
      gaEvent('cta_click', {
        cta_id: id,
        cta_label: 'Book Now',
        page_path: pagePath,
      });
    });
  });

  // ─────────────────────────────────────────
  // 3. BEGIN CHECKOUT — "Book This Tour" buttons
  //    Specific tour booking buttons (data-book-tour)
  // ─────────────────────────────────────────
  document.querySelectorAll('[data-book-tour]').forEach(btn => {
    btn.addEventListener('click', () => {
      gaEvent('begin_checkout', {
        tour_id: btn.dataset.bookTour,
        page_path: pagePath,
      });
    });
  });

  // ─────────────────────────────────────────
  // 4. SELECT TOUR — booking cards on /book page
  // ─────────────────────────────────────────
  document.querySelectorAll('.booking-card--clickable').forEach(card => {
    card.addEventListener('click', () => {
      const tourId = card.id || card.dataset.cardLink || 'unknown';
      const tourName = card.querySelector('.booking-card__title-link')?.textContent?.trim() || tourId;
      gaEvent('select_tour', {
        tour_id: tourId,
        tour_name: tourName,
      });
    });
  });

  // ─────────────────────────────────────────
  // 5. BESPOKE INQUIRY CLICK
  // ─────────────────────────────────────────
  document.getElementById('home-bespoke-cta')?.addEventListener('click', () => {
    gaEvent('bespoke_inquiry_click', {
      page_path: pagePath,
    });
  });

  // ─────────────────────────────────────────
  // 6. CONTACT CLICKS — email & phone
  // ─────────────────────────────────────────
  document.querySelectorAll('a[href^="mailto:"]').forEach(link => {
    link.addEventListener('click', () => {
      gaEvent('contact_click', {
        contact_type: 'email',
        contact_value: link.href.replace('mailto:', '').split('?')[0],
        page_path: pagePath,
      });
    });
  });

  document.querySelectorAll('a[href^="tel:"]').forEach(link => {
    link.addEventListener('click', () => {
      gaEvent('contact_click', {
        contact_type: 'phone',
        contact_value: link.href.replace('tel:', ''),
        page_path: pagePath,
      });
    });
  });

  // ─────────────────────────────────────────
  // 7. FAQ OPEN
  // ─────────────────────────────────────────
  document.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const isOpening = btn.getAttribute('aria-expanded') !== 'true';
      if (isOpening) {
        const question = btn.querySelector('span')?.textContent?.trim() || btn.textContent.trim();
        gaEvent('faq_open', {
          faq_question: question,
          page_path: pagePath,
        });
      }
    });
  });

  // ─────────────────────────────────────────
  // 8. BOOKING COMPLETED
  //    Observe when .po-card--success is added to DOM
  //    (triggered by reserve.js showSuccessUI)
  // ─────────────────────────────────────────
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        const successCard = node.classList?.contains('po-card--success')
          ? node
          : node.querySelector?.('.po-card--success');
        if (successCard) {
          const tourTitle = document.getElementById('tour-title')?.textContent?.trim() || '';
          gaEvent('booking_completed', {
            tour_name: tourTitle,
            page_path: pagePath,
          });
          observer.disconnect();
        }
      });
      // Also catch class changes on existing nodes
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const el = mutation.target;
        if (el.classList.contains('po-card--success')) {
          const tourTitle = document.getElementById('tour-title')?.textContent?.trim() || '';
          gaEvent('booking_completed', {
            tour_name: tourTitle,
            page_path: pagePath,
          });
          observer.disconnect();
        }
      }
    });
  });

  const overlay = document.getElementById('payment-overlay') || document.querySelector('.po-overlay');
  if (overlay) {
    observer.observe(overlay, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  }

});
