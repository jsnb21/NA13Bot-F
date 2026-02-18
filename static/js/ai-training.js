(function() {
    const uploadZone = document.getElementById('uploadZone');
    const trainingFiles = document.getElementById('trainingFiles');
    const filesList = document.getElementById('filesList');

    if (!uploadZone || !trainingFiles || !filesList) {
        return;
    }

    if (uploadZone.dataset.aiTrainingBound === '1') {
        if (typeof window.aiTrainingRefresh === 'function') {
            window.aiTrainingRefresh();
        }
        return;
    }

    uploadZone.dataset.aiTrainingBound = '1';
  const filesCount = document.getElementById('filesCount');
  const totalSize = document.getElementById('totalSize');
  const uploadProgress = document.getElementById('uploadProgress');
  const uploadQueue = document.getElementById('uploadQueue');
  const validationMessages = document.getElementById('validationMessages');
  const bulkActions = document.getElementById('bulkActions');
  const selectAll = document.getElementById('selectAll');
  const selectedCount = document.getElementById('selectedCount');
  const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    const retrainBtn = document.getElementById('retrainBtn');
    const historyBody = document.getElementById('trainingHistoryBody');
    const previewModal = document.getElementById('previewModal');
    const previewTitle = document.getElementById('previewTitle');
    const previewMeta = document.getElementById('previewMeta');
    const previewBody = document.getElementById('previewBody');
    const previewClose = document.getElementById('previewClose');

  const FILES_ENDPOINT = '/ai-training/files';
  const UPLOAD_ENDPOINT = '/ai-training/upload';
    const HISTORY_ENDPOINT = '/ai-training/history';
    const RETRAIN_ENDPOINT = '/ai-training/retrain';
  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
  const ALLOWED_EXTENSIONS = ['txt', 'pdf', 'docx', 'json', 'csv'];

  let selectedFiles = new Set();
  let allFiles = [];

  // Toast notification system
  function showToast(type, message) {
      let container = document.querySelector('.toast-container');
      if (!container) {
          container = document.createElement('div');
          container.className = 'toast-container';
          document.body.appendChild(container);
      }
      
      const toast = document.createElement('div');
      toast.className = `toast-notification ${type}`;
      
      const icons = {
          success: '✓',
          error: '✕',
          warning: '⚠'
      };
      
      toast.innerHTML = `
          <div class="toast-icon">${icons[type] || '✓'}</div>
          <div class="toast-message">${message}</div>
          <div class="toast-close" onclick="this.parentElement.remove()">✕</div>
      `;
      
      container.appendChild(toast);
      
      setTimeout(() => {
          toast.style.animation = 'slideIn 0.3s ease reverse';
          setTimeout(() => toast.remove(), 300);
      }, 4000);
  }

  function formatBytes(bytes) {
      if (!bytes || bytes <= 0) {
          return '0 KB';
      }
      const units = ['B', 'KB', 'MB', 'GB'];
      let size = bytes;
      let idx = 0;
    while (size >= 1024 && idx < units.length - 1) {
        size /= 1024;
        idx += 1;
    }
    return `${size.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function formatDate(iso) {
    if (!iso) {
        return 'Unknown';
    }
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
        return 'Unknown';
    }
    return date.toLocaleString();
}

function formatDuration(durationMs) {
    if (durationMs === null || durationMs === undefined) {
        return '—';
    }
    if (durationMs < 1000) {
        return '<1 sec';
    }
    const totalSeconds = Math.round(durationMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0) {
        return `${minutes} min ${seconds} sec`;
    }
    return `${seconds} sec`;
}

function getStatusBadge(status) {
    const normalized = (status || '').toLowerCase();
    if (normalized === 'completed') {
        return '<span class="badge bg-success">Completed</span>';
    }
    if (normalized === 'failed') {
        return '<span class="badge bg-danger">Failed</span>';
    }
    if (normalized === 'in_progress') {
        return '<span class="badge bg-warning">In Progress</span>';
    }
    return '<span class="badge bg-secondary">Pending</span>';
}

function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const icons = {
        'json': '📋',
        'txt': '📄',
        'pdf': '📕',
        'docx': '📘',
        'csv': '📊'
    };
    return icons[ext] || '📄';
}

// File validation
function validateFiles(fileList) {
    const errors = [];
    const warnings = [];
    const existingNames = allFiles.map(f => f.original_name.toLowerCase());
    
    Array.from(fileList).forEach(file => {
        const ext = file.name.split('.').pop().toLowerCase();
        
        // Check file extension
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            errors.push(`"${file.name}" has unsupported format. Use: ${ALLOWED_EXTENSIONS.join(', ')}`);
        }
        
        // Check file size
        if (file.size > MAX_FILE_SIZE) {
            errors.push(`"${file.name}" is too large (${formatBytes(file.size)}). Max: 50MB`);
        }
        
        // Check if empty
        if (file.size === 0) {
            errors.push(`"${file.name}" is empty`);
        }
        
        // Check for duplicates
        if (existingNames.includes(file.name.toLowerCase())) {
            warnings.push(`"${file.name}" already exists and will be replaced`);
        }
    });
    
    return { errors, warnings };
}

function showValidationMessages(errors, warnings) {
    validationMessages.innerHTML = '';
    
    errors.forEach(msg => {
        const div = document.createElement('div');
        div.className = 'validation-message error';
        div.innerHTML = `<strong>Error:</strong> ${msg}`;
        validationMessages.appendChild(div);
    });
    
    warnings.forEach(msg => {
        const div = document.createElement('div');
        div.className = 'validation-message warning';
        div.innerHTML = `<strong>Warning:</strong> ${msg}`;
        validationMessages.appendChild(div);
    });
    
    if (errors.length === 0 && warnings.length === 0) {
        validationMessages.innerHTML = '';
    }
}

function renderFiles(files) {
    allFiles = files || [];
    selectedFiles.clear();
    filesList.innerHTML = '';

    if (!files || files.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'text-muted text-center py-4';
        empty.innerHTML = `
            <div style="font-size:3rem; opacity:0.3;">📚</div>
            <h5 class="mt-3">No Training Files Yet</h5>
            <p>Upload your first file to start training your AI agent</p>
        `;
        filesList.appendChild(empty);
        filesCount.textContent = '0';
        totalSize.textContent = '0 KB';
        bulkActions.style.display = 'none';
        return;
    }

    let totalBytes = 0;
    files.forEach((file) => {
        totalBytes += file.size_bytes || 0;

        const item = document.createElement('div');
        item.className = 'training-file-item';
        item.dataset.fileId = file.id;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'file-checkbox';
        checkbox.dataset.fileId = file.id;
        
        // Make entire card clickable
        item.addEventListener('click', (e) => {
            // Don't toggle if clicking on action buttons
            if (e.target.closest('.file-actions button')) {
                return;
            }
            // Toggle checkbox
            checkbox.checked = !checkbox.checked;
            
            if (checkbox.checked) {
                selectedFiles.add(file.id);
                item.classList.add('selected');
            } else {
                selectedFiles.delete(file.id);
                item.classList.remove('selected');
            }
            updateBulkActions();
        });
        
        // Prevent checkbox click from bubbling to card
        checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                selectedFiles.add(file.id);
                item.classList.add('selected');
            } else {
                selectedFiles.delete(file.id);
                item.classList.remove('selected');
            }
            updateBulkActions();
        });

        const icon = document.createElement('div');
        icon.className = 'file-icon-preview';
        icon.textContent = getFileIcon(file.original_name);

        const info = document.createElement('div');
        info.className = 'file-info';

        const name = document.createElement('div');
        name.className = 'file-name';
        name.textContent = file.original_name || 'Untitled';

        const meta = document.createElement('div');
        meta.className = 'file-meta';
        meta.textContent = `${formatBytes(file.size_bytes)} • Uploaded ${formatDate(file.uploaded_at)}`;

        info.appendChild(name);
        info.appendChild(meta);

        const actions = document.createElement('div');
        actions.className = 'file-actions';

        const status = document.createElement('span');
        status.className = 'training-status status-ready';
        status.textContent = 'Ready';

        const previewBtn = document.createElement('button');
        previewBtn.className = 'btn btn-sm btn-outline-primary';
        previewBtn.innerHTML = '<i class="fa fa-eye"></i> Preview';
        previewBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openPreview(file);
        });

        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn btn-sm btn-outline-danger';
        removeBtn.innerHTML = '<i class="fa fa-trash"></i> Delete';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeFile(file.id);
        });

        actions.appendChild(status);
        actions.appendChild(previewBtn);
        actions.appendChild(removeBtn);

        item.appendChild(checkbox);
        item.appendChild(icon);
        item.appendChild(info);
        item.appendChild(actions);
        filesList.appendChild(item);
    });

    filesCount.textContent = `${files.length}`;
    totalSize.textContent = formatBytes(totalBytes);
    bulkActions.style.display = files.length > 0 ? 'flex' : 'none';
    if (retrainBtn) {
        retrainBtn.disabled = files.length === 0;
    }
    updateBulkActions();
}

function renderHistory(entries) {
    if (!historyBody) {
        return;
    }
    historyBody.innerHTML = '';
    if (!entries || entries.length === 0) {
        const empty = document.createElement('tr');
        empty.innerHTML = '<td colspan="4" class="text-muted text-center">No activity yet</td>';
        historyBody.appendChild(empty);
        return;
    }
    entries.forEach(entry => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDate(entry.started_at)}</td>
            <td>${entry.action || '—'}</td>
            <td>${getStatusBadge(entry.status)}</td>
            <td>${formatDuration(entry.duration_ms)}</td>
        `;
        historyBody.appendChild(row);
    });
}

