// 1. Move config to global scope so all functions can access it
let chatbotConfig = {};

// Order state management
let orderState = {
    items: [],
    customerName: '',
    customerEmail: '',
    isCollectingOrder: false
};

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
    bubble.innerHTML = formatMessage(text);

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
            <input type="email" id="order-email" placeholder="Your email" required style="padding: 8px 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; font-family: inherit;">
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
        const email = document.getElementById('order-email').value.trim();
        
        if (!name || !email) {
            alert('Please provide your name and email');
            return;
        }
        
        orderState.customerName = name;
        orderState.customerEmail = email;
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
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });
        const data = await res.json();
        
        // Check if the response contains an order ready
        if (data.order_ready && data.order_items && data.order_items.length > 0) {
            return {
                orderReady: true,
                items: data.order_items,
                total: data.order_total,
                message: data.response
            };
        }
        
        return data.response || 'Sorry, I could not process that.';
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
})();

// Quick-reply definitions
function buildMenuText(cfg) {
    if (!cfg) return '';
    const items = cfg.menu_items || [];
    const currency = cfg.currency_symbol || '₱';
    if (items.length) {
        const lines = items.map(item => {
            const name = (item.name || '').trim();
            if (!name) return '';
            const desc = (item.description || '').trim();
            const price = (item.price || '').trim();
            let line = name;
            if (desc) line += ' — ' + desc;
            if (price) line += ' (' + currency + price + ')';
            return line;
        }).filter(Boolean);
        if (lines.length) return lines.join('\n');
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
    
    if (!orderState.customerName || !orderState.customerEmail) {
        postMessage('Please provide your name and email to confirm the order.', 'bot');
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
                customer_email: orderState.customerEmail,
                items: orderState.items,
                total_amount: totalAmount
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            postMessage(`✓ ${data.message}`, 'bot');
            // Reset order state
            orderState = { items: [], customerName: '', customerEmail: '', isCollectingOrder: false };
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