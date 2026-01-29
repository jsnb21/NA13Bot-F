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
if(cfg.menu_text) document.getElementById('preview-menu').textContent = cfg.menu_text;
if(cfg.establishment_name) document.getElementById('resto-name').textContent = cfg.establishment_name;
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