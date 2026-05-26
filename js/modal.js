/**
 * seaAlert(message, options)
 * Custom branded replacement for window.alert()
 *
 * Options:
 *   type: "warning" | "error" | "info"  (default: "warning")
 *   title: string  (auto-set per type if omitted)
 *   btnLabel: string  (default: "OK")
 *
 * Returns a Promise that resolves when the user dismisses the modal.
 */

const ICONS = {
  warning: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  error:   `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  info:    `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
};

const DEFAULT_TITLES = {
  warning: { english: "Please check your details", danish: "Tjek venligst dine oplysninger", spanish: "Revisa tus datos" },
  error:   { english: "Something went wrong",       danish: "Noget gik galt",                 spanish: "Algo salió mal" },
  info:    { english: "Just so you know",            danish: "Til din information",             spanish: "Para que sepas" },
};

export function seaAlert(message, { type = "warning", title, btnLabel, lang = "english" } = {}) {
  return new Promise(resolve => {
    // Ensure stylesheet is loaded
    if (!document.getElementById("sea-modal-css")) {
      const link = document.createElement("link");
      link.id = "sea-modal-css";
      link.rel = "stylesheet";
      link.href = "/css/modal.css";
      document.head.appendChild(link);
    }

    const resolvedTitle = title || (DEFAULT_TITLES[type]?.[lang] ?? DEFAULT_TITLES[type]?.english);
    const resolvedBtn   = btnLabel || (lang === "spanish" ? "Aceptar" : lang === "danish" ? "OK" : "OK");

    const overlay = document.createElement("div");
    overlay.className = "sea-modal-overlay";
    overlay.innerHTML = `
      <div class="sea-modal" role="alertdialog" aria-modal="true" aria-labelledby="sea-modal-title" aria-describedby="sea-modal-msg">
        <div class="sea-modal__icon sea-modal__icon--${type}">${ICONS[type] ?? ICONS.warning}</div>
        <p class="sea-modal__title" id="sea-modal-title">${resolvedTitle}</p>
        <p class="sea-modal__message" id="sea-modal-msg">${message}</p>
        <div class="sea-modal__actions">
          <button class="sea-modal__btn sea-modal__btn--primary" id="sea-modal-ok">${resolvedBtn}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Trigger animation on next frame
    requestAnimationFrame(() => {
      requestAnimationFrame(() => overlay.classList.add("is-visible"));
    });

    function dismiss() {
      overlay.classList.remove("is-visible");
      overlay.addEventListener("transitionend", () => {
        overlay.remove();
        resolve();
      }, { once: true });
    }

    overlay.querySelector("#sea-modal-ok").addEventListener("click", dismiss);

    // Close on backdrop click
    overlay.addEventListener("click", e => { if (e.target === overlay) dismiss(); });

    // Close on Escape
    const onKey = e => { if (e.key === "Escape") { document.removeEventListener("keydown", onKey); dismiss(); } };
    document.addEventListener("keydown", onKey);
  });
}
