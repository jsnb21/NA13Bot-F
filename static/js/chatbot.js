async function loadConfig(){
try{
    const res = await fetch('/api/config');
    if(!res.ok) return {};
    return await res.json();
}catch(e){return {}}
}

function applyConfig(cfg){
if(!cfg) return;
const root = document.documentElement;
if(cfg.color_hex) root.style.setProperty('--accent', cfg.color_hex);
if(cfg.menu_text){
    const pm = document.getElementById('preview-menu');
    if(pm) pm.textContent = cfg.menu_text;
}
if(cfg.establishment_name){
    const nameE1 = document.getElementById('resto-name-text');
    if(nameE1) {
        nameE1.textContent = cfg.establishment_name + ' - A.I Chatbot';
    }
}
if(cfg.font_family) document.body.style.fontFamily = cfg.font_family + ', Arial, sans-serif';
}

function postMessage(text, from='user'){
const div = document.createElement('div');
div.className = 'bubble ' + (from==='user' ? 'user' : 'bot');
div.textContent = text;
document.getElementById('messages').appendChild(div);
document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
}

async function sendToAI(message){
try{
    const res = await fetch('/api/chat', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({message})
    });
    const data = await res.json();
    return data.response || 'Sorry, I could not process that.';
}catch(e){
    return 'Sorry, I encountered an error. Please try again.';
}
}

document.getElementById('send').addEventListener('click', async ()=>{
const txt = document.getElementById('txt');
const v = txt.value.trim();
if(!v) return;
postMessage(v,'user');
txt.value='';
txt.disabled = true;
// Get AI response
const reply = await sendToAI(v);
postMessage(reply, 'bot');
txt.disabled = false;
txt.focus();
});

document.getElementById('txt').addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); document.getElementById('send').click(); } });

(async function(){ const cfg = await loadConfig(); applyConfig(cfg); })();

// Quick-reply / preset actions
const canned = {
    'menu': async (cfg)=> cfg && cfg.menu_text ? cfg.menu_text : 'Our menu includes pizzas, salads, burgers and daily specials. Ask to see categories.',
    'order': async ()=> 'Sure — what would you like to order? You can type the item name or choose a preset.',
    'hours': async ()=> 'We are open Mon–Sun, 9:00 AM to 10:00 PM. Delivery available 10:00 AM–9:30 PM.',
    'support': async (cfg)=> `You can reach support at ${cfg && cfg.business_email ? cfg.business_email : 'support@example.com'} or call ${cfg && cfg.business_phone ? cfg.business_phone : '123-456-7890'}.`
};

document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', async ()=>{
        const action = btn.dataset.action;
        const cfg = await loadConfig();
        // post user's quick selection
        const label = btn.textContent.trim();
        postMessage(label, 'user');
        // show canned or AI-powered reply
        if(canned[action]){
            const reply = await canned[action](cfg);
            // small delay to feel natural
            setTimeout(()=> postMessage(reply, 'bot'), 400);
        } else {
            const reply = await sendToAI(label);
            postMessage(reply, 'bot');
        }
    });
});