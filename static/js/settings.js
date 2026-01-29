(function(){
    const form = document.getElementById('settingsForm');
    const btn = document.getElementById('saveSettingsBtn');
    const status = document.getElementById('saveStatus');

    form.addEventListener('submit', async function(e){
        e.preventDefault();
        btn.disabled = true;
        const orig = btn.innerHTML;
        btn.innerHTML = 'Saving...';
        status.textContent = '';
        try{
            const data = new FormData(form);
            const res = await fetch(window.location.pathname, { method: 'POST', body: data });
            if(res.ok){
                status.textContent = 'Saved — refreshing...';
                setTimeout(()=> location.reload(), 600);
                return;
            }
            status.textContent = 'Save failed';
        }catch(err){
            console.error(err);
            status.textContent = 'Save error';
        } finally {
            btn.disabled = false;
            btn.innerHTML = orig;
        }
    });
    // sticky save bar logic
    (function(){
        const form = document.getElementById('settingsForm');
        const sticky = document.getElementById('stickySaveBar');
        const stickySave = document.getElementById('stickySave');
        const stickyCancel = document.getElementById('stickyCancel');
        const saveBtn = document.getElementById('saveSettingsBtn');

        function formToObj(f){
            const o = {};
            new FormData(f).forEach((v,k)=>{ o[k]=v; });
            return o;
        }
        const initial = formToObj(form);

        function isDirty(){
            const cur = formToObj(form);
            const keys = new Set([...Object.keys(initial), ...Object.keys(cur)]);
            for(const k of keys){ if((initial[k]||'') !== (cur[k]||'')) return true; }
            return false;
        }

        function updateSticky(){
            if(isDirty()) sticky.classList.add('show'); else sticky.classList.remove('show');
        }

        // listen for changes
        form.addEventListener('input', updateSticky);
        form.addEventListener('change', updateSticky);

        stickySave.addEventListener('click', ()=>{ saveBtn.click(); });

        stickyCancel.addEventListener('click', ()=>{
            // restore initial values
            for(const name in initial){
                const el = form.elements[name];
                if(!el) continue;
                try{ el.value = initial[name]; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); }catch(e){}
            }
            // also trigger change update for color hex fields if present
            const mainHex = document.getElementById('main_color_hex');
            const subHex = document.getElementById('sub_color_hex');
            if(mainHex){ mainHex.value = initial['main_color'] || ''; mainHex.dispatchEvent(new Event('input',{bubbles:true})); }
            if(subHex){ subHex.value = initial['sub_color'] || ''; subHex.dispatchEvent(new Event('input',{bubbles:true})); }
            updateSticky();
        });
    })();
})();

(function(){
    // main picker
    try{
        const mainHidden = document.getElementById('main_color');
        const mainHex = document.getElementById('main_color_hex');
        const subHidden = document.getElementById('sub_color');
        const subHex = document.getElementById('sub_color_hex');

        const mainPicker = new iro.ColorPicker('#main_color_picker', { width: 160, color: mainHidden.value || '#1e40af' });
        const subPicker = new iro.ColorPicker('#sub_color_picker', { width: 160, color: subHidden.value || '#ffd41d' });

        mainPicker.on('color:change', function(color){
            mainHidden.value = color.hexString;
            mainHidden.dispatchEvent(new Event('input',{bubbles:true}));
            mainHidden.dispatchEvent(new Event('change',{bubbles:true}));
            if(mainHex){
                mainHex.value = color.hexString;
                mainHex.dispatchEvent(new Event('input',{bubbles:true}));
                mainHex.dispatchEvent(new Event('change',{bubbles:true}));
            }
        });
        subPicker.on('color:change', function(color){
            subHidden.value = color.hexString;
            subHidden.dispatchEvent(new Event('input',{bubbles:true}));
            subHidden.dispatchEvent(new Event('change',{bubbles:true}));
            if(subHex){
                subHex.value = color.hexString;
                subHex.dispatchEvent(new Event('input',{bubbles:true}));
                subHex.dispatchEvent(new Event('change',{bubbles:true}));
            }
        });

        if(mainHex){ mainHex.addEventListener('input', function(e){ try{ mainPicker.color.hexString = e.target.value; }catch{} }); }
        if(subHex){ subHex.addEventListener('input', function(e){ try{ subPicker.color.hexString = e.target.value; }catch{} }); }
    }catch(e){ console.warn('color picker init failed', e); }
})();