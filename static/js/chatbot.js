// 1. Move config to global scope so all functions can access it
let chatbotConfig = {};

// Conversation history
let conversationHistory = [];
const MAX_HISTORY_MESSAGES = 20;
const MENU_INTENT_REGEX = /\b(menu|show\s+menu|view\s+menu|full\s+menu|what.*menu)\b/i;

// Order state management
let orderState = {
    items: [],
    customerName: '',
    tableNumber: '',
    isCollectingOrder: false
};

let cartState = {
    items: []
};

const assistantPanel = document.getElementById('assistant-panel');
const assistantToggleButton = document.getElementById('assistant-toggle');
const assistantToggleLabel = assistantToggleButton ? assistantToggleButton.querySelector('.assistant-toggle-label') : null;
const assistantCloseButton = document.getElementById('assistant-close');
const assistantOpenCartButton = document.getElementById('assistant-open-cart');
const assistantUnreadBadge = document.getElementById('assistant-unread');
const menuFilterToggleButton = document.getElementById('menu-filter-toggle');
const kioskFilterDrawer = document.getElementById('kiosk-filter-drawer');
const kioskFilterBackdrop = document.getElementById('kiosk-filter-backdrop');
const kioskFilterCloseButton = document.getElementById('kiosk-filter-close');
const kioskFilterList = document.getElementById('kiosk-filter-list');
const cartPopup = document.getElementById('cart-popup');
const cartPopupBody = document.getElementById('cart-popup-body');
const cartBackdrop = document.getElementById('cart-backdrop');
const cartCloseButton = document.getElementById('cart-close');
const cartOpenChatButton = document.getElementById('cart-open-chat');
let assistantUnreadCount = 0;
let activeKioskCategory = 'all';
let availableKioskCategories = [];

function parseItemUnitPrice(priceValue) {
    const raw = (priceValue || '').toString().trim();
    if (!raw) return 0;
    const cleaned = raw.replace(/[^0-9.]/g, '');
    const parsed = parseFloat(cleaned);
    return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeItemName(name) {
    return (name || '').toString().trim().toLowerCase();
}

function getCartTotal() {
    return cartState.items.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 0)), 0);
}

function getCartPayload() {
    return cartState.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price
    }));
}

function getCartContextText() {
    if (!cartState.items.length) return 'Cart is currently empty.';
    const currency = chatbotConfig.currency_symbol || '₱';
    const lines = cartState.items.map((item) => `${item.quantity}x ${item.name} (${currency}${(item.price * item.quantity).toFixed(2)})`);
    return `${lines.join(', ')}. Total: ${currency}${getCartTotal().toFixed(2)}`;
}

function pushHistory(entry) {
    conversationHistory.push(entry);
    if (conversationHistory.length > MAX_HISTORY_MESSAGES) {
        conversationHistory = conversationHistory.slice(-MAX_HISTORY_MESSAGES);
    }
}

function setOrderNumber(value) {
    const badge = document.getElementById('order-number');
    if (!badge) {
        return;
    }
    const normalized = value ? `Order #${value}` : 'Order #--';
    badge.textContent = normalized;
}

function isAssistantOpen() {
    return Boolean(assistantPanel && !assistantPanel.classList.contains('is-closed'));
}

function syncAssistantUnreadBadge() {
    if (!assistantUnreadBadge) return;
    if (assistantUnreadCount > 0) {
        assistantUnreadBadge.style.display = 'inline-flex';
        assistantUnreadBadge.textContent = assistantUnreadCount > 99 ? '99+' : String(assistantUnreadCount);
    } else {
        assistantUnreadBadge.style.display = 'none';
        assistantUnreadBadge.textContent = '0';
    }
}

function clearAssistantUnread() {
    assistantUnreadCount = 0;
    syncAssistantUnreadBadge();
}

function bumpAssistantUnread() {
    if (isAssistantOpen()) return;
    assistantUnreadCount += 1;
    syncAssistantUnreadBadge();
}

function setAssistantOpen(open) {
    if (!assistantPanel || !assistantToggleButton) return;
    assistantPanel.classList.toggle('is-closed', !open);
    assistantPanel.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) {
        clearAssistantUnread();
        const txt = document.getElementById('txt');
        if (txt) txt.focus();
    }
    syncUnifiedToggleState();
}

function isKioskFilterOpen() {
    return Boolean(kioskFilterDrawer && !kioskFilterDrawer.classList.contains('is-closed'));
}

