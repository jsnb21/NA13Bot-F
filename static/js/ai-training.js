const uploadZone = document.getElementById('uploadZone');
const trainingFiles = document.getElementById('trainingFiles');
const filesList = document.getElementById('filesList');
const filesCount = document.getElementById('filesCount');
const totalSize = document.getElementById('totalSize');
const uploadProgress = document.getElementById('uploadProgress');
const uploadQueue = document.getElementById('uploadQueue');
const validationMessages = document.getElementById('validationMessages');
const bulkActions = document.getElementById('bulkActions');
const selectAll = document.getElementById('selectAll');
const selectedCount = document.getElementById('selectedCount');
const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');

const FILES_ENDPOINT = '/ai-training/files';
const UPLOAD_ENDPOINT = '/ai-training/upload';
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
            showToast('warning', 'Preview feature coming soon!');
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
    updateBulkActions();
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
        } else {
            fileArray.forEach(file => {
                updateUploadItem(file.name, 0, 'error');
            });
            showToast('error', 'Upload failed. Please try again.');
        }
    };

    xhr.send(formData);
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
    } catch (err) {
        showToast('error', 'Failed to delete some files');
    }
});

// Template downloads
function downloadTemplate(type) {
    const templates = {
        menu: {
            name: 'menu-template.json',
            content: JSON.stringify({
                "restaurant": {
                    "name": "Your Restaurant Name",
                    "menu": [
                        {
                            "item": "Sample Item",
                            "price": "$10.99",
                            "description": "Delicious sample description",
                            "category": "Main Course"
                        }
                    ]
                }
            }, null, 2)
        },
        faq: {
            name: 'faq-template.txt',
            content: `Q: What are your hours?
A: We're open 10am-10pm daily

Q: Do you deliver?
A: Yes, delivery available within 5 miles

Q: Any vegetarian options?
A: Yes, check our full menu for marked items`
        },
        hours: {
            name: 'hours-template.json',
            content: JSON.stringify({
                "business_hours": {
                    "monday": "10:00 AM - 10:00 PM",
                    "tuesday": "10:00 AM - 10:00 PM",
                    "wednesday": "10:00 AM - 10:00 PM",
                    "thursday": "10:00 AM - 10:00 PM",
                    "friday": "10:00 AM - 11:00 PM",
                    "saturday": "10:00 AM - 11:00 PM",
                    "sunday": "11:00 AM - 9:00 PM"
                }
            }, null, 2)
        }
    };
    
    const template = templates[type];
    if (!template) return;
    
    const blob = new Blob([template.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = template.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('success', `Downloaded ${template.name}`);
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

trainingFiles.addEventListener('change', () => {
    uploadFiles(trainingFiles.files);
});

fetchFiles();