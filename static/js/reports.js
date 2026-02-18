// Global variable to store report data for export
window.reportData = {};

function setReportsLoading(isLoading) {
    const loadingEl = document.getElementById('reportsLoading');
    if (!loadingEl) return;
    loadingEl.style.display = isLoading ? 'flex' : 'none';
}

function exportReportAsCSV() {
    const data = window.reportData;
    if (!data.orders || data.orders.length === 0) {
        alert('No data available to export');
        return;
    }

    // Use PHP for CSV since ₱ causes encoding issues in CSV
    const currencySymbol = 'PHP';

    // CSV headers
    const headers = ['Order ID', 'Customer', 'Amount', 'Status', 'Date', 'Items'];
    
    // CSV rows
    const rows = data.orders.map(order => [
        order.id.substring(0, 8).toUpperCase(),
        order.customer_name || 'Unknown',
        order.total_amount || 0,
        order.status || 'pending',
        new Date(order.created_at).toLocaleDateString(),
        order.items && Array.isArray(order.items) ? order.items.map(i => i.name).join('; ') : ''
    ]);

    // Create CSV content
    let csv = headers.join(',') + '\n';
    rows.forEach(row => {
        csv += row.map(cell => {
            // Escape quotes in strings and wrap in quotes if needed
            const str = String(cell || '');
            return str.includes(',') || str.includes('"') || str.includes('\n') 
                ? `"${str.replace(/"/g, '""')}"` 
                : str;
        }).join(',') + '\n';
    });

    // Add summary metrics
    csv += '\n\nReport Summary\n';
    csv += 'Metric,Value\n';
    csv += `Total Orders This Month,${data.countThis || 0}\n`;
    csv += `Total Revenue This Month,${currencySymbol} ${parseFloat(data.revenueThis || 0).toFixed(2)}\n`;
    csv += `Average Order Value,${currencySymbol} ${parseFloat(data.avgThis || 0).toFixed(2)}\n`;
    csv += `Total Orders Last Month,${data.countLast || 0}\n`;
    csv += `Total Revenue Last Month,${currencySymbol} ${parseFloat(data.revenueLast || 0).toFixed(2)}\n`;
    csv += `Generated,${new Date().toLocaleString()}\n`;

    // Trigger download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `report-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function initReports() {
    // Safety check: only run if we're on the reports page
    if (!document.getElementById('revenueChart')) return;

    const loadToken = Date.now();
    window.reportsLoadToken = loadToken;
    
    // Guard against re-initialization
    if (window.reportsChartsInitialized) {
        destroyReportsCharts();
    }
    
    // Get currency symbol
    window.symbol = window.symbol || '₱';
    
    // Fetch real data from API
    setReportsLoading(true);
    fetch('/api/orders/list')
        .then(response => response.json())
        .then(data => {
            if (window.reportsLoadToken !== loadToken) {
                return;
            }
            // Handle response structure - could be array or wrapped in object
            let orders = Array.isArray(data) ? data : (data.orders || data.data || []);
            
            if (!orders || orders.length === 0) {
                showNoDataState();
                return;
            }

            clearNoDataState();
            
            // Calculate metrics
            const now = new Date();
            const thisMonth = now.getMonth();
            const thisYear = now.getFullYear();
            const startOfMonth = new Date(thisYear, thisMonth, 1);
            const startOfLastMonth = new Date(thisYear, thisMonth - 1, 1);
            const endOfLastMonth = new Date(thisYear, thisMonth, 0);
            
            // Filter orders by time period
            const ordersThisMonth = orders.filter(o => {
                const date = new Date(o.created_at);
                return date >= startOfMonth;
            });
            
            const ordersLastMonth = orders.filter(o => {
                const date = new Date(o.created_at);
                return date >= startOfLastMonth && date <= endOfLastMonth;
            });
            
            // Calculate revenue
            const revenueThis = ordersThisMonth.reduce((sum, o) => sum + (o.total_amount || 0), 0);
            const revenueLast = ordersLastMonth.reduce((sum, o) => sum + (o.total_amount || 0), 0);
            const revenueChange = revenueThis - revenueLast;
            const revenuePercent = revenueLast > 0 ? ((revenueChange / revenueLast) * 100).toFixed(1) : 0;
            
            // Calculate order counts
            const countThis = ordersThisMonth.length;
            const countLast = ordersLastMonth.length;
            const countChange = countThis - countLast;
            const countPercent = countLast > 0 ? ((countChange / countLast) * 100).toFixed(1) : 0;
            
            // Calculate average order value
            const avgThis = countThis > 0 ? (revenueThis / countThis).toFixed(2) : 0;
            const avgLast = countLast > 0 ? (revenueLast / countLast).toFixed(2) : 0;
            const avgChange = avgThis - avgLast;
            const avgPercent = avgLast > 0 ? ((avgChange / avgLast) * 100).toFixed(1) : 0;
            
            // Top categories
            const categoryMap = {};
            ordersThisMonth.forEach(o => {
                if (o.items && Array.isArray(o.items)) {
                    o.items.forEach(item => {
                        const category = item.category || 'Other';
                        categoryMap[category] = (categoryMap[category] || 0) + 1;
                    });
                }
            });
            
            const totalItems = Object.values(categoryMap).reduce((a, b) => a + b, 0);
            const topCategories = Object.entries(categoryMap)
                .map(([name, count]) => ({ name, percent: totalItems > 0 ? ((count / totalItems) * 100).toFixed(1) : 0 }))
                .sort((a, b) => b.percent - a.percent)
                .slice(0, 4);
            
            // Update sales summary
            updateSalesSummary(revenueThis, revenueLast, revenueChange, revenuePercent, countThis, countLast, countChange, countPercent, avgThis, avgLast, avgChange, avgPercent);
            
            // Store data for export
            window.reportData = {
                orders: orders,
                ordersThisMonth: ordersThisMonth,
                ordersLastMonth: ordersLastMonth,
                revenueThis: revenueThis,
                revenueLast: revenueLast,
                countThis: countThis,
                countLast: countLast,
                avgThis: avgThis,
                avgLast: avgLast,
                topCategories: topCategories
            };
            
            // Update top categories
            updateTopCategories(topCategories);
            
            // Update total revenue text
            const totalRevEl = document.getElementById('totalRevenueText');
            if (totalRevEl) {
                totalRevEl.textContent = `Total Revenue This Month: ${window.symbol}${revenueThis.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
            }
            
            // Generate chart data from orders grouped by week
            const weekData = groupOrdersByWeek(ordersThisMonth);
            const dayData = groupOrdersByDay(ordersThisMonth);
            const monthData = groupOrdersByMonth(orders);
            
            destroyReportsCharts();

            // Revenue Over Time Chart
            const revenueCtx = document.getElementById('revenueChart')?.getContext('2d');
            if (revenueCtx) {
                window.revenueChart = new Chart(revenueCtx, {
                    type: 'line',
                    data: {
                        labels: weekData.labels,
                        datasets: [{
                            label: 'Revenue',
                            data: weekData.data,
                            borderColor: '#2563eb',
                            backgroundColor: 'rgba(37, 99, 235, 0.1)',
                            tension: 0.4,
                            fill: true,
                            pointRadius: 5,
                            pointBackgroundColor: '#2563eb'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        plugins: {
                            legend: { display: false }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: { callback: function(v) { return window.symbol + v; } }
                            }
                        }
                    }
                });
            }

            // Orders by Day of Week Chart
            const ordersCtx = document.getElementById('ordersChart')?.getContext('2d');
            if (ordersCtx) {
                window.ordersChart = new Chart(ordersCtx, {
                    type: 'bar',
                    data: {
                        labels: dayData.labels,
                        datasets: [{
                            label: 'Orders',
                            data: dayData.data,
                            backgroundColor: '#10b981'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        plugins: {
                            legend: { display: false }
                        },
                        scales: {
                            y: { beginAtZero: true }
                        }
                    }
                });
            }

            // Customer Growth Chart
            const growthCtx = document.getElementById('growthChart')?.getContext('2d');
            if (growthCtx) {
                window.growthChart = new Chart(growthCtx, {
                    type: 'line',
                    data: {
                        labels: monthData.labels,
                        datasets: [{
                            label: 'New Customers',
                            data: monthData.data,
                            borderColor: '#f59e0b',
                            backgroundColor: 'rgba(245, 158, 11, 0.1)',
                            tension: 0.4,
                            fill: true,
                            pointRadius: 5,
                            pointBackgroundColor: '#f59e0b'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        plugins: {
                            legend: { display: false }
                        },
                        scales: {
                            y: { beginAtZero: true }
                        }
                    }
                });
            }
        })
        .catch(err => {
            console.error('Error loading reports data:', err);
            showNoDataState();
        })
        .finally(() => {
            setReportsLoading(false);
        });
    
    // Export Report button handler
    const exportBtn = document.getElementById('exportReportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportReportAsCSV);
    }
    
    window.reportsChartsInitialized = true;
}

document.addEventListener('turbo:load', function() {
    initReports();
});

document.addEventListener('turbo:frame-load', function(event) {
    if (event.target && event.target.id === 'main-frame') {
        initReports();
    }
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        initReports();
    }, { once: true });
} else {
    initReports();
}

function showNoDataState(message) {
    const text = message || 'There is not enough data to show analytics yet.';
    const totalRevEl = document.getElementById('totalRevenueText');
    if (totalRevEl) {
        totalRevEl.textContent = text;
    }
    updateTopCategories([]);
    setChartEmptyState('revenueChart', text);
    setChartEmptyState('ordersChart', text);
    setChartEmptyState('growthChart', text);
}

function clearNoDataState() {
    clearChartEmptyState('revenueChart');
    clearChartEmptyState('ordersChart');
    clearChartEmptyState('growthChart');
}

function setChartEmptyState(canvasId, message) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !canvas.parentElement) return;
    canvas.style.display = 'none';

    const parent = canvas.parentElement;
    let existing = parent.querySelector(`.analytics-empty[data-for="${canvasId}"]`);
    if (!existing) {
        existing = document.createElement('div');
        existing.className = 'analytics-empty';
        existing.dataset.for = canvasId;
        parent.appendChild(existing);
    }
    existing.textContent = message;
}

function clearChartEmptyState(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !canvas.parentElement) return;
    const parent = canvas.parentElement;
    const existing = parent.querySelector(`.analytics-empty[data-for="${canvasId}"]`);
    if (existing) {
        existing.remove();
    }
    canvas.style.display = '';
}

function updateSalesSummary(revenueThis, revenueLast, revenueChange, revenuePercent, countThis, countLast, countChange, countPercent, avgThis, avgLast, avgChange, avgPercent) {
    const el = (id) => document.getElementById(id);
    
    // Revenue
    if (el('revenueThisMonth')) el('revenueThisMonth').textContent = `${window.symbol}${revenueThis.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    if (el('revenueLastMonth')) el('revenueLastMonth').textContent = `${window.symbol}${revenueLast.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    if (el('revenueChange')) {
        const sign = revenueChange >= 0 ? '+' : '';
        el('revenueChange').textContent = `${sign}${window.symbol}${Math.abs(revenueChange).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    }
    if (el('revenueTrend')) {
        const trendColor = revenuePercent >= 0 ? '#4caf50' : '#f44336';
        const arrow = revenuePercent >= 0 ? '↑' : '↓';
        el('revenueTrend').innerHTML = `<span style="color:${trendColor};">${arrow} ${Math.abs(revenuePercent)}%</span>`;
    }
    
    // Orders
    if (el('ordersThisMonth')) el('ordersThisMonth').textContent = countThis;
    if (el('ordersLastMonth')) el('ordersLastMonth').textContent = countLast;
    if (el('ordersChange')) {
        const sign = countChange >= 0 ? '+' : '';
        el('ordersChange').textContent = `${sign}${countChange}`;
    }
    if (el('ordersTrend')) {
        const trendColor = countPercent >= 0 ? '#4caf50' : '#f44336';
        const arrow = countPercent >= 0 ? '↑' : '↓';
        el('ordersTrend').innerHTML = `<span style="color:${trendColor};">${arrow} ${Math.abs(countPercent)}%</span>`;
    }
    
    // Average Order Value
    if (el('avgOrderThisMonth')) el('avgOrderThisMonth').textContent = `${window.symbol}${avgThis}`;
    if (el('avgOrderLastMonth')) el('avgOrderLastMonth').textContent = `${window.symbol}${avgLast}`;
    if (el('avgOrderChange')) {
        const sign = avgChange >= 0 ? '+' : '';
        el('avgOrderChange').textContent = `${sign}${window.symbol}${Math.abs(avgChange).toFixed(2)}`;
    }
    if (el('avgOrderTrend')) {
        const trendColor = avgPercent >= 0 ? '#4caf50' : '#f44336';
        const arrow = avgPercent >= 0 ? '↑' : '↓';
        el('avgOrderTrend').innerHTML = `<span style="color:${trendColor};">${arrow} ${Math.abs(avgPercent)}%</span>`;
    }
}

function destroyReportsCharts() {
    if (window.revenueChart && typeof window.revenueChart.destroy === 'function') {
        window.revenueChart.destroy();
        window.revenueChart = null;
    }
    if (window.ordersChart && typeof window.ordersChart.destroy === 'function') {
        window.ordersChart.destroy();
        window.ordersChart = null;
    }
    if (window.growthChart && typeof window.growthChart.destroy === 'function') {
        window.growthChart.destroy();
        window.growthChart = null;
    }
}

function updateTopCategories(categories) {
    const container = document.getElementById('topCategoriesContainer');
    if (!container) return;
    
    if (categories.length === 0) {
        container.innerHTML = '<p class="text-muted text-center">There is not enough data to show analytics yet.</p>';
        return;
    }
    
    let html = '';
    categories.forEach((cat, idx) => {
        const borderBottom = idx < categories.length - 1 ? 'border-bottom:1px solid #eee;' : '';
        html += `<div style="display:flex; justify-content:space-between; padding:10px 0; ${borderBottom}">
                    <span>${cat.name}</span>
                    <strong>${cat.percent}%</strong>
                 </div>`;
    });
    container.innerHTML = html;
}

function groupOrdersByWeek(orders) {
    const weekMap = {};
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    for (let i = 0; i < 4; i++) {
        const weekStart = new Date(startOfMonth);
        weekStart.setDate(weekStart.getDate() + i * 7);
        const weekLabel = `Week ${i + 1}`;
        weekMap[weekLabel] = 0;
    }
    
    orders.forEach(order => {
        const date = new Date(order.created_at);
        const dayOfMonth = date.getDate();
        const week = Math.floor((dayOfMonth - 1) / 7) + 1;
        const weekLabel = `Week ${week}`;
        if (weekMap.hasOwnProperty(weekLabel)) {
            weekMap[weekLabel] += order.total_amount || 0;
        }
    });
    
    return {
        labels: Object.keys(weekMap),
        data: Object.values(weekMap)
    };
}

function groupOrdersByDay(orders) {
    const dayMap = { 'Mon': 0, 'Tue': 0, 'Wed': 0, 'Thu': 0, 'Fri': 0, 'Sat': 0, 'Sun': 0 };
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    orders.forEach(order => {
        const date = new Date(order.created_at);
        const dayName = dayNames[date.getDay()];
        dayMap[dayName] = (dayMap[dayName] || 0) + 1;
    });
    
    return {
        labels: Object.keys(dayMap),
        data: Object.values(dayMap)
    };
}

function groupOrdersByMonth(orders) {
    const monthMap = {};
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthCounts = {};
    
    // Initialize last 6 months
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
        const date = new Date(now);
        date.setMonth(date.getMonth() - i);
        const monthLabel = monthNames[date.getMonth()];
        monthMap[monthLabel] = 0;
    }
    
    orders.forEach(order => {
        const date = new Date(order.created_at);
        const monthLabel = monthNames[date.getMonth()];
        if (monthMap.hasOwnProperty(monthLabel)) {
            monthMap[monthLabel] = (monthMap[monthLabel] || 0) + 1;
        }
    });
    
    return {
        labels: Object.keys(monthMap),
        data: Object.values(monthMap)
    };
}

