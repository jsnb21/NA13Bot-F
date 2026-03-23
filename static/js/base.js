(function(){
const adminHelpBtn = document.getElementById('adminHelpBtn');
const adminChatModal = document.getElementById('adminChatModal');
const adminChatClose = document.getElementById('adminChatClose');
const adminChatSend = document.getElementById('adminChatSend');
const adminChatInput = document.getElementById('adminChatInput');
const adminChatBody = document.getElementById('adminChatBody');

function openAdminChat(){
    if(!adminChatModal) return;
    adminChatModal.style.display = 'flex';
    adminChatModal.setAttribute('aria-hidden','false');
    if(adminChatInput) adminChatInput.focus();
}
function closeAdminChat(){
    if(!adminChatModal) return;
    adminChatModal.style.display = 'none';
    adminChatModal.setAttribute('aria-hidden','true');
    if(adminHelpBtn) adminHelpBtn.focus();
}

if(adminHelpBtn) adminHelpBtn.addEventListener('click', (e)=>{ openAdminChat(); });
if(adminChatClose) adminChatClose.addEventListener('click', ()=>{ closeAdminChat(); });

function appendMessage(who, text){
    if(!adminChatBody) return;
    const div = document.createElement('div');
    div.className = 'chat-msg ' + (who==='user' ? 'user' : 'bot');
    const b = document.createElement('div');
    b.className = 'bubble';
    
    // For bot messages, parse markdown; for user messages, keep plain text
    if(who === 'bot' && typeof marked !== 'undefined'){
        try{
            b.innerHTML = marked.parse(text);
        }catch(e){
            b.textContent = text;
        }
    }else{
        b.textContent = text;
    }
    
    div.appendChild(b);
    adminChatBody.appendChild(div);
    adminChatBody.scrollTop = adminChatBody.scrollHeight;
}

async function sendChat(){
    if(!adminChatInput) return;
    const text = adminChatInput.value && adminChatInput.value.trim();
    if(!text) return;
    appendMessage('user', text);
    adminChatInput.value = '';
    try{
        const res = await fetch('/chat', {method:'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({message:text})});
        if(res.ok){
            const j = await res.json();
            appendMessage('bot', j.reply || 'Sorry, no reply.');
            return;
        }
    }catch(e){ /* ignore and fallback */ }
    appendMessage('bot', 'Thanks — a backend is not configured. This is a local demo response.');
}

if(adminChatSend) adminChatSend.addEventListener('click', sendChat);
if(adminChatInput) adminChatInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendChat(); }});

// Add initial greeting message with markdown formatting
if(adminChatBody && adminChatBody.children.length === 0){
    appendMessage('bot', 'Hi — ask me about **admin tasks**, `training`, or `settings`.');
}
})();
(function(){
function hexToRgb(hex){
    hex = (hex || '').trim().replace('#','');
    if(hex.length===3) hex = hex.split('').map(h=>h+h).join('');
    if(!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
    const int = parseInt(hex,16);
    return {r:(int>>16)&255, g:(int>>8)&255, b:int&255};
}
function srgbToLinear(c){ c = c/255; return c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055,2.4); }
function luminance(rgb){ return 0.2126*srgbToLinear(rgb.r) + 0.7152*srgbToLinear(rgb.g) + 0.0722*srgbToLinear(rgb.b); }
function pickForeground(hex){ const rgb = hexToRgb(hex); if(!rgb) return '#fff'; return luminance(rgb) > 0.5 ? '#111827' : '#fff'; }

function applyThemeAliases(){
    const root = document.documentElement;
    const body = document.body;
    const styles = getComputedStyle(root);

    const mainFromBody = (body && body.dataset && body.dataset.mainColor) ? body.dataset.mainColor.trim() : '';
    const subFromBody = (body && body.dataset && body.dataset.subColor) ? body.dataset.subColor.trim() : '';

    const main = mainFromBody || styles.getPropertyValue('--main-color').trim() || '#1e40af';
    const sub = subFromBody || styles.getPropertyValue('--sub-color').trim() || '#ffd41d';
    const mainFg = pickForeground(main);
    const subFg = pickForeground(sub);

    root.style.setProperty('--main-color', main);
    root.style.setProperty('--sub-color', sub);
    root.style.setProperty('--main-foreground', mainFg);
    root.style.setProperty('--sub-foreground', subFg);
    root.style.setProperty('--brand-dark', main);
    root.style.setProperty('--brand-primary', main);
    root.style.setProperty('--brand-primary-foreground', mainFg);
    root.style.setProperty('--accent-yellow', sub);

    // === AGGRESSIVE BUTTON STYLING ===
    // Apply inline colors directly to every button to prevent Turbo resets
    applyButtonColors(main, sub, mainFg, subFg);
}

function applyButtonColors(mainColor, subColor, mainFg, subFg) {
    // Select ALL buttons on the page
    const allButtons = document.querySelectorAll('button, .btn, [role="button"]');
    
    allButtons.forEach(btn => {
        // Determine button type from class
        const isSubColor = btn.classList.contains('btn-primary') || btn.classList.contains('btn-warning') || btn.classList.contains('btn-success');
        const isOutline = btn.classList.contains('btn-outline-primary') || btn.classList.contains('btn-outline-secondary') || btn.classList.contains('btn-outline-dark');
        const isLight = btn.classList.contains('btn-light');
        const isActionView = btn.classList.contains('action-btn-view');
        const isActionUpdate = btn.classList.contains('action-btn-update');
        const isCategoryBtn = btn.classList.contains('category-btn');
        
        // Skip if already has explicit inline styles (user-set colors)
        if(btn.hasAttribute('data-color-locked')) return;
        
        if(isCategoryBtn) {
            // Category filter buttons: outline with main color, accent on hover
            const isActive = btn.classList.contains('active');
            
            if(isActive) {
                btn.style.backgroundColor = mainColor;
                btn.style.borderColor = mainColor;
                btn.style.color = mainFg;
            } else {
                btn.style.backgroundColor = 'transparent';
                btn.style.borderColor = mainColor;
                btn.style.color = mainColor;
            }
            btn.style.border = `2px solid ${mainColor}`;
            
            btn.onmouseenter = function() {
                this.style.backgroundColor = subColor;
                this.style.borderColor = subColor;
                this.style.color = subFg;
            };
            btn.onmouseleave = function() {
                if(this.classList.contains('active')) {
                    this.style.backgroundColor = mainColor;
                    this.style.borderColor = mainColor;
                    this.style.color = mainFg;
                } else {
                    this.style.backgroundColor = 'transparent';
                    this.style.borderColor = mainColor;
                    this.style.color = mainColor;
                }
            };
        } else if(isActionView) {
            // View buttons: outline style with main color
            btn.style.backgroundColor = '#ffffff';
            btn.style.color = mainColor;
            btn.style.borderColor = mainColor;
            btn.style.border = `1px solid ${mainColor}`;
            btn.onmouseenter = function() {
                this.style.backgroundColor = mainColor;
                this.style.color = mainFg;
            };
            btn.onmouseleave = function() {
                this.style.backgroundColor = '#ffffff';
                this.style.color = mainColor;
            };
        } else if(isActionUpdate) {
            // Update buttons: solid main color
            btn.style.backgroundColor = mainColor;
            btn.style.color = mainFg;
            btn.style.border = 'none';
            btn.onmouseenter = function() {
                this.style.opacity = '0.9';
                this.style.transform = 'translateY(-2px)';
            };
            btn.onmouseleave = function() {
                this.style.opacity = '1';
                this.style.transform = 'translateY(0)';
            };
        } else if(isLight) {
            // Light buttons stay light
            btn.style.backgroundColor = '#f8f9fa';
            btn.style.color = '#212529';
            btn.style.border = '1px solid #dee2e6';
        } else if(isOutline) {
            // Outline buttons: border + text in main color, white background
            btn.style.backgroundColor = '#ffffff';
            btn.style.color = mainColor;
            btn.style.borderColor = mainColor;
            btn.style.border = `1px solid ${mainColor}`;
            // On hover, fill with main color
            btn.onmouseenter = function() {
                this.style.backgroundColor = mainColor;
                this.style.color = mainFg;
            };
            btn.onmouseleave = function() {
                this.style.backgroundColor = '#ffffff';
                this.style.color = mainColor;
            };
        } else if(isSubColor) {
            // Primary/Warning/Success buttons: sub color background
            btn.style.backgroundColor = subColor;
            btn.style.color = subFg;
            btn.style.border = 'none';
            // On hover, slightly darker
            btn.onmouseenter = function() {
                this.style.opacity = '0.9';
                this.style.transform = 'translateY(-2px)';
                this.style.boxShadow = '0 8px 16px rgba(0,0,0,0.12)';
            };
            btn.onmouseleave = function() {
                this.style.opacity = '1';
                this.style.transform = 'translateY(0)';
                this.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
            };
        } else {
            // Secondary/Dark buttons: main color background
            btn.style.backgroundColor = mainColor;
            btn.style.color = mainFg;
            btn.style.border = 'none';
            // On hover, slightly darker (opacity)
            btn.onmouseenter = function() {
                this.style.opacity = '0.92';
            };
            btn.onmouseleave = function() {
                this.style.opacity = '1';
            };
        }
    });
}

// Apply theme immediately on initial page load
applyThemeAliases();

// Re-apply theme on every possible Turbo navigation event to ensure
// colors persist across frame swaps, page loads, and renders
document.addEventListener('turbo:load', applyThemeAliases);
document.addEventListener('turbo:render', applyThemeAliases);

// For turbo-frame navigation, apply theme before AND after rendering
document.addEventListener('turbo:before-frame-render', applyThemeAliases);
document.addEventListener('turbo:after-frame-render', applyThemeAliases);

// Before Turbo caches a page, ensure colors are correct
document.addEventListener('turbo:before-cache', applyThemeAliases);

// Also handle turbo:submit for form submissions
document.addEventListener('turbo:submit', applyThemeAliases);

// Fallback: apply theme on any DOM mutation (in case theme gets reset)
const observer = new MutationObserver(function(mutations) {
    // Only re-apply if mutations affect the main-frame or body
    for(let mutation of mutations) {
        if(mutation.target.id === 'main-frame' || mutation.target.nodeName === 'BODY' || 
           (mutation.target.parentElement && mutation.target.parentElement.id === 'main-frame')) {
            applyThemeAliases();
            break;
        }
    }
});

// Watch main-frame and body for content changes
const mainFrame = document.getElementById('main-frame');
if(mainFrame) {
    observer.observe(mainFrame, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'data-main-color', 'data-sub-color']
    });
}
observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['style', 'data-main-color', 'data-sub-color']
});
})();