const uploadZone = document.getElementById('uploadZone');
const trainingFiles = document.getElementById('trainingFiles');

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
    trainingFiles.files = e.dataTransfer.files;
});

// Click to upload
uploadZone.addEventListener('click', () => {
    trainingFiles.click();
});