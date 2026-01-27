(function(){
  // Simple embeddable widget. Usage:
  // <div id="resto-chat"></div>
  // <script>RestoEmbed.init({containerId:'resto-chat', apiKey:'...', restaurantId: 123})</script>
  window.RestoEmbed = {
    init: function(opts){
      const container = document.getElementById(opts.containerId);
      if (!container) return console.error('container not found');
      container.innerHTML = '';
      const input = document.createElement('input'); input.placeholder='Ask about menu...'; input.style.width='80%';
      const btn = document.createElement('button'); btn.textContent='Send';
      const out = document.createElement('pre'); out.style.marginTop='8px';
      container.appendChild(input); container.appendChild(btn); container.appendChild(out);
      btn.addEventListener('click', async ()=>{
        const query = input.value.trim(); if(!query) return;
        const headers = {'Content-Type':'application/json'};
        if (opts.apiKey) headers['X-API-Key'] = opts.apiKey;
        else if (opts.restaurantId) headers['X-Restaurant-Id'] = String(opts.restaurantId);
        try{
          const r = await fetch((opts.baseUrl || '') + '/client-api/v1/chat', {
            method:'POST', headers, body: JSON.stringify({query})
          });
          const data = await r.json(); out.textContent = JSON.stringify(data, null, 2);
        }catch(e){ out.textContent = String(e); }
      });
    }
  };
})();