function setKioskFilterOpen(open) {
    if (!kioskFilterDrawer || !kioskFilterBackdrop || !menuFilterToggleButton) return;
    kioskFilterDrawer.classList.toggle('is-closed', !open);
    kioskFilterBackdrop.classList.toggle('is-closed', !open);
    kioskFilterDrawer.setAttribute('aria-hidden', open ? 'false' : 'true');
    kioskFilterBackdrop.setAttribute('aria-hidden', open ? 'false' : 'true');
    menuFilterToggleButton.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function isCartPopupOpen() {
    return Boolean(cartPopup && !cartPopup.classList.contains('is-closed'));
}

function setCartPopupOpen(open) {
    if (!cartPopup || !cartBackdrop || !assistantToggleButton) return;
    cartPopup.classList.toggle('is-closed', !open);
    cartBackdrop.classList.toggle('is-closed', !open);
    cartPopup.setAttribute('aria-hidden', open ? 'false' : 'true');
    cartBackdrop.setAttribute('aria-hidden', open ? 'false' : 'true');
    syncUnifiedToggleState();
}

function syncUnifiedToggleState() {
    if (!assistantToggleButton) return;
    const expanded = (isAssistantOpen() || isCartPopupOpen()) ? 'true' : 'false';
    assistantToggleButton.setAttribute('aria-expanded', expanded);
}

function syncCartBadge() {
    if (!assistantToggleLabel) return;
    const count = cartState.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
    assistantToggleLabel.textContent = count > 0 ? `Cart (${count})` : 'Cart';
}

function syncKioskCategoryUI() {
    const selected = activeKioskCategory || 'all';

    document.querySelectorAll('.kiosk-category-btn').forEach((btn) => {
        btn.classList.toggle('is-active', (btn.dataset.category || 'all') === selected);
    });

    document.querySelectorAll('.kiosk-drawer-filter-btn').forEach((btn) => {
        btn.classList.toggle('is-active', (btn.dataset.category || 'all') === selected);
    });

    document.querySelectorAll('.kiosk-item-card').forEach((card) => {
        const cardCategory = card.dataset.category || '';
        card.style.display = (selected === 'all' || selected === cardCategory) ? '' : 'none';
    });
}

function setKioskCategory(category) {
    const normalized = (category || 'all').trim() || 'all';
    const allowed = new Set(['all', ...availableKioskCategories]);
    activeKioskCategory = allowed.has(normalized) ? normalized : 'all';
    syncKioskCategoryUI();
}

function renderKioskFilterList(categories) {
    if (!kioskFilterList) return;
    const buttons = ['all', ...categories]
        .map((category) => {
            const slug = category === 'all' ? 'all' : slugifyCategory(category);
            const label = category === 'all' ? 'All Items' : category;
            return `<button type="button" class="kiosk-drawer-filter-btn" data-category="${escapeHtml(slug)}">${escapeHtml(label)}</button>`;
        })
        .join('');
    kioskFilterList.innerHTML = buttons;
}

async function loadConfig() {
    try {
        const res = await fetch('/api/config');
        if (!res.ok) return {};
        const data = await res.json();
        // Update the cached variable
        chatbotConfig = data; 
        return data;
    } catch (e) {
        console.error("Failed to load config:", e);
        return {};
    }
}

async function loadOrderNumber() {
    try {
        const res = await fetch('/api/orders/session');
        if (!res.ok) {
            return;
        }
        const data = await res.json();
        setOrderNumber(data.order_number);
    } catch (e) {
        console.error('Failed to load order number:', e);
    }
}

function showTyping() {
    const el = document.getElementById('typing-indicator');
    const messages = document.getElementById('messages');
    if (el && messages) {
        messages.appendChild(el);
        el.style.display = 'block';
        messages.scrollTop = messages.scrollHeight;
    }
}

function hideTyping() {
    const el = document.getElementById('typing-indicator');
    if (el) {
        el.style.display = 'none';
    }
}

function hasMenuItems(cfg) {
    return Boolean(cfg && Array.isArray(cfg.menu_items) && cfg.menu_items.some((item) => (item && item.name)));
}

function isMenuRequest(text) {
    return MENU_INTENT_REGEX.test((text || '').trim());
}

function formatPriceForMenu(price) {
    const currency = chatbotConfig.currency_symbol || '₱';
    const raw = (price || '').toString().trim();
    if (!raw) return '';
    const cleaned = raw.replace(/[^0-9.]/g, '');
    const numeric = parseFloat(cleaned);
    if (!Number.isNaN(numeric)) {
        return `${currency}${numeric.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `${currency}${raw.replace(currency, '').trim()}`;
}

function slugifyCategory(value) {
    return (value || 'Other').toString().trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function getKioskData() {
    const items = (chatbotConfig.menu_items || [])
        .filter((item) => item && item.name)
        .map((item) => {
            const category = (item.category || 'Other').toString().trim() || 'Other';
            const imageUrl = (item.image_url || '').toString().trim();
            const fallbackImage = (chatbotConfig.logo_url || '').toString().trim() || '/static/uploads/logo.png';
            return {
                name: (item.name || '').toString().trim(),
                description: (item.description || '').toString().trim(),
                category,
                categorySlug: slugifyCategory(category),
                imageUrl,
                displayImageUrl: imageUrl || fallbackImage,
                priceLabel: formatPriceForMenu(item.price)
            };
        });

    const categories = Array.from(new Set(items.map((item) => item.category)))
        .sort((a, b) => a.localeCompare(b));

    return { items, categories };
}

function buildMiniKioskHtml(items, categories) {
    const cards = items
        .map((item) => {
            const desc = item.description ? `<div class="kiosk-item-desc">${escapeHtml(item.description)}</div>` : '';
            const priceBadge = item.priceLabel ? `<div class="kiosk-price-badge">${escapeHtml(item.priceLabel)}</div>` : '';
            return `
                <article class="kiosk-item-card" data-category="${escapeHtml(item.categorySlug)}">
                    <div class="kiosk-item-media">
                        <img class="kiosk-item-image" src="${escapeHtml(item.displayImageUrl)}" alt="${escapeHtml(item.name)}" loading="lazy">
                        ${priceBadge}
                    </div>
                    <div class="kiosk-item-body">
                        <div class="kiosk-item-name">${escapeHtml(item.name)}</div>
                        ${desc}
                        <div class="kiosk-item-footer">
                            <button type="button" class="kiosk-add-btn" data-item-name="${escapeHtml(item.name)}">Add To Cart</button>
                        </div>
                    </div>
                </article>
            `;
        })
        .join('');

    return `
        <div class="mini-kiosk">
            <div class="kiosk-header">
                <div class="kiosk-title">Deals & Menu</div>
                <div class="kiosk-subtitle">Tap a food card to add it to your cart</div>
            </div>
            <div class="kiosk-grid">
                ${cards}
            </div>
        </div>
    `;
}

function renderCartPanel() {
    const cartEl = document.getElementById('kiosk-cart');
    const popupEl = cartPopupBody;
    if (!cartEl && !popupEl) return;

    const currency = chatbotConfig.currency_symbol || '₱';

    const buildMarkup = () => {
        if (!cartState.items.length) {
            return `
                <div class="kiosk-cart-card is-empty">
                    <div class="kiosk-cart-title">Your Cart</div>
                    <div class="kiosk-cart-empty">No items yet. Add dishes from the menu below.</div>
                </div>
            `;
        }

        const rows = cartState.items.map((item) => `
            <div class="kiosk-cart-item">
                <div class="kiosk-cart-item-main">
                    <div class="kiosk-cart-item-name">${escapeHtml(item.name)}</div>
                    <div class="kiosk-cart-item-price">${currency}${(item.price * item.quantity).toFixed(2)}</div>
                </div>
                <div class="kiosk-cart-item-actions">
                    <button type="button" class="kiosk-cart-qty-btn" data-cart-action="dec" data-item-name="${escapeHtml(item.name)}">-</button>
                    <span class="kiosk-cart-qty">${item.quantity}</span>
                    <button type="button" class="kiosk-cart-qty-btn" data-cart-action="inc" data-item-name="${escapeHtml(item.name)}">+</button>
                    <button type="button" class="kiosk-cart-remove-btn" data-cart-action="remove" data-item-name="${escapeHtml(item.name)}">Remove</button>
                </div>
            </div>
        `).join('');

        return `
            <div class="kiosk-cart-card">
                <div class="kiosk-cart-top">
                    <div class="kiosk-cart-title">Your Cart (${cartState.items.length})</div>
                    <button type="button" class="kiosk-cart-clear-btn" data-cart-action="clear">Clear</button>
                </div>
                <div class="kiosk-cart-items">${rows}</div>
                <div class="kiosk-cart-footer">
                    <div class="kiosk-cart-total">Total: ${currency}${getCartTotal().toFixed(2)}</div>
                    <div class="kiosk-cart-footer-actions">
                        <button type="button" class="kiosk-cart-chat-btn" data-cart-action="ask">Ask About Cart</button>
                        <button type="button" class="kiosk-cart-checkout-btn" data-cart-action="checkout">Checkout</button>
                    </div>
                </div>
            </div>
        `;
    };

    const markup = buildMarkup();
    if (cartEl) cartEl.innerHTML = markup;
    if (popupEl) popupEl.innerHTML = markup;
    syncCartBadge();
}

function addItemToCartByName(itemName) {
    const { items } = getKioskData();
    const normalizedName = normalizeItemName(itemName);
    const source = items.find((item) => normalizeItemName(item.name) === normalizedName);
    if (!source) return;

    const existing = cartState.items.find((item) => normalizeItemName(item.name) === normalizedName);
    if (existing) {
        existing.quantity += 1;
    } else {
        cartState.items.push({
            name: source.name,
            quantity: 1,
            price: parseItemUnitPrice(source.priceLabel)
        });
    }

    renderCartPanel();
}

function updateCartItemQuantity(itemName, delta) {
    const normalizedName = normalizeItemName(itemName);
    const existing = cartState.items.find((item) => normalizeItemName(item.name) === normalizedName);
    if (!existing) return;

    existing.quantity += delta;
    if (existing.quantity <= 0) {
        cartState.items = cartState.items.filter((item) => normalizeItemName(item.name) !== normalizedName);
    }
    renderCartPanel();
}

function removeCartItem(itemName) {
    const normalizedName = normalizeItemName(itemName);
    cartState.items = cartState.items.filter((item) => normalizeItemName(item.name) !== normalizedName);
    renderCartPanel();
}

function clearCart() {
    cartState.items = [];
    renderCartPanel();
}

function syncCartFromAIItems(aiItems) {
    if (!Array.isArray(aiItems) || aiItems.length === 0) return;
    cartState.items = aiItems.map((item) => ({
        name: (item.name || '').toString().trim(),
        quantity: Number(item.quantity || 1),
        price: Number(item.price || 0)
    })).filter((item) => item.name);
    renderCartPanel();
}

function focusKioskPanel() {
    const panel = document.getElementById('kiosk-panel');
    if (!panel) return;
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    panel.classList.add('is-highlighted');
    window.setTimeout(() => panel.classList.remove('is-highlighted'), 750);
}

function renderKioskPanel() {
    const panel = document.getElementById('kiosk-panel');
    if (!panel) return;

    if (!hasMenuItems(chatbotConfig)) {
        panel.innerHTML = '<div class="kiosk-empty">Menu is currently unavailable or not yet configured.</div>';
        availableKioskCategories = [];
        renderKioskFilterList([]);
        return;
    }

    const { items, categories } = getKioskData();
    panel.innerHTML = buildMiniKioskHtml(items, categories);
    availableKioskCategories = categories.map((category) => slugifyCategory(category));
    renderKioskFilterList(categories);
    setKioskCategory(activeKioskCategory);
    renderCartPanel();
}

function postMiniKiosk() {
    if (!hasMenuItems(chatbotConfig)) {
        postMessage('Menu is currently unavailable or not yet configured.', 'bot');
        return;
    }

    const container = document.getElementById('messages');
    if (!container) return;

    const { items, categories } = getKioskData();

    const row = document.createElement('div');
    row.className = 'message-row bot';

    const img = document.createElement('img');
    img.className = 'avatar';
    img.src = (chatbotConfig && chatbotConfig.chatbot_avatar) ? chatbotConfig.chatbot_avatar : '/static/img/bot-avatar.svg';
    img.alt = 'Bot';

    const bubble = document.createElement('div');
    bubble.className = 'bubble bot mini-kiosk-bubble';

    bubble.innerHTML = buildMiniKioskHtml(items, categories);

    row.appendChild(img);
    row.appendChild(bubble);
    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
}

function renderAIResult(result) {
    if (result.orderReady) {
        if (result.items && result.items.length) {
            syncCartFromAIItems(result.items);
        }
        postOrderForm(result);
        return;
    }

    if (result.currentItems && result.currentItems.length > 0) {
        syncCartFromAIItems(result.currentItems);
    }

    postMessage(result.message || result, 'bot');
}

// Shared send handler used by click and Enter key.
async function handleSendMessage() {
    const txt = document.getElementById('txt');
    if (!txt || txt.disabled) return;

    const v = txt.value.trim();
    if (!v) return;

    try {
        postMessage(v, 'user');
        txt.value = '';
        txt.disabled = true;

        showTyping();
        const result = await sendToAI(v);
        hideTyping();

        renderAIResult(result);

        // Prioritize kiosk panel when menu is requested.
        if (isMenuRequest(v) && hasMenuItems(chatbotConfig) && !result.orderReady) {
            postMessage('The order kiosk is ready above. Tap items there, and ask me here for help anytime.', 'bot');
            focusKioskPanel();
        }
    } catch (e) {
        hideTyping();
        console.error('Send handler error:', e);
        postMessage('Sorry, I encountered an error. Please try again.', 'bot');
    } finally {
        txt.disabled = false;
        txt.focus();
    }
}

const sendButton = document.getElementById('send');
if (sendButton) {
    // Use property assignment so reloading the script does not stack handlers.
    sendButton.onclick = () => {
        handleSendMessage();
    };
}

if (assistantToggleButton) {
    assistantToggleButton.onclick = () => {
        if (isAssistantOpen()) {
            setAssistantOpen(false);
            return;
        }
        if (isCartPopupOpen()) {
            setCartPopupOpen(false);
            return;
        }
        // Unified behavior: open cart first.
        setCartPopupOpen(true);
    };
}

if (assistantCloseButton) {
    assistantCloseButton.onclick = () => {
        setAssistantOpen(false);
    };
}

if (menuFilterToggleButton) {
    menuFilterToggleButton.onclick = () => {
        setKioskFilterOpen(!isKioskFilterOpen());
    };
}

if (kioskFilterCloseButton) {
    kioskFilterCloseButton.onclick = () => {
        setKioskFilterOpen(false);
    };
}

if (kioskFilterBackdrop) {
    kioskFilterBackdrop.onclick = () => {
        setKioskFilterOpen(false);
    };
}

if (cartCloseButton) {
    cartCloseButton.onclick = () => {
        setCartPopupOpen(false);
    };
}

if (assistantOpenCartButton) {
    assistantOpenCartButton.onclick = () => {
        setAssistantOpen(false);
        setCartPopupOpen(true);
    };
}

if (cartOpenChatButton) {
    cartOpenChatButton.onclick = () => {
        setCartPopupOpen(false);
        setAssistantOpen(true);
    };
}

if (cartBackdrop) {
    cartBackdrop.onclick = () => {
        setCartPopupOpen(false);
    };
}

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        if (isCartPopupOpen()) {
            setCartPopupOpen(false);
            return;
        }
        if (isKioskFilterOpen()) {
            setKioskFilterOpen(false);
            return;
        }
        if (isAssistantOpen()) {
            setAssistantOpen(false);
        }
    }
});

function applyConfig(cfg) {
    if (!cfg) return;
    const root = document.documentElement;

    function toReadableForeground(bgColor) {
        const color = (bgColor || '').toString().trim();
        const hexMatch = color.match(/^#([0-9a-fA-F]{6})$/);
        if (!hexMatch) return '#ffffff';

        const hex = hexMatch[1];
        const r = parseInt(hex.slice(0, 2), 16) / 255;
        const g = parseInt(hex.slice(2, 4), 16) / 255;
        const b = parseInt(hex.slice(4, 6), 16) / 255;

        const linear = (channel) => channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
        const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
        return luminance > 0.5 ? '#000000' : '#ffffff';
    }
    
    // Apply main brand color
    if (cfg.main_color) {
        root.style.setProperty('--main-color', cfg.main_color);
        root.style.setProperty('--accent', cfg.main_color);
        root.style.setProperty('--main-foreground', toReadableForeground(cfg.main_color));
    } else if (cfg.color_hex) {
        root.style.setProperty('--main-color', cfg.color_hex);
        root.style.setProperty('--accent', cfg.color_hex);
        root.style.setProperty('--main-foreground', toReadableForeground(cfg.color_hex));
    }
    
    // Apply main foreground color
    if (cfg.main_foreground) {
        root.style.setProperty('--main-foreground', cfg.main_foreground);
    }
    
    // Apply sub/secondary color
    if (cfg.sub_color) {
        root.style.setProperty('--sub-color', cfg.sub_color);
        root.style.setProperty('--bubble-user', cfg.sub_color);
        root.style.setProperty('--sub-foreground', toReadableForeground(cfg.sub_color));
    }
    
    // Apply sub foreground color
    if (cfg.sub_foreground) {
        root.style.setProperty('--sub-foreground', cfg.sub_foreground);
    }
    
    if (cfg.text_secondary && isValidColor(cfg.text_secondary)) {
        root.style.setProperty('--text-secondary', cfg.text_secondary);
    }
    // Keep body copy readable and stable.
    root.style.setProperty('--text', '#1f2937');
    root.style.setProperty('--text-primary', '#1f2937');
    
    // Apply other settings
    if (cfg.menu_text) {
        const pm = document.getElementById('preview-menu');
        if (pm) pm.textContent = cfg.menu_text;
    }
    if (cfg.establishment_name) {
        const nameE1 = document.getElementById('resto-name-text');
        if (nameE1) {
            nameE1.textContent = cfg.establishment_name;
        }
    }
    if (cfg.font_family) document.body.style.fontFamily = cfg.font_family + ', Arial, sans-serif';
}

/**
 * Validate if a color string is a valid hex or rgb color
 */
function isValidColor(color) {
    if (!color || typeof color !== 'string') return false;
    // Check for valid hex format (#000000, #000, etc.)
    if (/^#([0-9a-fA-F]{3}){1,2}$/.test(color)) return true;
    // Check for valid rgb/rgba format
    if (/^rgba?\(/.test(color)) return true;
    return false;
}

function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatMessage(text) {
    const safe = escapeHtml(text);
    const withCode = safe.replace(/`([^`]+)`/g, '<code>$1</code>');
    const withBold = withCode.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    const withItalic = withBold.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    return withItalic.replace(/\n/g, '<br>');
}

function extractPhotoUrl(line) {
    // Match: database photo URLs (/menu/photo/{uuid}), external URLs, or filesystem URLs with extensions
    const match = line.match(/(?:\/menu\/photo\/[a-f0-9\-]+|https?:\/\/[^\s]+|\/static\/uploads\/[^\s]+?\.(?:png|jpe?g|gif|svg))/i);
    if (!match) return '';
    return match[0].replace(/[),.!?]+$/, '');
}

function buildBotBubbleContent(text) {
    const wrapper = document.createElement('div');
    const normalized = (text || '').replace(/<br\s*\/?>/gi, '\n');
    const lines = normalized.split('\n');

    lines.forEach((rawLine) => {
        const line = rawLine.trim();
        if (!line) return;

        const photoUrl = extractPhotoUrl(line);
        if (photoUrl) {
            const captionText = line
                .replace(photoUrl, '')
                .replace(/\s*•?\s*photo:\s*/i, '')
                .replace(/\s*[:\-–]\s*$/i, '')
                .trim();
            const card = document.createElement('div');
            card.className = 'menu-photo-card';

            if (captionText) {
                const caption = document.createElement('div');
                caption.className = 'menu-photo-caption';
                caption.innerHTML = formatMessage(captionText);
                card.appendChild(caption);
            }

            const img = document.createElement('img');
            img.className = 'menu-photo-image';
            img.src = photoUrl;
            img.alt = captionText || 'Menu photo';
            img.loading = 'lazy';
            card.appendChild(img);
            wrapper.appendChild(card);
            return;
        }

        const textLine = document.createElement('div');
        textLine.className = 'chat-line';
        textLine.innerHTML = formatMessage(line);
        wrapper.appendChild(textLine);
    });

    if (!wrapper.childNodes.length) {
        wrapper.innerHTML = formatMessage(text || '');
    }

    return wrapper;
}

function postMessage(text, from = 'user') {
    const container = document.getElementById('messages');
    const row = document.createElement('div');
    row.className = 'message-row ' + (from === 'user' ? 'user' : 'bot');

    const img = document.createElement('img');
    img.className = 'avatar';
    
    // Use the global chatbotConfig for avatars
    if (from === 'bot') {
        img.src = (chatbotConfig && chatbotConfig.chatbot_avatar) ? chatbotConfig.chatbot_avatar : '/static/img/bot-avatar.svg';
        img.alt = 'Bot';
    } else {
        img.src = (chatbotConfig && chatbotConfig.user_avatar) ? chatbotConfig.user_avatar : '/static/img/user-avatar.svg';
        img.alt = 'You';
    }

    const bubble = document.createElement('div');
    bubble.className = 'bubble ' + (from === 'user' ? 'user' : 'bot');
    if (from === 'bot') {
        bubble.appendChild(buildBotBubbleContent(text));
    } else {
        bubble.innerHTML = formatMessage(text);
    }

    // For both user and bot: img first, bubble second (flex-direction: row-reverse handles the rest)
    row.appendChild(img);
    row.appendChild(bubble);

    container.appendChild(row);
    container.scrollTop = container.scrollHeight;

    if (from === 'bot') {
        bumpAssistantUnread();
    }
}

function postOrderForm(orderData) {
    const container = document.getElementById('messages');
    const row = document.createElement('div');
    row.className = 'message-row bot';
    
    const img = document.createElement('img');
    img.className = 'avatar';
    img.src = (chatbotConfig && chatbotConfig.chatbot_avatar) ? chatbotConfig.chatbot_avatar : '/static/img/bot-avatar.svg';
    img.alt = 'Bot';
    
    const currency = (chatbotConfig && chatbotConfig.currency_symbol) ? chatbotConfig.currency_symbol : '₱';
    
    const orderSummary = orderData.items.map(item => {
        const total = (item.price * item.quantity).toFixed(2);
        return `${item.name} x${item.quantity}: ${currency}${total}`;
    }).join('<br>');
    
    const bubble = document.createElement('div');
    bubble.className = 'bubble bot';
    bubble.classList.add('order-form-bubble');
    bubble.innerHTML = `
        <div class="order-summary-block">
            <strong>Order Summary:</strong><br>
            ${orderSummary}<br><br>
            <strong>Total: ${currency}${orderData.total.toFixed(2)}</strong>
        </div>
        <form id="order-form" class="order-form-fields">
            <input type="text" id="order-name" placeholder="Your name" required class="order-form-input">
            <input type="text" id="order-table" placeholder="Table number" value="${orderState.tableNumber || ''}" required class="order-form-input">
            <button type="button" id="confirm-order-btn" class="order-form-confirm">Confirm & Place Order</button>
        </form>
    `;
    
    row.appendChild(img);
    row.appendChild(bubble);
    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
    bumpAssistantUnread();
    
    // Store order data and attach event listener
    orderState.items = orderData.items;
    
    document.getElementById('confirm-order-btn').addEventListener('click', async () => {
        const name = document.getElementById('order-name').value.trim();
        const tableNumber = document.getElementById('order-table').value.trim();
        
        if (!name || !tableNumber) {
            window.appShowAlert('Please provide your name and table number', 'Missing Information');
            return;
        }
        
        orderState.customerName = name;
        orderState.tableNumber = tableNumber;
        orderState.isCollectingOrder = false;
        
        // Disable button and show loading
        const btn = document.getElementById('confirm-order-btn');
        btn.disabled = true;
        btn.textContent = 'Processing...';
        
        await submitOrder();
    });
}

function postCartSummary(items, total) {
    const container = document.getElementById('messages');
    const row = document.createElement('div');
    row.className = 'message-row bot';
    
    const img = document.createElement('img');
    img.className = 'avatar';
    img.src = (chatbotConfig && chatbotConfig.chatbot_avatar) ? chatbotConfig.chatbot_avatar : '/static/img/bot-avatar.svg';
    img.alt = 'Bot';
    
    const currency = (chatbotConfig && chatbotConfig.currency_symbol) ? chatbotConfig.currency_symbol : '₱';
    
    const cartItems = items.map(item => {
        const itemTotal = (item.price * item.quantity).toFixed(2);
        return `${item.name} x${item.quantity}: ${currency}${itemTotal}`;
    }).join('<br>');
    
    const bubble = document.createElement('div');
    bubble.className = 'bubble bot';
    bubble.classList.add('cart-summary-bubble');
    bubble.innerHTML = `
        <div class="cart-summary-body">
            <strong class="cart-summary-title">Current Cart:</strong>
            <div class="cart-summary-items">
                ${cartItems}
            </div>
            <strong class="cart-summary-total">Total: ${currency}${total.toFixed(2)}</strong>
        </div>
    `;
    
    row.appendChild(img);
    row.appendChild(bubble);
    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
    bumpAssistantUnread();
}

async function sendToAI(message) {
    try {
        // Add user message to history
        pushHistory({ role: 'user', content: message });
        
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                message,
                history: conversationHistory.slice(0, -1), // Send history excluding current message
                cart_items: getCartPayload(),
                cart_context: getCartContextText()
            })
        });
        const data = await res.json();
        
        // Add bot response to history
        const botResponse = data.response || 'Sorry, I could not process that.';
        pushHistory({ role: 'assistant', content: botResponse });
        
        // Check if the response contains an order ready
        if (data.order_ready && data.order_items && data.order_items.length > 0) {
            return {
                orderReady: true,
                items: data.order_items,
                total: data.order_total,
                message: botResponse
            };
        }
        
        // Return cart items if detected during conversation
        const result = {
            message: botResponse
        };
        
        if (data.current_items && data.current_items.length > 0) {
            result.currentItems = data.current_items;
            result.currentTotal = data.current_total;
        }
        
        return result;
    } catch (e) {
        console.error('Chat error:', e);
        return {
            message: 'Sorry, I encountered an error. Please try again.'
        };
    }
}

