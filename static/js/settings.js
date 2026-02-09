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
    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function toHex(value) {
        const hex = value.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }

    function hslToHex(h, s, l) {
        const sat = s / 100;
        const light = l / 100;
        const c = (1 - Math.abs(2 * light - 1)) * sat;
        const x = c * (1 - Math.abs((h / 60) % 2 - 1));
        const m = light - c / 2;
        let r = 0;
        let g = 0;
        let b = 0;

        if (h >= 0 && h < 60) { r = c; g = x; b = 0; }
        else if (h >= 60 && h < 120) { r = x; g = c; b = 0; }
        else if (h >= 120 && h < 180) { r = 0; g = c; b = x; }
        else if (h >= 180 && h < 240) { r = 0; g = x; b = c; }
        else if (h >= 240 && h < 300) { r = x; g = 0; b = c; }
        else { r = c; g = 0; b = x; }

        const r255 = Math.round((r + m) * 255);
        const g255 = Math.round((g + m) * 255);
        const b255 = Math.round((b + m) * 255);
        return '#' + toHex(r255) + toHex(g255) + toHex(b255);
    }

    function hexToRgb(hex) {
        const clean = hex.replace('#', '');
        if (clean.length !== 6) return null;
        return {
            r: parseInt(clean.slice(0, 2), 16),
            g: parseInt(clean.slice(2, 4), 16),
            b: parseInt(clean.slice(4, 6), 16)
        };
    }

    function rgbToHsl(r, g, b) {
        const rN = r / 255;
        const gN = g / 255;
        const bN = b / 255;
        const max = Math.max(rN, gN, bN);
        const min = Math.min(rN, gN, bN);
        let h = 0;
        let s = 0;
        const l = (max + min) / 2;

        if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case rN:
                    h = (gN - bN) / d + (gN < bN ? 6 : 0);
                    break;
                case gN:
                    h = (bN - rN) / d + 2;
                    break;
                default:
                    h = (rN - gN) / d + 4;
            }
            h *= 60;
        }
        return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
    }

    function normalizeHex(value) {
        if (!value) return null;
        let clean = value.trim().toLowerCase();
        if (clean[0] !== '#') clean = '#' + clean;
        if (!/^#[0-9a-f]{6}$/.test(clean)) return null;
        return clean;
    }

    function buildSwatches(container, onPick) {
        const palette = [
            '#0b343d', '#1f4a50', '#2f5f63', '#3b7474', '#4e8a7a',
            '#ffc832', '#f2b950', '#e6a667', '#d08b63', '#b86f5e',
            '#2f2f3a', '#3f4b60', '#4b5f7c', '#5c7395', '#6f88ad',
            '#7a3b4b', '#8f4b5b', '#a95b6b', '#c16b7b', '#d87f8f',
            '#1f3b2c', '#2c4f38', '#3b6344', '#4a7751', '#5c8c5f',
            '#3a2f2f', '#4d3a33', '#60463a', '#745243', '#8a6050'
        ];
        palette.forEach(color => {
            const swatch = document.createElement('div');
            swatch.className = 'swatch';
            swatch.style.background = color;
            swatch.setAttribute('data-color', color);
            swatch.addEventListener('click', () => onPick(color, swatch));
            container.appendChild(swatch);
        });
    }

    function initPicker(picker) {
        const preview = picker.querySelector('[data-role="preview"]');
        const hexInput = picker.querySelector('[data-role="hex"]');
        const valueInput = picker.querySelector('[data-role="value"]');
        const hue = picker.querySelector('[data-role="hue"]');
        const sat = picker.querySelector('[data-role="sat"]');
        const light = picker.querySelector('[data-role="light"]');
        const hueValue = picker.querySelector('[data-role="hue-value"]');
        const satValue = picker.querySelector('[data-role="sat-value"]');
        const lightValue = picker.querySelector('[data-role="light-value"]');
        const swatches = picker.querySelector('[data-role="swatches"]');
        const defaultHex = normalizeHex(picker.getAttribute('data-default')) || '#0b343d';

        const applyHex = (hex) => {
            preview.style.background = hex;
            hexInput.value = hex;
            valueInput.value = hex;
            valueInput.dispatchEvent(new Event('input', { bubbles: true }));
            valueInput.dispatchEvent(new Event('change', { bubbles: true }));
            const rgb = hexToRgb(hex);
            if (rgb) {
                const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
                hue.value = hsl.h;
                sat.value = hsl.s;
                light.value = hsl.l;
                hueValue.textContent = hsl.h;
                satValue.textContent = hsl.s;
                lightValue.textContent = hsl.l;
            }
            swatches.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
            const match = swatches.querySelector('[data-color="' + hex + '"]');
            if (match) match.classList.add('active');
        };

        const updateFromSliders = () => {
            const h = clamp(parseInt(hue.value, 10) || 0, 0, 360);
            const s = clamp(parseInt(sat.value, 10) || 0, 0, 100);
            const l = clamp(parseInt(light.value, 10) || 0, 0, 100);
            hueValue.textContent = h;
            satValue.textContent = s;
            lightValue.textContent = l;
            applyHex(hslToHex(h, s, l));
        };

        buildSwatches(swatches, (hex, swatch) => {
            applyHex(hex);
            swatches.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
        });

        hue.addEventListener('input', updateFromSliders);
        sat.addEventListener('input', updateFromSliders);
        light.addEventListener('input', updateFromSliders);
        hexInput.addEventListener('change', () => {
            const normalized = normalizeHex(hexInput.value);
            if (normalized) applyHex(normalized);
            else hexInput.value = valueInput.value;
        });

        applyHex(defaultHex);
    }

    document.querySelectorAll('.color-picker').forEach(initPicker);
})();