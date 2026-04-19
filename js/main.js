import { initBookingPage } from "./booking.js";
import { initExperiencePage } from "./experience.js";
import { initReservePage } from "./reserve.js";
import {
  readBookingFromUrl,
  saveBooking,
} from "./utils.js";

document.addEventListener("DOMContentLoaded", () => {
  initBookingFlow();
  initNavbar();
  initRevealAnimations();
  initClickableCards();
  initTestimonialCarousel();
  initFaqAccordion();
  initSmoothScroll();
  initPreloader();

  if (document.body.classList.contains("booking-page")) {
    initBookingPage();
  }

  if (document.body.classList.contains("reserve-page")) {
    initReservePage();
  }

  if (document.body.classList.contains("experience-page")) {
    initExperiencePage();
  }
});

function initNavbar() {
  const navbar = document.getElementById("navbar");
  const hamburger = document.getElementById("hamburger");
  const mobileMenu = document.getElementById("mobileMenu");

  if (!navbar || !hamburger || !mobileMenu) {
    return;
  }

  const updateNavbar = () => {
    navbar.classList.toggle("navbar--scrolled", window.scrollY > 60);
  };

  updateNavbar();
  window.addEventListener("scroll", updateNavbar, { passive: true });

  hamburger.addEventListener("click", () => {
    const isOpen = mobileMenu.classList.toggle("open");
    hamburger.classList.toggle("active", isOpen);
    hamburger.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });

  mobileMenu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      mobileMenu.classList.remove("open");
      hamburger.classList.remove("active");
      hamburger.setAttribute("aria-expanded", "false");
    });
  });

  // Defensive: explicitly handle Tours navigation if something is overriding it
  document.querySelectorAll('#nav-tours, #mob-tours').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = '/book';
    });
  });
}

function initRevealAnimations() {
  const revealElements = document.querySelectorAll(".reveal");
  if (!revealElements.length || !("IntersectionObserver" in window)) {
    revealElements.forEach((element) => element.classList.add("visible"));
    return;
  }

  document.querySelectorAll(".tours-grid, .features-grid, .quick-reviews, .routes-grid").forEach((grid) => {
    Array.from(grid.children).forEach((child, index) => {
      if (child.classList.contains("reveal")) {
        child.dataset.delay = String(index * 100);
      }
    });
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        const delay = Number.parseInt(entry.target.dataset.delay || "0", 10);
        window.setTimeout(() => entry.target.classList.add("visible"), delay);
        observer.unobserve(entry.target);
      });
    },
    {
      threshold: 0.12,
      rootMargin: "0px 0px -40px 0px",
    }
  );

  revealElements.forEach((element) => {
    observer.observe(element);

    if (element.getBoundingClientRect().top < window.innerHeight) {
      element.classList.add("visible");
    }
  });
}

function initClickableCards() {
  document.querySelectorAll("[data-card-link]").forEach((card) => {
    const href = card.getAttribute("data-card-link");
    if (!href) return;

    const openCard = (event) => {
      if (event.target.closest("button, a, input, select, textarea, label")) {
        return;
      }
      window.location.href = href;
    };

    card.addEventListener("click", openCard);
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openCard(event);
    });
  });
}

