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
    b.textContent = text;
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
        const res = await fetch('/admin-client/chat', {method:'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({message:text})});
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
const styles = getComputedStyle(document.documentElement);
const main = styles.getPropertyValue('--main-color').trim() || '#1e40af';
const sub = styles.getPropertyValue('--sub-color').trim() || '#ffd41d';
const mainFg = pickForeground(main);
const subFg = pickForeground(sub);
document.documentElement.style.setProperty('--main-foreground', mainFg);
document.documentElement.style.setProperty('--sub-foreground', subFg);
})();