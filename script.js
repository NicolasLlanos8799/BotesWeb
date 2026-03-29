/* ─────────────────────────────────────────────────────────────────────────
   SEADUCED-EXPERIENCE — Interactive JavaScript
   ─────────────────────────────────────────────────────────────────────────  */

'use strict';

document.addEventListener('DOMContentLoaded', () => {

  /* ── NAVBAR: Scroll solid + mobile toggle ─────────────────────────────── */
  const navbar     = document.getElementById('navbar');
  const hamburger  = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobileMenu');

  function updateNavbar() {
    if (window.scrollY > 60) {
      navbar.classList.add('navbar--scrolled');
    } else {
      navbar.classList.remove('navbar--scrolled');
    }
  }

  window.addEventListener('scroll', updateNavbar, { passive: true });
  updateNavbar();

  hamburger.addEventListener('click', () => {
    const isOpen = mobileMenu.classList.toggle('open');
    hamburger.classList.toggle('active', isOpen);
    hamburger.setAttribute('aria-expanded', isOpen);
  });

  // Close mobile menu when a link is clicked
  mobileMenu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      mobileMenu.classList.remove('open');
      hamburger.classList.remove('active');
      hamburger.setAttribute('aria-expanded', 'false');
    });
  });


  /* ── SCROLL REVEAL (IntersectionObserver) ──────────────────────────────── */
  const revealEls = document.querySelectorAll('.reveal');

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        // Stagger siblings slightly for polish
        const delay = entry.target.dataset.delay || 0;
        setTimeout(() => {
          entry.target.classList.add('visible');
        }, delay);
        revealObserver.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.12,
    rootMargin: '0px 0px -40px 0px'
  });

  // Add staggered delays to grid children
  document.querySelectorAll('.tours-grid, .features-grid, .quick-reviews, .routes-grid').forEach(grid => {
    Array.from(grid.children).forEach((child, index) => {
      if (child.classList.contains('reveal')) {
        child.dataset.delay = index * 100;
      }
    });
  });

  revealEls.forEach(el => revealObserver.observe(el));

  // Fire immediately for elements already in viewport
  revealEls.forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight) {
      el.classList.add('visible');
    }
  });


  /* ── TESTIMONIAL CAROUSEL ─────────────────────────────────────────────── */
  const track     = document.getElementById('testimonialTrack');
  const prevBtn   = document.getElementById('carouselPrev');
  const nextBtn   = document.getElementById('carouselNext');
  const dotsWrap  = document.getElementById('carouselDots');

  if (track) {
    const cards     = track.querySelectorAll('.testimonial-card');
    const total     = cards.length;
    let current     = 0;
    let autoTimer   = null;

    // Build dots
    cards.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-label', `Testimonial ${i + 1}`);
      dot.setAttribute('aria-selected', i === 0);
      dot.addEventListener('click', () => goTo(i));
      dotsWrap.appendChild(dot);
    });

    function updateDots() {
      dotsWrap.querySelectorAll('.carousel-dot').forEach((dot, i) => {
        dot.classList.toggle('active', i === current);
        dot.setAttribute('aria-selected', i === current);
      });
    }

    function goTo(index) {
      current = (index + total) % total;
      track.style.transform = `translateX(-${current * 100}%)`;
      updateDots();
    }

    prevBtn.addEventListener('click', () => { goTo(current - 1); resetAuto(); });
    nextBtn.addEventListener('click', () => { goTo(current + 1); resetAuto(); });

    function startAuto() {
      autoTimer = setInterval(() => goTo(current + 1), 5000);
    }

    function resetAuto() {
      clearInterval(autoTimer);
      startAuto();
    }

    startAuto();

    // Pause auto-play on hover
    const carousel = document.getElementById('testimonialCarousel');
    carousel.addEventListener('mouseenter', () => clearInterval(autoTimer));
    carousel.addEventListener('mouseleave', startAuto);

    // Touch / swipe support
    let touchStartX = 0;
    carousel.addEventListener('touchstart', e => {
      touchStartX = e.changedTouches[0].clientX;
    }, { passive: true });
    carousel.addEventListener('touchend', e => {
      const diff = touchStartX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 40) {
        goTo(diff > 0 ? current + 1 : current - 1);
        resetAuto();
      }
    }, { passive: true });
  }


  /* ── FAQ ACCORDION ────────────────────────────────────────────────────── */
  document.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const item   = btn.closest('.faq-item');
      const answer = document.getElementById(btn.getAttribute('aria-controls'));
      const isOpen = item.classList.contains('open');

      // Close all others
      document.querySelectorAll('.faq-item.open').forEach(openItem => {
        if (openItem !== item) {
          openItem.classList.remove('open');
          openItem.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
          const ans = openItem.querySelector('.faq-answer');
          ans.hidden = true;
        }
      });

      // Toggle current
      item.classList.toggle('open', !isOpen);
      btn.setAttribute('aria-expanded', !isOpen);
      answer.hidden = isOpen;

      if (!isOpen) {
        // Smooth scroll to keep visible if near bottom
        setTimeout(() => {
          const rect = item.getBoundingClientRect();
          if (rect.bottom > window.innerHeight) {
            item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }, 50);
      }
    });
  });


  /* ── SMOOTH SCROLL for anchor links ────────────────────────────────────── */
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        const yOffset = -parseInt(getComputedStyle(document.documentElement).getPropertyValue('--navbar-h'), 10) || -72;
        const y = target.getBoundingClientRect().top + window.pageYOffset + yOffset;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    });
  });


  /* ── SUBTLE PARALLAX on hero image ──────────────────────────────────────── */
  const heroImg = document.querySelector('.hero__img');
  if (heroImg && window.innerWidth > 768) {
    window.addEventListener('scroll', () => {
      const scrolled = window.pageYOffset;
      heroImg.style.transform = `scale(1) translateY(${scrolled * 0.3}px)`;
    }, { passive: true });
  }

});
