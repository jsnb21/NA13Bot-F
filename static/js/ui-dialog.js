(function () {
  function getEl(id) {
    return document.getElementById(id);
  }

  function hideDialog() {
    const overlay = getEl('uiDialogOverlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
  }

  function showDialog(opts) {
    const overlay = getEl('uiDialogOverlay');
    const titleEl = getEl('uiDialogTitle');
    const messageEl = getEl('uiDialogMessage');
    const cancelBtn = getEl('uiDialogCancel');
    const okBtn = getEl('uiDialogOk');

    if (!overlay || !okBtn || !cancelBtn) {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      const isConfirm = opts.type === 'confirm';
      let settled = false;

      if (titleEl) titleEl.textContent = opts.title || (isConfirm ? 'Please Confirm' : 'Notice');
      if (messageEl) messageEl.textContent = opts.message || '';
      cancelBtn.style.display = isConfirm ? '' : 'none';
      okBtn.textContent = opts.okText || (isConfirm ? 'Confirm' : 'OK');

      const close = (value) => {
        if (settled) return;
        settled = true;
        hideDialog();
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        overlay.removeEventListener('click', onBackdrop);
        document.removeEventListener('keydown', onEsc);
        resolve(value);
      };

      const onOk = () => close(true);
      const onCancel = () => close(false);
      const onBackdrop = (e) => {
        if (e.target === overlay) {
          close(false);
        }
      };
      const onEsc = (e) => {
        if (e.key === 'Escape') {
          close(false);
        }
      };

      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      overlay.addEventListener('click', onBackdrop);
      document.addEventListener('keydown', onEsc);

      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden', 'false');
      okBtn.focus();
    });
  }

  window.appShowAlert = function (message, title, okText) {
    return showDialog({ type: 'alert', message, title, okText });
  };

  window.appShowConfirm = function (message, title, okText) {
    return showDialog({ type: 'confirm', message, title, okText });
  };
})();