function initTestimonialCarousel() {
  const track = document.getElementById("testimonialTrack");
  const prevButton = document.getElementById("carouselPrev");
  const nextButton = document.getElementById("carouselNext");
  const dotsWrapper = document.getElementById("carouselDots");
  const carousel = document.getElementById("testimonialCarousel");

  if (!track || !prevButton || !nextButton || !dotsWrapper || !carousel) {
    return;
  }

  const cards = Array.from(track.querySelectorAll(".testimonial-card"));
  let current = 0;
  let timerId;

  const goTo = (index) => {
    current = (index + cards.length) % cards.length;
    track.style.transform = `translateX(-${current * 100}%)`;
    dotsWrapper.querySelectorAll(".carousel-dot").forEach((dot, dotIndex) => {
      const isActive = dotIndex === current;
      dot.classList.toggle("active", isActive);
      dot.setAttribute("aria-selected", isActive ? "true" : "false");
    });
  };

  cards.forEach((_, index) => {
    const dot = document.createElement("button");
    dot.className = `carousel-dot${index === 0 ? " active" : ""}`;
    dot.setAttribute("role", "tab");
    dot.setAttribute("aria-label", `Testimonial ${index + 1}`);
    dot.setAttribute("aria-selected", index === 0 ? "true" : "false");
    dot.addEventListener("click", () => goTo(index));
    dotsWrapper.appendChild(dot);
  });

  const restart = () => {
    window.clearInterval(timerId);
    timerId = window.setInterval(() => goTo(current + 1), 5000);
  };

  prevButton.addEventListener("click", () => {
    goTo(current - 1);
    restart();
  });

  nextButton.addEventListener("click", () => {
    goTo(current + 1);
    restart();
  });

  carousel.addEventListener("mouseenter", () => window.clearInterval(timerId));
  carousel.addEventListener("mouseleave", restart);

  let touchStartX = 0;
  carousel.addEventListener("touchstart", (event) => {
    touchStartX = event.changedTouches[0].clientX;
  }, { passive: true });

  carousel.addEventListener("touchend", (event) => {
    const delta = touchStartX - event.changedTouches[0].clientX;
    if (Math.abs(delta) <= 40) return;
    goTo(delta > 0 ? current + 1 : current - 1);
    restart();
  }, { passive: true });

  restart();
}

function initFaqAccordion() {
  document.querySelectorAll(".faq-question").forEach((button) => {
    button.addEventListener("click", () => {
      const item = button.closest(".faq-item");
      const answer = document.getElementById(button.getAttribute("aria-controls"));
      const isOpen = item.classList.contains("open");

      document.querySelectorAll(".faq-item.open").forEach((openItem) => {
        if (openItem === item) return;
        openItem.classList.remove("open");
        openItem.querySelector(".faq-question")?.setAttribute("aria-expanded", "false");
        const openAnswer = openItem.querySelector(".faq-answer");
        if (openAnswer) openAnswer.hidden = true;
      });

      item.classList.toggle("open", !isOpen);
      button.setAttribute("aria-expanded", isOpen ? "false" : "true");
      answer.hidden = isOpen;
    });
  });
}

function initSmoothScroll() {
  document.querySelectorAll('a[href*="#"]').forEach((anchor) => {
    anchor.addEventListener("click", (event) => {
      const href = anchor.getAttribute("href");
      if (!href.includes("#")) return;

      const [path, hash] = href.split("#");
      if (!hash) return;

      const pathname = window.location.pathname;
      const samePath = path === "" || pathname === path || (path === "/" && pathname === "/");
      if (!samePath) return;

      const target = document.getElementById(hash);
      if (!target) return;

      event.preventDefault();
      const yOffset =
        -Number.parseInt(
          getComputedStyle(document.documentElement).getPropertyValue("--navbar-h"),
          10
        ) || -72;
      const top = target.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top, behavior: "smooth" });
    });
  });
}

function initBookingFlow() {
  const incoming = readBookingFromUrl();
  if (incoming.tour) {
    saveBooking(incoming);
  }

  document.querySelectorAll("[data-book-tour]").forEach((button) => {
    button.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const card = button.closest("[data-card-link]");
      const href = card ? card.getAttribute("data-card-link") : null;
      if (href) {
        window.location.href = href;
      }
    });
  });
}

function setVH() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}

setVH();

/* ⚠️ IMPORTANTE: solo al cargar */
window.addEventListener('load', () => {
  setVH();
  
  const preloader = document.querySelector('.preloader');
  if (preloader) {
    // Short graceful delay
    setTimeout(() => {
      preloader.classList.add('preloader--hidden');
      setTimeout(() => preloader.remove(), 600);
    }, 400);
  }
});

function initPreloader() {
  // Preloader logic handled in 'load' event above
}