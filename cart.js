/**
 * SEADUCED-EXPERIENCE — Global Cart Logic
 * Handles state, persistence (localStorage), and UI rendering.
 */

const toursData = {
    'book-1h': { title: 'Private 1-Hour Highlights', price: 2499, img: '/images/tour_private_boat.png' },
    'book-winter': { title: '2-Hour Winter Hygge 2026', price: 4999, img: '/images/tour_winter_hygge.webp' },
    'book-reffen': { title: 'Private 3-Hour Extended (Reffen)', price: 4299, img: '/images/tour_sunset_boat.png' },
    'book-premium': { title: 'Private 4-Hour Premium Experience', price: 5999, img: '/images/tour_trekroner.png' },
    // Seasonal & Boutique and Private Tours
    'book-winter-captain': { title: 'Private Boat Tour with Captain', price: 2499, img: '/images/tour_private_boat.png' },
    'book-winter-hygge': { title: 'Private Hygge Winter Tour', price: 4999, img: '/images/tour_winter_hygge_book.webp' },
    'book-christmas': { title: 'Christmas Tour w. Tapas & Champagne', price: 5999, img: '/images/tour_christmas_champagne.webp' }
};

const extraTapas = {
    title: 'Charcuterie',
    img: '/images/tour_christmas_champagne.webp',
    price: 225
};

// Initial state
let cart = {
    tour: null,
    tourQty: 1,
    tapasQty: 0
};

/**
 * Initialize cart from localStorage
 */
function initCart() {
    const savedCart = localStorage.getItem('seaduced_cart');
    if (savedCart) {
        cart = JSON.parse(savedCart);
    }

    // Check for auto-open param (homepage integration)
    const urlParams = new URLSearchParams(window.location.search);
    const tourToOpen = urlParams.get('tour');
    if (tourToOpen && toursData[tourToOpen]) {
        openCart(tourToOpen);
        // Clear param without refresh to avoid re-opening on manual refresh
        window.history.replaceState({}, document.title, window.location.pathname);
    } else {
        renderCart();
    }
}

/**
 * Save cart to localStorage
 */
function saveCart() {
    localStorage.setItem('seaduced_cart', JSON.stringify(cart));
}

/**
 * Open cart with a specific tour
 */
function openCart(tourId) {
    cart.tour = tourId;
    cart.tourQty = 1;
    saveCart();
    renderCart();
    document.getElementById('cart-overlay').classList.add('active');
}

/**
 * Remove everything from cart
 */
function removeTour() {
    cart.tour = null;
    cart.tourQty = 1;
    cart.tapasQty = 0;
    saveCart();
    renderCart();
}

/**
 * Update quantity of the main tour sessions
 */
function updateTourQty(delta) {
    if (!cart.tour) return;
    cart.tourQty = Math.max(1, cart.tourQty + delta);
    saveCart();
    renderCart();
}

/**
 * Update tapas quantity
 */
function updateTapasQty(delta) {
    cart.tapasQty = Math.max(0, cart.tapasQty + delta);
    saveCart();
    renderCart();
}

/**
 * Render cart items and update UI elements
 */
function renderCart() {
    const itemsContainer = document.getElementById('cart-items');
    const totalDisplay = document.getElementById('cart-total-display');
    const trigger = document.getElementById('cart-trigger');
    const badge = document.getElementById('cart-badge');
    const triggerTotal = document.getElementById('cart-trigger-total');

    if (!itemsContainer || !totalDisplay || !trigger) return;

    if (!cart.tour) {
        itemsContainer.innerHTML = `
            <div class="cart-empty">
                <p>Your selection is empty.</p>
                <p style="font-size: 0.8rem; margin-top: 0.5rem;">Explore our tours to get started!</p>
            </div>
        `;
        totalDisplay.textContent = '0 DKK';
        trigger.classList.remove('visible');
        return;
    }

    const tour = toursData[cart.tour];
    const imgBase = '';

    // Build items HTML
    let html = `
        <div class="cart-item">
            <button class="cart-item__remove" onclick="removeTour()" title="Remove">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
            <img src="${imgBase}${tour.img}" alt="${tour.title}">
            <div class="cart-item__info">
                <h4>${tour.title}</h4>
                <div class="cart-item__price">${tour.price.toLocaleString()} DKK / session</div>
                <div class="cart-item__tag">Private Experience</div>
            </div>
        </div>

        <div class="cart-item ${cart.tapasQty === 0 ? 'cart-item--upsell' : ''}">
            ${cart.tapasQty === 0 ? '<span class="upsell-badge">✨ Chef\'s Recommendation</span>' : ''}
            <img src="${imgBase}${extraTapas.img}" alt="${extraTapas.title}">
            <div class="cart-item__info">
                <h4>${extraTapas.title}</h4>
                <div class="cart-item__price">${extraTapas.price} DKK</div>
                ${cart.tapasQty === 0 ? `
                    <button onclick="updateTapasQty(1)" class="btn--add-tapas">Add To Experience +</button>
                ` : `
                    <div class="cart-qty">
                        <button onclick="updateTapasQty(-1)">-</button>
                        <span>${cart.tapasQty}</span>
                        <button onclick="updateTapasQty(1)">+</button>
                    </div>
                `}
            </div>
        </div>
    `;

    itemsContainer.innerHTML = html;

    // Totals Calculation
    const total = (tour.price * cart.tourQty) + (extraTapas.price * cart.tapasQty);
    const roundedTotal = Math.round(total);
    const totalString = roundedTotal.toLocaleString() + ' DKK';

    totalDisplay.textContent = totalString;

    // Update Floating Trigger
    trigger.classList.add('visible');
    badge.textContent = (cart.tapasQty > 0 ? 2 : 1);
    triggerTotal.textContent = totalString;
}

/**
 * Handle checkout navigation
 */
function handleCheckout() {
    if (!cart.tour) return;
    const baseUrl = '/booking/reserve/';
    window.location.href = `${baseUrl}?tour=${cart.tour}&qty=${cart.tourQty}&tapas=${cart.tapasQty}`;
}

// Global checkout listener
document.addEventListener('DOMContentLoaded', () => {
    initCart();

    const bind = (id, fn, event = 'click') => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, fn);
    };

    bind('cart-checkout-btn', handleCheckout);
    
    // Close on overlay click
    const overlay = document.getElementById('cart-overlay');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.remove('active');
        });
    }

    // Close button
    bind('cart-close', () => {
        if (overlay) overlay.classList.remove('active');
    });

    // Floating trigger (open)
    bind('cart-trigger', () => {
        if (overlay) overlay.classList.add('active');
    });
});
