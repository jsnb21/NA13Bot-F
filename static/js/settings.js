(function(){
    const form = document.getElementById('settingsForm');

    form.addEventListener('submit', async function(e){
        e.preventDefault();
        try{
            const data = new FormData(form);
            // Editable fields are disabled outside edit mode, so include them explicitly.
            document.querySelectorAll('[data-input]').forEach((input) => {
                if (!input || !input.name) return;
                data.set(input.name, input.value ?? '');
            });
            const res = await fetch(window.location.pathname, { method: 'POST', body: data });
            if(res.ok){
                setTimeout(()=> location.reload(), 600);
                return;
            }
        }catch(err){
            console.error(err);
        }
    });
    // sticky save bar logic
    (function(){
        const form = document.getElementById('settingsForm');
        const sticky = document.getElementById('stickySaveBar');
        const stickySave = document.getElementById('stickySave');
        const stickyCancel = document.getElementById('stickyCancel');
        const logoPreview = document.getElementById('logo_preview');
        const avatarPreview = document.getElementById('chatbot_avatar_preview');
        const logoFilename = document.getElementById('logo_filename');
        const avatarFilename = document.getElementById('chatbot_avatar_filename');

        const initialLogoPreviewSrc = logoPreview ? logoPreview.src : '';
        const initialAvatarPreviewSrc = avatarPreview ? avatarPreview.src : '';

        function readFieldValue(el){
            if (!el || !el.name) return '';
            const tag = (el.tagName || '').toLowerCase();
            const type = (el.type || '').toLowerCase();

            if (type === 'file') return '';

            if (type === 'checkbox') {
                return el.checked ? (el.value || 'on') : '';
            }

            if (type === 'radio') {
                const checked = form.querySelector(`input[type="radio"][name="${CSS.escape(el.name)}"]:checked`);
                return checked ? (checked.value || '') : '';
            }

            if (tag === 'select' && el.multiple) {
                return Array.from(el.selectedOptions).map((opt) => opt.value).join('|');
            }

            return el.value ?? '';
        }

        function formToObj(f){
            const o = {};
            f.querySelectorAll('[name]').forEach((el) => {
                if (!el.name || o[el.name] !== undefined) return;
                o[el.name] = readFieldValue(el);
            });
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

        function markUserInteracted(){
            userInteracted = true;
            updateSticky();
        }

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

        stickySave.addEventListener('click', ()=>{ form.dispatchEvent(new Event('submit', { bubbles: true })); });

        stickyCancel.addEventListener('click', ()=>{
            // restore all named fields to the initial baseline, including disabled edit-mode inputs
            form.querySelectorAll('[name]').forEach((el) => {
                const name = el.name;
                if (!name) return;
                const type = (el.type || '').toLowerCase();
                const baseline = initial[name] ?? '';

                try {
                    if (type === 'file') {
                        el.value = '';
                    } else if (type === 'checkbox') {
                        el.checked = baseline === (el.value || 'on');
                    } else if (type === 'radio') {
                        el.checked = baseline === (el.value || '');
                    } else if (el.tagName && el.tagName.toLowerCase() === 'select' && el.multiple) {
                        const selected = new Set(String(baseline).split('|').filter(Boolean));
                        Array.from(el.options).forEach((opt) => {
                            opt.selected = selected.has(opt.value);
                        });
                    } else {
                        el.value = baseline;
                    }

                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                } catch (e) {}
            });

            // Clear upload labels and restore image previews to pre-edit state.
            if (logoFilename) logoFilename.textContent = '';
            if (avatarFilename) avatarFilename.textContent = '';
            if (logoPreview && initialLogoPreviewSrc) logoPreview.src = initialLogoPreviewSrc;
            if (avatarPreview && initialAvatarPreviewSrc) avatarPreview.src = initialAvatarPreviewSrc;

            updateSticky();
        });

        // Expose to other modules (color pickers) so they can re-sync baseline.
        window.__settingsResetInitial = resetInitial;
        window.__settingsMarkUserInteracted = markUserInteracted;
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
    function syncSectionToggle(section) {
        const btn = section.querySelector('[data-section-toggle]');
        if (!btn) return;
        const expanded = !section.classList.contains('is-collapsed');
        btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }

    document.querySelectorAll('[data-section-toggle]').forEach(btn => {
        btn.addEventListener('click', () => {
            const section = btn.closest('[data-collapsible]');
            if (!section) return;
            section.classList.toggle('is-collapsed');
            syncSectionToggle(section);
        });
    });

    document.querySelectorAll('[data-collapsible] .section-header').forEach(header => {
        const section = header.closest('[data-collapsible]');
        if (!section) return;

        header.setAttribute('role', 'button');
        header.setAttribute('tabindex', '0');

        header.addEventListener('click', (e) => {
            if (e.target.closest('[data-section-toggle]')) return;
            const btn = header.querySelector('[data-section-toggle]');
            if (btn) btn.click();
        });

        header.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            const btn = header.querySelector('[data-section-toggle]');
            if (btn) btn.click();
        });

        syncSectionToggle(section);
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
    if (!document.getElementById('settingsForm')) return;

    // Persist picker instances across Turbo renders to avoid duplicate init flashes.
    if (!window.__settingsPickrs) window.__settingsPickrs = {};
    if (!window.__settingsPickrCacheHandlerAttached) {
        window.__settingsPickrCacheHandlerAttached = true;
        document.addEventListener('turbo:before-cache', () => {
            Object.values(window.__settingsPickrs).forEach((picker) => {
                try {
                    if (picker && typeof picker.hide === 'function') picker.hide();
                } catch (e) {}
            });
        });
    }
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

    function syncColorPreview(fieldName, value) {
        const preview = document.querySelector(`[data-color-inline-preview="${fieldName}"]`);
        if (!preview) return;
        const dot = preview.querySelector('.color-label-dot');
        const text = preview.querySelector('.color-label-hex');
        const normalized = normalizeHex(value) || '#000000';
        if (dot) dot.style.backgroundColor = normalized;
        if (text) text.textContent = normalized;
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
            const inlineTrigger = document.querySelector(`[data-color-inline-preview="${fieldName}"]`);
            const pickerHost = container.closest('.col-md-6') || container.parentElement || document.body;

            if (!fieldName || !hiddenInput) return;

            // Skip re-initialization if a picker already exists for this field.
            if (container.dataset.pickrInitialized === '1' && window.__settingsPickrs[fieldName]) {
                syncColorPreview(fieldName, hiddenInput.value);
                return;
            }

            try {
                // Destroy stale instance if one exists from a previous render.
                if (window.__settingsPickrs[fieldName] && typeof window.__settingsPickrs[fieldName].destroyAndRemove === 'function') {
                    try { window.__settingsPickrs[fieldName].destroyAndRemove(); } catch (e) {}
                }

                pickers[fieldName] = Pickr.create({
                    el: inlineTrigger || container,
                    useAsButton: true,
                    container: pickerHost,
                    position: 'bottom-start',
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

                window.__settingsPickrs[fieldName] = pickers[fieldName];
                container.dataset.pickrInitialized = '1';

                // Ensure picker starts closed to avoid flash on tab switch.
                try {
                    if (pickers[fieldName] && typeof pickers[fieldName].hide === 'function') {
                        pickers[fieldName].hide();
                    }
                } catch (e) {}

                // Update hidden input when color changes
                pickers[fieldName].on('save', (color) => {
                    if (color) {
                        const hex = colorToHex(color);
                        if (hex) {
                            hiddenInput.value = hex;
                            syncColorPreview(fieldName, hex);
                            if (typeof window.__settingsMarkUserInteracted === 'function') {
                                window.__settingsMarkUserInteracted();
                            }
                            hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));
                            hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
                            try {
                                if (pickers[fieldName] && typeof pickers[fieldName].hide === 'function') {
                                    pickers[fieldName].hide();
                                }
                            } catch (e) {}
                        }
                    }
                }).on('clear', () => {
                    hiddenInput.value = '';
                    syncColorPreview(fieldName, '');
                    if (typeof window.__settingsMarkUserInteracted === 'function') {
                        window.__settingsMarkUserInteracted();
                    }
                    hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));
                    hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
                }).on('change', (color) => {
                    if (color) {
                        const hex = colorToHex(color);
                        if (hex) {
                            hiddenInput.value = hex;
                            syncColorPreview(fieldName, hex);
                        }
                    }
                });
                console.log(`Pickr initialized for ${fieldName}`);
                syncColorPreview(fieldName, hiddenInput.value);

                if (hiddenInput.dataset.previewListenersAttached !== '1') {
                    hiddenInput.dataset.previewListenersAttached = '1';
                    hiddenInput.addEventListener('input', () => syncColorPreview(fieldName, hiddenInput.value));
                    hiddenInput.addEventListener('change', () => syncColorPreview(fieldName, hiddenInput.value));
                }

                if (inlineTrigger) {
                    inlineTrigger.setAttribute('role', 'button');
                    inlineTrigger.setAttribute('tabindex', '0');
                    inlineTrigger.setAttribute('aria-label', `Pick ${fieldName.replace('_', ' ')} color`);

                    const openPicker = () => {
                        try {
                            const picker = window.__settingsPickrs[fieldName] || pickers[fieldName];
                            if (picker && typeof picker.show === 'function') {
                                picker.show();
                                return;
                            }
                        } catch (e) {}
                        const hiddenBtn = container.querySelector('.pcr-button');
                        if (hiddenBtn) hiddenBtn.click();
                    };

                    if (inlineTrigger.dataset.openPickerAttached !== '1') {
                        inlineTrigger.dataset.openPickerAttached = '1';
                        inlineTrigger.addEventListener('click', openPicker);
                        inlineTrigger.addEventListener('keydown', (e) => {
                            if (e.key !== 'Enter' && e.key !== ' ') return;
                            e.preventDefault();
                            openPicker();
                        });
                    }
                }
            } catch (err) {
                console.error(`Failed to initialize Pickr for ${fieldName}:`, err);
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
    const controllers = [];
    items.forEach(item => {
        const editBtn = item.querySelector('[data-edit]');
        const inputs = Array.from(item.querySelectorAll('[data-input]'));
        const display = item.querySelector('[data-display]');
        const header = item.querySelector('.editable-header');
        const emptyLabel = item.getAttribute('data-empty') || 'Not set';
        const displayMode = item.getAttribute('data-display-mode') || 'value';
        const filledLabel = item.getAttribute('data-filled') || 'Set';
        let snapshot = null;

        let saveBtn = null;
        let cancelBtn = null;
        if (header) {
            const actions = document.createElement('div');
            actions.className = 'edit-mode-actions';
            actions.innerHTML = [
                '<button type="button" class="btn btn-sm btn-cancel-inline" data-edit-cancel>Cancel</button>'
            ].join('');
            header.appendChild(actions);
            cancelBtn = actions.querySelector('[data-edit-cancel]');
        }

        function captureSnapshot() {
            return inputs.map(input => ({ input, value: input.value }));
        }

        function restoreSnapshot(state) {
            if (!state) return;
            state.forEach(({ input, value }) => {
                input.value = value;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            });

            // File inputs cannot be restored for security reasons, so clear them on cancel.
            item.querySelectorAll('input[type="file"]').forEach(fileInput => {
                try {
                    fileInput.value = '';
                    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                } catch (e) {}
            });
        }

        function getDisplayValue() {
            if (!inputs.length) return '';
            const input = inputs[0];
            if (displayMode === 'presence') {
                const hasValue = Boolean((input.value || '').trim());
                return hasValue ? filledLabel : '';
            }
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
            inputs.forEach((input, idx) => {
                input.disabled = !isEditing;
                if (isEditing && idx === 0) input.focus();
            });
            if (editBtn) {
                editBtn.classList.toggle('is-active', isEditing);
                editBtn.setAttribute('aria-label', 'Edit field');
            }
            if (cancelBtn) {
                cancelBtn.parentElement.classList.toggle('show', isEditing);
            }

            if (isEditing) {
                snapshot = captureSnapshot();
            } else {
                snapshot = null;
                syncDisplay();
            }
        }

        function closeEditing(restore = false) {
            if (!item.classList.contains('is-editing')) return;
            if (restore) restoreSnapshot(snapshot);
            setEditing(false);
        }

        controllers.push({ item, closeEditing });

        if (editBtn) {
            editBtn.addEventListener('click', () => {
                if (!item.classList.contains('is-editing')) {
                    controllers.forEach(ctrl => {
                        if (ctrl.item !== item) ctrl.closeEditing(false);
                    });
                    setEditing(true);
                }
            });
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                closeEditing(true);
            });
        }

        inputs.forEach(input => {
            input.addEventListener('input', syncDisplay);
            input.addEventListener('change', syncDisplay);
        });

        item.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            if (!item.classList.contains('is-editing')) return;
            e.preventDefault();
            closeEditing(true);
        });

        inputs.forEach(input => { input.disabled = true; });
        syncDisplay();
    });

    if (typeof window.__settingsResetInitial === 'function') {
        window.__settingsResetInitial();
    }
})();

(function(){
    const fontSelect = document.getElementById('font_family');
    const fontPreview = document.querySelector('[data-font-preview]');

    if (!fontSelect || !fontPreview) return;

    function syncFontPreview() {
        const selectedFont = (fontSelect.value || '').trim();
        if (selectedFont) {
            fontPreview.style.fontFamily = selectedFont;
            fontPreview.textContent = `Aa ${selectedFont}`;
            return;
        }
        fontPreview.style.fontFamily = 'inherit';
        fontPreview.textContent = 'Aa Default';
    }

    fontSelect.addEventListener('input', syncFontPreview);
    fontSelect.addEventListener('change', syncFontPreview);
    syncFontPreview();
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