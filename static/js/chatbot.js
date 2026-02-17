// Prevent re-initialization with Turbo - chatbot is persistent across pages
if (window.chatbotScriptInitialized) {
    throw new Error('Chatbot script already loaded');
}

// 1. Move config to global scope so all functions can access it
let chatbotConfig = {};

// Conversation history
let conversationHistory = [];

// Order state management
let orderState = {
    items: [],
    customerName: '',
    tableNumber: '',
    isCollectingOrder: false
};

function setOrderNumber(value) {
    const badge = document.getElementById('order-number');
    if (!badge) {
        return;
    }
    const normalized = value ? `Order #${value}` : 'Order #--';
    badge.textContent = normalized;
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

// Single 'send' handler
document.getElementById('send').addEventListener('click', async () => {
    const txt = document.getElementById('txt');
    const v = txt.value.trim();
    if (!v) return;

    postMessage(v, 'user');
    txt.value = '';
    txt.disabled = true;

    showTyping();
    const result = await sendToAI(v);
    hideTyping();

    // If order is ready, result contains the order form
    if (result.orderReady) {
        postOrderForm(result);
    } else {
        postMessage(result, 'bot');
    }
    
    txt.disabled = false;
    txt.focus();
});

function applyConfig(cfg) {
    if (!cfg) return;
    const root = document.documentElement;
    if (cfg.color_hex) root.style.setProperty('--accent', cfg.color_hex);
    if (cfg.menu_text) {
        const pm = document.getElementById('preview-menu');
        if (pm) pm.textContent = cfg.menu_text;
    }
    if (cfg.establishment_name) {
        const nameE1 = document.getElementById('resto-name-text');
        if (nameE1) {
            nameE1.textContent = cfg.establishment_name + ' - A.I Chatbot';
        }
    }
    if (cfg.font_family) document.body.style.fontFamily = cfg.font_family + ', Arial, sans-serif';
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

    if (from === 'user') {
        row.appendChild(bubble);
        row.appendChild(img);
    } else {
        row.appendChild(img);
        row.appendChild(bubble);
    }

    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
}

function postOrderForm(orderData) {
    const container = document.getElementById('messages');
    const row = document.createElement('div');
    row.className = 'message-row bot';
    
    const img = document.createElement('img');
    img.className = 'avatar';
    img.src = (chatbotConfig && chatbotConfig.chatbot_avatar) ? chatbotConfig.chatbot_avatar : '/static/img/bot-avatar.svg';
    img.alt = 'Bot';
    
    const orderSummary = orderData.items.map(item => {
        const total = (item.price * item.quantity).toFixed(2);
        return `${item.name} x${item.quantity}: $${total}`;
    }).join('<br>');
    
    const bubble = document.createElement('div');
    bubble.className = 'bubble bot';
    bubble.style.minWidth = '300px';
    bubble.innerHTML = `
        <div style="margin-bottom: 12px;">
            <strong>Order Summary:</strong><br>
            ${orderSummary}<br><br>
            <strong>Total: $${orderData.total.toFixed(2)}</strong>
        </div>
        <form id="order-form" style="display: flex; flex-direction: column; gap: 8px;">
            <input type="text" id="order-name" placeholder="Your name" required style="padding: 8px 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; font-family: inherit;">
            <input type="text" id="order-table" placeholder="Table number" required style="padding: 8px 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; font-family: inherit;">
            <button type="button" id="confirm-order-btn" style="padding: 10px; background: #0b343d; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 14px;">Confirm & Place Order</button>
        </form>
    `;
    
    row.appendChild(img);
    row.appendChild(bubble);
    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
    
    // Store order data and attach event listener
    orderState.items = orderData.items;
    
    document.getElementById('confirm-order-btn').addEventListener('click', async () => {
        const name = document.getElementById('order-name').value.trim();
        const tableNumber = document.getElementById('order-table').value.trim();
        
        if (!name || !tableNumber) {
            alert('Please provide your name and table number');
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

async function sendToAI(message) {
    try {
        // Add user message to history
        conversationHistory.push({ role: 'user', content: message });
        
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                message,
                history: conversationHistory.slice(0, -1) // Send history excluding current message
            })
        });
        const data = await res.json();
        
        // Add bot response to history
        const botResponse = data.response || 'Sorry, I could not process that.';
        conversationHistory.push({ role: 'assistant', content: botResponse });
        
        // Check if the response contains an order ready
        if (data.order_ready && data.order_items && data.order_items.length > 0) {
            return {
                orderReady: true,
                items: data.order_items,
                total: data.order_total,
                message: botResponse
            };
        }
        
        return botResponse;
    } catch (e) {
        console.error('Chat error:', e);
        return 'Sorry, I encountered an error. Please try again.';
    }
}

document.getElementById('txt').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('send').click();
    }
});

// Initialization
(async function () {
    const cfg = await loadConfig();
    applyConfig(cfg);
    loadOrderNumber();
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
    'menu': (cfg) => buildMenuText(cfg) || 'Our menu includes pizzas, salads, burgers and daily specials.',
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
            conversationHistory = [];
        } else {
            postMessage(`Order failed: ${data.error}`, 'bot');
        }
    } catch (e) {
        postMessage('Failed to place order. Please try again.', 'bot');
        console.error('Order submission error:', e);
    }
}

function calculateOrderTotal() {
    return orderState.items.reduce((sum, item) => {
        const price = parseFloat(item.price) || 0;
        const qty = item.quantity || 1;
        return sum + (price * qty);
    }, 0);
}

// Fixed the incomplete click listener and removed redundant fetch
document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        const action = btn.dataset.action;
        const label = btn.textContent.trim();
        
        postMessage(label, 'user');

        if (action === 'order') {
            orderState.isCollectingOrder = true;
            showTyping();
            const reply = canned[action]();
            setTimeout(() => {
                hideTyping();
                postMessage(reply, 'bot');
            }, 500);
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
            postMessage(reply, 'bot');
        }
    });
});

// Mark chatbot as initialized to prevent re-loading
window.chatbotScriptInitialized = true;