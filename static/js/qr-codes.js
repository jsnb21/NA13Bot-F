// QR Codes Page JavaScript

document.addEventListener('DOMContentLoaded', function() {
    const generateBtn = document.getElementById('generateBtn');
    const printBtn = document.getElementById('printBtn');
    const tableCountInput = document.getElementById('tableCount');
    const startTableInput = document.getElementById('startTable');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const qrCodesContainer = document.getElementById('qrCodesContainer');
    const qrGrid = document.getElementById('qrGrid');
    const qrCountDisplay = document.getElementById('qrCountDisplay');

    // Generate QR codes
    generateBtn.addEventListener('click', async function() {
        const tableCount = parseInt(tableCountInput.value) || 10;
        const startTable = parseInt(startTableInput.value) || 1;

        if (tableCount < 1 || tableCount > 500) {
            alert('Please enter a number between 1 and 500');
            return;
        }

        if (startTable < 1) {
            alert('Starting table number must be at least 1');
            return;
        }

        loadingSpinner.classList.remove('d-none');
        generateBtn.disabled = true;

        try {
            const response = await fetch('/api/generate-qr-codes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    count: tableCount,
                    start_table: startTable
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (data.error) {
                alert('Error: ' + data.error);
                return;
            }

            if (!data.qr_codes || data.qr_codes.length === 0) {
                alert('No QR codes were generated. Please try again.');
                return;
            }

            // Display QR codes
            displayQRCodes(data.qr_codes, data.count);
            
            // Enable print button
            printBtn.disabled = false;

        } catch (error) {
            alert('Failed to generate QR codes: ' + error.message);
        } finally {
            loadingSpinner.classList.add('d-none');
            generateBtn.disabled = false;
        }
    });

    // Print QR codes
    printBtn.addEventListener('click', function() {
        const qrCodeDisplay = document.getElementById('qrCodesContainer');
        const qrItems = qrCodeDisplay.querySelectorAll('.qr-code-item');
        
        if (qrItems.length === 0) {
            alert('No QR codes to print. Please generate QR codes first.');
            return;
        }
        
        // Collect all QR code data
        const qrCodesData = [];
        qrItems.forEach((item) => {
            const img = item.querySelector('img');
            const tableNum = item.querySelector('.qr-table-number').textContent;
            
            if (img && img.src) {
                qrCodesData.push({
                    tableNum: tableNum,
                    src: img.src
                });
            }
        });
        
        if (qrCodesData.length === 0) {
            alert('No valid QR codes found. Please regenerate.');
            return;
        }
        
        // Open a new window for printing
        const printWindow = window.open('', 'printWindow', 'width=900,height=600');
        
        if (!printWindow) {
            alert('Could not open print window. Please check your browser popup settings.');
            return;
        }
        
        // Build the HTML for the print window
        let html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Print QR Codes</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: Arial, sans-serif;
            padding: 10mm;
            background: white;
        }
        .print-container {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 10mm;
            width: 100%;
        }
        .qr-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 8mm;
            page-break-inside: avoid;
            border: 1px solid #eee;
            border-radius: 4px;
        }
        .qr-item img {
            width: 35mm;
            height: 35mm;
            display: block;
            margin-bottom: 3mm;
            image-rendering: pixelated;
        }
        .qr-label {
            font-size: 11pt;
            font-weight: bold;
            margin-bottom: 1mm;
            text-align: center;
        }
        .qr-sublabel {
            font-size: 8pt;
            color: #666;
            text-align: center;
        }
        @media print {
            body {
                padding: 5mm;
            }
            .print-container {
                gap: 8mm;
            }
            .qr-item {
                page-break-inside: avoid;
                break-inside: avoid;
            }
        }
        @page {
            size: A4;
            margin: 5mm;
        }
    </style>
</head>
<body>
    <div class="print-container">
`;
        
        // Add QR codes to HTML
        qrCodesData.forEach((qr) => {
            html += `
        <div class="qr-item">
            <img src="${qr.src}" alt="${qr.tableNum}" />
            <div class="qr-label">${qr.tableNum}</div>
            <div class="qr-sublabel">Scan to order</div>
        </div>
`;
        });
        
        html += `
    </div>
</body>
</html>
`;
        
        // Write to the print window
        printWindow.document.write(html);
        printWindow.document.close();
        
        // Wait for content and images to load, then print
        printWindow.onload = function() {
            setTimeout(() => {
                printWindow.print();
                // Close window after print dialog
                setTimeout(() => {
                    printWindow.close();
                }, 500);
            }, 500);
        };
        
        // Fallback if onload doesn't fire
        setTimeout(() => {
            if (!printWindow.closed) {
                printWindow.print();
                setTimeout(() => {
                    printWindow.close();
                }, 500);
            }
        }, 2000);
    });

    // Allow Enter key on number inputs
    tableCountInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            generateBtn.click();
        }
    });

    startTableInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            generateBtn.click();
        }
    });
});

function displayQRCodes(qrCodes, count) {
    const qrGrid = document.getElementById('qrGrid');
    const qrCodesContainer = document.getElementById('qrCodesContainer');
    const qrCountDisplay = document.getElementById('qrCountDisplay');

    if (!qrGrid || !qrCodesContainer) {
        alert('Error: Page elements not found. Please refresh the page.');
        return;
    }

    // Clear previous QR codes
    qrGrid.innerHTML = '';
    
    // Add new QR codes
    qrCodes.forEach((qrData, index) => {
        const item = document.createElement('div');
        item.className = 'qr-code-item';
        
        // Ensure image data is valid
        if (!qrData.image) {
            return;
        }
        
        const img = document.createElement('img');
        img.src = qrData.image;
        img.alt = 'Table ' + qrData.table_number + ' QR Code';
        img.style.width = '150px';
        img.style.height = '150px';
        
        const tableLabel = document.createElement('div');
        tableLabel.className = 'qr-table-number';
        tableLabel.textContent = 'Table ' + qrData.table_number;
        
        const scanLabel = document.createElement('div');
        scanLabel.className = 'qr-table-label';
        scanLabel.textContent = 'Scan to access chatbot';
        
        item.appendChild(img);
        item.appendChild(tableLabel);
        item.appendChild(scanLabel);
        
        qrGrid.appendChild(item);
    });

    // Show container and update count
    qrCodesContainer.classList.remove('d-none');
    qrCountDisplay.textContent = count;
    
    // Scroll to QR codes
    setTimeout(() => {
        try {
            qrCodesContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (e) {
            // Scroll failed silently
        }
    }, 100);
}