async function fetchHistory() {
    if (!historyBody) {
        return;
    }
    const res = await fetch(HISTORY_ENDPOINT, { credentials: 'same-origin' });
    if (!res.ok) {
        renderHistory([]);
        return;
    }
    const data = await res.json();
    renderHistory(data.history || []);
}

async function fetchFiles() {
    const res = await fetch(FILES_ENDPOINT, { credentials: 'same-origin' });
    if (!res.ok) {
        renderFiles([]);
        return;
    }
    const data = await res.json();
    renderFiles(data.files || []);
}

// Real-time upload feedback
function createUploadItem(filename) {
    const item = document.createElement('div');
    item.className = 'upload-item';
    item.dataset.filename = filename;
    item.innerHTML = `
        <span class="filename">${filename}</span>
        <div class="progress-mini">
            <div class="progress-bar" style="width:0%"></div>
        </div>
        <span class="status-icon">⏳</span>
    `;
    return item;
}

function updateUploadItem(filename, progress, status) {
    const item = uploadQueue.querySelector(`[data-filename="${filename}"]`);
    if (!item) return;
    
    const bar = item.querySelector('.progress-bar');
    const icon = item.querySelector('.status-icon');
    
    bar.style.width = `${progress}%`;
    
    if (status === 'success') {
        bar.classList.add('bg-success');
        icon.textContent = '✓';
        icon.style.color = '#4caf50';
    } else if (status === 'error') {
        bar.classList.add('bg-danger');
        icon.textContent = '✕';
        icon.style.color = '#f44336';
    }
}

