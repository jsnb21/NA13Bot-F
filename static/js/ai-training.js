const uploadZone = document.getElementById('uploadZone');
const trainingFiles = document.getElementById('trainingFiles');
const filesList = document.getElementById('filesList');
const filesCount = document.getElementById('filesCount');
const totalSize = document.getElementById('totalSize');
const uploadProgress = document.getElementById('uploadProgress');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');

const FILES_ENDPOINT = '/admin-client/ai-training/files';
const UPLOAD_ENDPOINT = '/admin-client/ai-training/upload';

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

function setProgress(visible, value) {
    if (!uploadProgress || !progressBar || !progressText) {
        return;
    }
    uploadProgress.style.display = visible ? 'block' : 'none';
    if (visible) {
        const pct = Math.min(100, Math.max(0, value || 0));
        progressBar.style.width = `${pct}%`;
        progressText.textContent = `${pct}%`;
    }
}

function renderFiles(files) {
    filesList.innerHTML = '';

    if (!files || files.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'text-muted';
        empty.textContent = 'No training files uploaded yet.';
        filesList.appendChild(empty);
        filesCount.textContent = '0';
        totalSize.textContent = '0 KB';
        return;
    }

    let totalBytes = 0;
    files.forEach((file) => {
        totalBytes += file.size_bytes || 0;

        const item = document.createElement('div');
        item.className = 'training-file-item';

        const info = document.createElement('div');
        info.className = 'file-info';

        const name = document.createElement('div');
        name.className = 'file-name';
        name.textContent = `📄 ${file.original_name || 'Untitled'}`;

        const meta = document.createElement('div');
        meta.className = 'file-meta';
        meta.textContent = `Uploaded ${formatDate(file.uploaded_at)} • ${formatBytes(file.size_bytes)} • Active`;

        info.appendChild(name);
        info.appendChild(meta);

        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.alignItems = 'center';
        actions.style.gap = '10px';

        const status = document.createElement('span');
        status.className = 'training-status status-ready';
        status.textContent = 'Ready';

        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn btn-sm btn-outline-danger';
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', () => removeFile(file.id));

        actions.appendChild(status);
        actions.appendChild(removeBtn);

        item.appendChild(info);
        item.appendChild(actions);
        filesList.appendChild(item);
    });

    filesCount.textContent = `${files.length}`;
    totalSize.textContent = formatBytes(totalBytes);
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

function uploadFiles(fileList) {
    if (!fileList || fileList.length === 0) {
        return;
    }

    const formData = new FormData();
    Array.from(fileList).forEach((file) => {
        formData.append('training_files', file, file.name);
    });

    setProgress(true, 0);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', UPLOAD_ENDPOINT, true);
    xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
            const pct = Math.round((event.loaded / event.total) * 100);
            setProgress(true, pct);
        }
    });

    xhr.onreadystatechange = () => {
        if (xhr.readyState !== 4) {
            return;
        }
        setProgress(false, 0);
        if (xhr.status >= 200 && xhr.status < 300) {
            trainingFiles.value = '';
            fetchFiles();
        } else {
            alert('Upload failed. Please try again.');
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
        fetchFiles();
    } else {
        alert('Unable to remove file.');
    }
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