const txtInput = document.getElementById('txt');
if (txtInput) {
    // Use property assignment so reloading the script does not stack handlers.
    txtInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSendMessage();
        }
    };
}

// Initialization
(async function () {
    const cfg = await loadConfig();
    applyConfig(cfg);
    renderKioskPanel();
    loadOrderNumber();
    syncAssistantUnreadBadge();
    setAssistantOpen(false);
    setKioskFilterOpen(false);
    setCartPopupOpen(false);
    syncCartBadge();
    
    // Read table number from QR code URL parameter
    const params = new URLSearchParams(window.location.search);
    const tableFromQR = params.get('table');
    if (tableFromQR) {
        orderState.tableNumber = tableFromQR;
    }
})();

// Quick-reply definitions
function buildMenuText(cfg) {
    if (!cfg) return '';
    const items = cfg.menu_items || [];
    const currency = cfg.currency_symbol || '₱';
    if (items.length) {
        const normalizePrice = (price) => {
            const raw = (price || '').toString().trim();
            if (!raw) return '';
            const cleaned = raw.replace(/[^0-9.]/g, '');
            const value = parseFloat(cleaned);
            if (!Number.isNaN(value)) {
                return `${currency}${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            }
            return `${currency}${raw.replace(currency, '').trim()}`;
        };

        const shortDesc = (desc) => {
            const text = (desc || '').toString().trim();
            if (!text) return '';
            return text.length > 90 ? `${text.slice(0, 87)}...` : text;
        };

        const grouped = {};
        items.forEach((item) => {
            const name = (item.name || '').trim();
            if (!name) return;
            const category = (item.category || 'Other').toString().trim() || 'Other';
            if (!grouped[category]) grouped[category] = [];
            grouped[category].push(item);
        });

        const categoryNames = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
        const lines = [];
        categoryNames.forEach((category) => {
            lines.push(`${category}:`);
            grouped[category].forEach((item, index) => {
                const name = (item.name || '').trim();
                const desc = shortDesc(item.description);
                const price = normalizePrice(item.price);
                const imageUrl = (item.image_url || '').toString().trim();
                let line = `${index + 1}) ${name}`;
                if (desc) line += ` — ${desc}`;
                if (price) line += ` (${price})`;
                if (imageUrl) line += ` • Photo: ${imageUrl}`;
                lines.push(line);
            });
            lines.push('');
        });

        const output = lines.join('\n').trim();
        if (output) return output;
    }
    return cfg.menu_text || '';
}

const canned = {
    'menu': (cfg) => buildMenuText(cfg) || 'Menu is currently unavailable or not yet configured.',
    'order': () => 'Sure — what would you like to order?',
    'hours': () => 'We are open Mon–Sun, 9:00 AM to 10:00 PM.',
    'support': (cfg) => `You can reach support at ${cfg && cfg.business_email ? cfg.business_email : 'support@example.com'}.`
};

// Order placement helper function
async function submitOrder() {
    if (orderState.items.length === 0) {
        postMessage('Your order is empty. Please add items first.', 'bot');
        return;
    }
    
    if (!orderState.customerName || !orderState.tableNumber) {
        postMessage('Please provide your name and table number to confirm the order.', 'bot');
        return;
    }
    
    try {
        const totalAmount = orderState.items.reduce((sum, item) => {
            const price = parseFloat(item.price) || 0;
            const qty = item.quantity || 1;
            return sum + (price * qty);
        }, 0);
        
        const response = await fetch('/api/orders/place', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                customer_name: orderState.customerName,
                table_number: orderState.tableNumber,
                items: orderState.items,
                total_amount: totalAmount
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            postMessage(`✓ ${data.message}`, 'bot');
            // Reset order state and conversation history
            orderState = { items: [], customerName: '', tableNumber: '', isCollectingOrder: false };
            clearCart();
            conversationHistory = [];
        } else {
            postMessage(`Order failed: ${data.error}`, 'bot');
        }
    } catch (e) {
        postMessage('Failed to place order. Please try again.', 'bot');
        console.error('Order submission error:', e);
    }
}

// Fixed the incomplete click listener and removed redundant fetch
document.querySelectorAll('.quick-btn').forEach(btn => {
    // Use property assignment so reloading the script does not stack handlers.
    btn.onclick = async () => {
        const action = btn.dataset.action;
        const label = btn.textContent.trim();
        
        postMessage(label, 'user');

        if (action === 'menu') {
            showTyping();
            setTimeout(() => {
                hideTyping();
                if (hasMenuItems(chatbotConfig)) {
                    postMessage('Kiosk is displayed above. Tap any item there to add it to your order.', 'bot');
                    focusKioskPanel();
                } else {
                    postMessage(canned.menu(chatbotConfig), 'bot');
                }
            }, 350);
        } else if (action === 'order') {
            if (!cartState.items.length) {
                postMessage('Your cart is empty. Add items from the kiosk first, and I will help you checkout.', 'bot');
            } else {
                setAssistantOpen(true);
                postOrderForm({
                    items: cartState.items,
                    total: getCartTotal()
                });
            }
        } else if (canned[action]) {
            showTyping();
            // Using the already-loaded chatbotConfig
            const reply = await canned[action](chatbotConfig);
            setTimeout(() => {
                hideTyping();
                postMessage(reply, 'bot');
            }, 500);
        } else {
            showTyping();
            const reply = await sendToAI(label);
            hideTyping();
            renderAIResult(reply);
        }
    };
});

const handleKioskInteraction = async (event) => {
        const categoryBtn = event.target.closest('.kiosk-category-btn');
        if (categoryBtn) {
            const selected = categoryBtn.dataset.category || 'all';
            setKioskCategory(selected);
            setKioskFilterOpen(false);
            return;
        }

        const drawerBtn = event.target.closest('.kiosk-drawer-filter-btn');
        if (drawerBtn) {
            const selected = drawerBtn.dataset.category || 'all';
            setKioskCategory(selected);
            setKioskFilterOpen(false);
            return;
        }

        const addBtn = event.target.closest('.kiosk-add-btn');
        if (addBtn) {
            const itemName = (addBtn.dataset.itemName || '').trim();
            if (!itemName) return;
            addItemToCartByName(itemName);
            return;
        }

        const cartActionBtn = event.target.closest('[data-cart-action]');
        if (!cartActionBtn) return;

        const action = (cartActionBtn.dataset.cartAction || '').trim();
        const itemName = (cartActionBtn.dataset.itemName || '').trim();
        if (action === 'inc' && itemName) {
            updateCartItemQuantity(itemName, 1);
            return;
        }
        if (action === 'dec' && itemName) {
            updateCartItemQuantity(itemName, -1);
            return;
        }
        if (action === 'remove' && itemName) {
            removeCartItem(itemName);
            return;
        }
        if (action === 'clear') {
            clearCart();
            return;
        }
        if (action === 'ask') {
            if (!cartState.items.length) {
                postMessage('Your cart is currently empty.', 'bot');
                return;
            }
            setCartPopupOpen(false);
            setAssistantOpen(true);
            const userPrompt = `Please review my cart and suggest complements. Cart: ${getCartContextText()}`;
            postMessage('Can you review my cart and suggest complements?', 'user');
            showTyping();
            const result = await sendToAI(userPrompt);
            hideTyping();
            renderAIResult(result);
            return;
        }
        if (action === 'checkout') {
            if (!cartState.items.length) {
                postMessage('Your cart is currently empty. Add at least one item before checkout.', 'bot');
                return;
            }
            setCartPopupOpen(false);
            setAssistantOpen(true);
            postOrderForm({
                items: cartState.items,
                total: getCartTotal()
            });
        }
};

const messagesContainer = document.getElementById('messages');
if (messagesContainer) {
    messagesContainer.onclick = handleKioskInteraction;
}

const kioskPanel = document.getElementById('kiosk-panel');
if (kioskPanel) {
    kioskPanel.onclick = handleKioskInteraction;
}

if (kioskFilterList) {
    kioskFilterList.onclick = handleKioskInteraction;
}

if (cartPopupBody) {
    cartPopupBody.onclick = handleKioskInteraction;
}