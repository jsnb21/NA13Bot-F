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
        let initial = formToObj(form);

        function resetInitial(){
            initial = formToObj(form);
            updateSticky();
        }

        function isDirty(){
            const cur = formToObj(form);
            const keys = new Set([...Object.keys(initial), ...Object.keys(cur)]);
            for(const k of keys){ if((initial[k]||'') !== (cur[k]||'')) return true; }
            return false;
        }

        let userInteracted = false;

        function updateSticky(){
            if(!userInteracted){
                sticky.classList.remove('show');
                return;
            }
            if(isDirty()) sticky.classList.add('show'); else sticky.classList.remove('show');
        }

        // listen for changes
        form.addEventListener('input', (e) => {
            if(e && e.isTrusted) userInteracted = true;
            updateSticky();
        });
        form.addEventListener('change', (e) => {
            if(e && e.isTrusted) userInteracted = true;
            updateSticky();
        });

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

        // Expose to other modules (color pickers) so they can re-sync baseline.
        window.__settingsResetInitial = resetInitial;
    })();
})();

(function(){
    const fileInput = document.getElementById('logo_file');
    const preview = document.getElementById('logo_preview');
    const filename = document.getElementById('logo_filename');
    const urlInput = document.getElementById('logo_url');

    if(!fileInput) return;
    fileInput.addEventListener('change', function(e){
        const f = this.files && this.files[0];
        if(!f){
            filename.textContent = '';
            return;
        }
        filename.textContent = f.name;
        // preview via data URL
        const reader = new FileReader();
        reader.onload = function(ev){
            preview.src = ev.target.result;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(f);
    });
})();

(function(){
    document.querySelectorAll('[data-section-toggle]').forEach(btn => {
        btn.addEventListener('click', () => {
            const section = btn.closest('[data-collapsible]');
            if (!section) return;
            section.classList.toggle('is-collapsed');
            btn.textContent = section.classList.contains('is-collapsed') ? 'Show' : 'Hide';
        });
    });

    document.querySelectorAll('[data-color-toggle]').forEach(btn => {
        btn.addEventListener('click', () => {
            const picker = btn.closest('.color-picker');
            if (!picker) return;
            picker.classList.toggle('is-collapsed');
            btn.textContent = picker.classList.contains('is-collapsed') ? 'Show' : 'Hide';
        });
    });
})();

(function(){
    // Modern Pickr.js color picker initialization
    // Wait for Pickr to be available (it loads after this script in HTML)
    function normalizeHex(value) {
        if (!value) return '';
        let hex = String(value).trim().toLowerCase();
        if (!hex.startsWith('#')) hex = '#' + hex;
        // #rgb -> #rrggbb
        if (/^#[0-9a-f]{3}$/.test(hex)) {
            hex = '#' + hex.slice(1).split('').map(ch => ch + ch).join('');
        }
        // #rrggbbaa -> #rrggbb
        if (/^#[0-9a-f]{8}$/.test(hex)) {
            hex = '#' + hex.slice(1, 7);
        }
        return /^#[0-9a-f]{6}$/.test(hex) ? hex : '';
    }

    function colorToHex(color) {
        if (!color) return '';
        const raw = color.toHEXA().join('');
        return normalizeHex(raw);
    }

    function initPickr() {
        if (typeof Pickr === 'undefined') {
            console.warn('Pickr.js did not load. Color pickers will use fallback mode.');
            return;
        }

        console.log('Initializing Pickr color pickers...');
        const pickers = {
            main_color: null,
            sub_color: null
        };

        document.querySelectorAll('.pickr-container').forEach(container => {
            const fieldName = container.getAttribute('data-field');
            const defaultColor = container.getAttribute('data-default') || '#1e40af';
            const hiddenInput = document.querySelector(`[name="${fieldName}"]`);

            if (hiddenInput) {
                try {
                    pickers[fieldName] = Pickr.create({
                        el: container,
                        theme: 'classic',
                        default: defaultColor,
                        components: {
                            preview: true,
                            opacity: false,
                            hue: true,
                            interaction: {
                                hex: true,
                                input: true,
                                clear: true,
                                save: true
                            }
                        },
                        strings: {
                            save: 'Save',
                            clear: 'Clear'
                        }
                    });

                    // Update hidden input when color changes
                    pickers[fieldName].on('save', (color) => {
                        if (color) {
                            const hex = colorToHex(color);
                            if (hex) {
                                hiddenInput.value = hex;
                                hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));
                                hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                        }
                    }).on('clear', () => {
                        hiddenInput.value = '';
                        hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));
                    }).on('change', (color) => {
                        if (color) {
                            const hex = colorToHex(color);
                            if (hex) hiddenInput.value = hex;
                        }
                    });
                    console.log(`Pickr initialized for ${fieldName}`);
                } catch (err) {
                    console.error(`Failed to initialize Pickr for ${fieldName}:`, err);
                }
            }
        });
    }

    // Try to initialize immediately if Pickr is loaded
    if (typeof Pickr !== 'undefined') {
        initPickr();
    } else {
        // Otherwise wait a moment and try again
        setTimeout(initPickr, 500);
    }
})();

(function(){
    const items = document.querySelectorAll('.editable-item');
    items.forEach(item => {
        const editBtn = item.querySelector('[data-edit]');
        const inputs = item.querySelectorAll('[data-input]');
        const display = item.querySelector('[data-display]');
        const emptyLabel = item.getAttribute('data-empty') || 'Not set';

        function getDisplayValue() {
            if (!inputs.length) return '';
            const input = inputs[0];
            if (input.tagName === 'SELECT') {
                const option = input.options[input.selectedIndex];
                return option ? option.textContent.trim() : '';
            }
            return (input.value || '').trim();
        }

        function syncDisplay() {
            if (!display) return;
            const value = getDisplayValue();
            display.textContent = value || emptyLabel;
        }

        function setEditing(isEditing) {
            item.classList.toggle('is-editing', isEditing);
            inputs.forEach(input => {
                input.disabled = !isEditing;
                if (isEditing) input.focus();
            });
            if (editBtn) editBtn.textContent = isEditing ? 'Done' : 'Edit';
            if (!isEditing) syncDisplay();
        }

        if (editBtn) {
            editBtn.addEventListener('click', () => {
                setEditing(!item.classList.contains('is-editing'));
            });
        }

        inputs.forEach(input => {
            input.addEventListener('input', syncDisplay);
            input.addEventListener('change', syncDisplay);
        });

        inputs.forEach(input => { input.disabled = true; });
        syncDisplay();
    });

    if (typeof window.__settingsResetInitial === 'function') {
        window.__settingsResetInitial();
    }
})();

(function(){
    function bindClearMenu(){
        const clearBtn = document.getElementById('clearMenuBtn');
        if (!clearBtn) return;

        clearBtn.addEventListener('click', async () => {
            const ok = await window.appShowConfirm('Clear all menu items? This cannot be undone.', 'Clear Menu');
            if (!ok) return;

            clearBtn.disabled = true;
            try {
                const res = await fetch('/settings/clear-menu', {
                    method: 'POST',
                    credentials: 'same-origin'
                });
                if (!res.ok) {
                    window.appShowAlert('Unable to clear menu items.', 'Clear Menu');
                    return;
                }
                window.appShowAlert('Menu items cleared.', 'Clear Menu');
            } catch (err) {
                window.appShowAlert('Unable to clear menu items.', 'Clear Menu');
            } finally {
                clearBtn.disabled = false;
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindClearMenu);
    } else {
        bindClearMenu();
    }
})();