function uploadFiles(fileList) {
    if (!fileList || fileList.length === 0) {
        return;
    }

    // Validate files
    const validation = validateFiles(fileList);
    showValidationMessages(validation.errors, validation.warnings);
    
    if (validation.errors.length > 0) {
        showToast('error', `Cannot upload: ${validation.errors.length} error(s) found`);
        return;
    }
    
    if (validation.warnings.length > 0) {
        showToast('warning', `${validation.warnings.length} warning(s) - proceeding with upload`);
    }

    const formData = new FormData();
    const fileArray = Array.from(fileList);
    
    fileArray.forEach((file) => {
        formData.append('training_files', file, file.name);
    });

    // Show upload queue
    uploadProgress.style.display = 'block';
    uploadQueue.innerHTML = '';
    
    fileArray.forEach(file => {
        uploadQueue.appendChild(createUploadItem(file.name));
    });

    const xhr = new XMLHttpRequest();
    xhr.open('POST', UPLOAD_ENDPOINT, true);
    
    xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
            const pct = Math.round((event.loaded / event.total) * 100);
            fileArray.forEach(file => {
                updateUploadItem(file.name, pct, 'uploading');
            });
        }
    });

    xhr.onreadystatechange = () => {
        if (xhr.readyState !== 4) {
            return;
        }
        
        if (xhr.status >= 200 && xhr.status < 300) {
            fileArray.forEach(file => {
                updateUploadItem(file.name, 100, 'success');
            });
            showToast('success', `Successfully uploaded ${fileArray.length} file(s)!`);
            setTimeout(() => {
                uploadProgress.style.display = 'none';
                validationMessages.innerHTML = '';
            }, 2000);
            trainingFiles.value = '';
            fetchFiles();
            fetchHistory();
        } else {
            fileArray.forEach(file => {
                updateUploadItem(file.name, 0, 'error');
            });
            showToast('error', 'Upload failed. Please try again.');
        }
    };

    xhr.send(formData);
}

function openPreviewModal() {
    if (!previewModal) {
        return;
    }
    previewModal.classList.add('open');
    previewModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
}

function closePreviewModal() {
    if (!previewModal) {
        return;
    }
    previewModal.classList.remove('open');
    previewModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
}

async function openPreview(file) {
    if (!file || !previewModal || !previewBody) {
        showToast('error', 'Preview is unavailable.');
        return;
    }

    previewTitle.textContent = file.original_name || 'File Preview';
    previewMeta.textContent = 'Loading preview...';
    previewBody.textContent = '';
    openPreviewModal();

    try {
        const res = await fetch(`${FILES_ENDPOINT}/${file.id}/preview`, { credentials: 'same-origin' });
        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || 'Preview failed');
        }
        const ext = (data.ext || '').replace('.', '').toUpperCase() || 'FILE';
        const sizeText = formatBytes(file.size_bytes || 0);
        previewMeta.textContent = `${ext} • ${sizeText}${data.truncated ? ' (truncated)' : ''}`;
        previewBody.textContent = data.preview || 'No preview available for this file.';
    } catch (err) {
        closePreviewModal();
        showToast('error', err.message || 'Preview failed');
    }
}

async function removeFile(fileId) {
    if (!fileId) {
        return;
    }
    const res = await fetch(`${FILES_ENDPOINT}/${fileId}`, {
        method: 'DELETE',
        credentials: 'same-origin'
    });
    if (res.ok) {
        showToast('success', 'File deleted successfully');
        fetchFiles();
        fetchHistory();
    } else {
        showToast('error', 'Unable to remove file');
    }
}

// Bulk actions
function updateBulkActions() {
    selectedCount.textContent = selectedFiles.size;
    selectAll.checked = selectedFiles.size === allFiles.length && allFiles.length > 0;
    selectAll.indeterminate = selectedFiles.size > 0 && selectedFiles.size < allFiles.length;
}

selectAll.addEventListener('change', (e) => {
    const checkboxes = document.querySelectorAll('.file-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = e.target.checked;
        const fileId = cb.closest('.training-file-item').dataset.fileId;
        if (e.target.checked) {
            selectedFiles.add(fileId);
            cb.closest('.training-file-item').classList.add('selected');
        } else {
            selectedFiles.delete(fileId);
            cb.closest('.training-file-item').classList.remove('selected');
        }
    });
    updateBulkActions();
});

deleteSelectedBtn.addEventListener('click', async () => {
    if (selectedFiles.size === 0) return;
    
    if (!confirm(`Delete ${selectedFiles.size} selected file(s)?`)) return;
    
    const promises = Array.from(selectedFiles).map(fileId => 
        fetch(`${FILES_ENDPOINT}/${fileId}`, {
            method: 'DELETE',
            credentials: 'same-origin'
        })
    );
    
    try {
        await Promise.all(promises);
        showToast('success', `Deleted ${selectedFiles.size} file(s)`);
        selectedFiles.clear();
        fetchFiles();
        fetchHistory();
    } catch (err) {
        showToast('error', 'Failed to delete some files');
    }
});

if (retrainBtn) {
    retrainBtn.addEventListener('click', async () => {
        if (retrainBtn.disabled) {
            return;
        }
        retrainBtn.disabled = true;
        showToast('warning', 'Retraining started...');
        try {
            const res = await fetch(RETRAIN_ENDPOINT, {
                method: 'POST',
                credentials: 'same-origin'
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Retraining failed');
            }
            showToast('success', 'Retraining completed');
            fetchHistory();
        } catch (err) {
            showToast('error', err.message || 'Retraining failed');
        } finally {
            retrainBtn.disabled = false;
        }
    });
}

// Template downloads
function downloadTemplate(type) {
    if (type !== 'complete') return;
    
    const content = `===============================================================================
                  RESTAURANT INFORMATION TEMPLATE
===============================================================================

Welcome! Use this template to train your AI chatbot with essential information
about your restaurant. Fill in the details below, save the file, and upload it
to your AI Training dashboard.

===============================================================================


SECTION 1: RESTAURANT MENU
===============================================================================

Restaurant Name: [Enter your restaurant name]
Cuisine Type: [e.g., Italian, Mexican, Asian Fusion, American]


APPETIZERS & STARTERS
-------------------------------------------------------------------------------

Garlic Bread
  Price: $5.99
  Description: Freshly baked bread with garlic butter and herbs
  Dietary Notes: Vegetarian

Caesar Salad
  Price: $8.99
  Description: Crisp romaine lettuce with parmesan and house-made dressing
  Dietary Notes: Can be made vegetarian

[Add Your Appetizer]
  Price: $[0.00]
  Description: [Describe your dish]
  Dietary Notes: [Vegetarian, Vegan, Gluten-Free, etc.]


MAIN COURSES
-------------------------------------------------------------------------------

Grilled Salmon
  Price: $18.99
  Description: Fresh Atlantic salmon with seasonal vegetables and lemon butter
              sauce
  Dietary Notes: Gluten-Free, Contains Fish

Classic Burger
  Price: $12.99
  Description: 8oz beef patty with lettuce, tomato, onion, pickles, and fries
  Dietary Notes: Contains Gluten

Margherita Pizza
  Price: $14.99
  Description: Tomato sauce, fresh mozzarella, and basil on wood-fired crust
  Dietary Notes: Vegetarian

[Add Your Main Course]
  Price: $[0.00]
  Description: [Describe your dish]
  Dietary Notes: [Any dietary information]


DESSERTS
-------------------------------------------------------------------------------

Chocolate Lava Cake
  Price: $6.99
  Description: Warm chocolate cake with molten center and vanilla ice cream
  Dietary Notes: Vegetarian

Tiramisu
  Price: $7.99
  Description: Classic Italian dessert with espresso-soaked ladyfingers
  Dietary Notes: Vegetarian, Contains Alcohol

[Add Your Dessert]
  Price: $[0.00]
  Description: [Describe your dessert]


BEVERAGES
-------------------------------------------------------------------------------

Soft Drinks
  Price: $2.99
  Options: Coca-Cola, Sprite, Fanta, Diet Coke, Ginger Ale

Fresh Juices
  Price: $4.99
  Options: Orange, Apple, Grapefruit, Cranberry

Specialty Coffee
  Price: $3.99
  Options: Espresso, Cappuccino, Latte, Americano, Mocha

[Add Your Beverage]
  Price: $[0.00]
  Description: [Describe your beverage options]


DAILY SPECIALS & COMBO DEALS
-------------------------------------------------------------------------------

[Example: Monday Lunch Special - Any pasta + drink for $15.99]
[Example: Happy Hour - 50% off all appetizers, 4-6 PM weekdays]
[Add your special offers and promotions here]


===============================================================================


SECTION 2: FREQUENTLY ASKED QUESTIONS
===============================================================================


HOURS & LOCATION
-------------------------------------------------------------------------------

Q: What are your hours of operation?
A: We're open Monday through Sunday, 10:00 AM to 10:00 PM. Last seating is
   30 minutes before closing time.

Q: Where are you located?
A: [Enter your full street address, city, state, and ZIP code]

Q: Is parking available?
A: Yes! We offer free parking in our lot. Street parking is also available
   nearby.

Q: Do you have outdoor seating?
A: [Yes - describe your patio/outdoor area OR No]


ORDERING & DELIVERY
-------------------------------------------------------------------------------

Q: Do you offer delivery?
A: Yes! We deliver within a 5-mile radius. Delivery fee is $4.99, free on
   orders over $30.

Q: Can I order online?
A: Absolutely! Order through our website or call us at [Your Phone Number].

Q: What are your delivery hours?
A: Delivery is available during all business hours: 10:00 AM - 10:00 PM daily.

Q: Do you accept takeout orders?
A: Yes, takeout orders are welcome! Call ahead or order online for faster
   pickup.

Q: Are you on food delivery apps?
A: [Yes - we're on UberEats, DoorDash, Grubhub OR No - order directly through us]


RESERVATIONS & EVENTS
-------------------------------------------------------------------------------

Q: Do you accept reservations?
A: Yes! Book online through our website or call us. Walk-ins are also welcome.

Q: How far in advance can I make a reservation?
A: You can reserve tables up to 30 days in advance.

Q: Do you have private dining options?
A: [Yes - describe your private room capacity OR No, but we can accommodate
   large groups]

Q: What's your cancellation policy?
A: Please cancel at least 2 hours before your reserved time.

Q: Do you host special events?
A: Yes! We cater birthdays, corporate events, weddings, and more. Contact us
   for details.


MENU & DIETARY OPTIONS
-------------------------------------------------------------------------------

Q: Do you have vegetarian or vegan options?
A: Yes! We have many vegetarian and vegan dishes clearly marked on our menu.

Q: Can you accommodate food allergies?
A: Absolutely. Please inform your server about any allergies or restrictions
   and we'll work with you to find safe options.

Q: Do you have gluten-free options?
A: [Yes - describe options OR We can modify certain dishes]

Q: Is there a kids menu?
A: [Yes - describe OR No, but we offer half portions of regular menu items]

Q: Where do you source your ingredients?
A: [We use locally sourced, organic ingredients OR Describe your sourcing]


PAYMENT & PRICING
-------------------------------------------------------------------------------

Q: What payment methods do you accept?
A: We accept cash, all major credit cards (Visa, Mastercard, Amex, Discover),
   and digital wallets (Apple Pay, Google Pay, Venmo).

Q: Is there a minimum for card payments?
A: No minimum purchase required for card payments.

Q: Do you include gratuity?
A: Gratuity is optional. For parties of 6 or more, an 18% service charge is
   added.

Q: Do you offer gift cards?
A: [Yes - available in-store and online OR No]


OTHER COMMON QUESTIONS
-------------------------------------------------------------------------------

Q: Do you have WiFi?
A: [Yes - free WiFi for all guests OR No]

Q: Are you family-friendly?
A: [Yes - we welcome families with kids menus and high chairs available]

Q: Do you serve alcohol?
A: [Yes - we have a full bar with beer, wine, and cocktails OR No / BYOB]

Q: Is your restaurant wheelchair accessible?
A: [Yes - fully accessible with ramps and accessible restrooms OR Describe
   accessibility]

Q: Can I bring my pet?
A: [Yes - pets welcome on our outdoor patio OR No indoor pets, service animals
   always welcome]


===============================================================================


SECTION 3: CONTACT & HOURS
===============================================================================


CONTACT INFORMATION
-------------------------------------------------------------------------------

Phone:      [Your Phone Number]
Email:      [Your Email Address]
Website:    [Your Website URL]

Address:    [Street Address]
            [City, State ZIP Code]

Social Media:
  Facebook:  [facebook.com/yourrestaurant]
  Instagram: [@yourrestaurant]
  Twitter:   [@yourrestaurant]


OPERATING HOURS
-------------------------------------------------------------------------------

Monday      10:00 AM - 10:00 PM
Tuesday     10:00 AM - 10:00 PM
Wednesday   10:00 AM - 10:00 PM
Thursday    10:00 AM - 10:00 PM
Friday      10:00 AM - 11:00 PM
Saturday    10:00 AM - 11:00 PM
Sunday      11:00 AM - 9:00 PM

Important Notes:
  - Last seating: 30 minutes before closing
  - Kitchen closes: 15 minutes before closing time
  - Holiday hours may vary - check our website or call ahead


HOLIDAY HOURS
-------------------------------------------------------------------------------

[Specify any holiday closures or special hours]

Examples:
  - Closed on Thanksgiving and Christmas Day
  - New Year's Eve - Extended hours until 12:30 AM
  - Memorial Day - Regular hours with special BBQ menu


DELIVERY AREAS
-------------------------------------------------------------------------------

We deliver to:
[List specific neighborhoods, ZIP codes, or areas you serve]

Examples:
  - Downtown, Midtown, Riverside, University District
  - ZIP codes: 12345, 12346, 12347


ADDITIONAL INFORMATION
-------------------------------------------------------------------------------

[Add any other important information your customers should know]

Examples:
  - Live music every Friday night from 7-9 PM
  - Happy Hour: Monday-Friday 4-6 PM
  - We validate parking for the Main Street garage
  - Outdoor patio available (weather permitting, April-October)
  - Free birthday dessert with valid ID
  - Senior discount: 10% off on Tuesdays
  - Student discount: 15% off with valid student ID


===============================================================================


HOW TO USE THIS TEMPLATE
===============================================================================

Step 1: Replace all [bracketed text] with your actual restaurant information

Step 2: Remove example items you don't need

Step 3: Add more menu items, FAQs, or information as needed

Step 4: Keep the formatting clean and organized

Step 5: Save this file when you're done editing

Step 6: Upload it to the AI Training section in your dashboard


PRO TIP: The more detailed and accurate your information, the better your AI
chatbot will be at helping customers! You can always update and re-upload this
file later as your menu or information changes.

Need help? Contact our support team or check the documentation in your
dashboard.


===============================================================================
                        Template Version 1.0 - 2026
===============================================================================
`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'restaurant-template.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('success', 'Downloaded restaurant template');
}

// Drag and drop functionality
uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
});

uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragover');
});

uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    uploadFiles(e.dataTransfer.files);
});

// Click to upload
uploadZone.addEventListener('click', () => {
    trainingFiles.click();
});

// File input change handler
trainingFiles.addEventListener('change', () => {
    uploadFiles(trainingFiles.files);
});

if (previewClose) {
    previewClose.addEventListener('click', closePreviewModal);
}
if (previewModal) {
    previewModal.addEventListener('click', (e) => {
        if (e.target === previewModal) {
            closePreviewModal();
        }
    });
}
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && previewModal && previewModal.classList.contains('open')) {
        closePreviewModal();
    }
});

// Initial load
window.aiTrainingRefresh = fetchFiles;
window.downloadTemplate = downloadTemplate; // Expose downloadTemplate globally
fetchFiles();
fetchHistory();
})();