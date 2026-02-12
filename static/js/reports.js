document.addEventListener('turbo:load', function() {
    // Safety check: only run if we're on the reports page
    if (!document.getElementById('revenueChart')) return;
    
    // Guard against re-initialization
    if (window.reportsChartsInitialized) {
        // Destroy old charts first
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
    
    // Revenue Over Time Chart
    const revenueCtx = document.getElementById('revenueChart')?.getContext('2d');
    if (revenueCtx) {
        window.revenueChart = new Chart(revenueCtx, {
            type: 'line',
            data: {
                labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
                datasets: [{
                    label: 'Revenue',
                    data: [3000, 3500, 2800, 3150],
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
                        ticks: { callback: function(v) { return '₱' + v; } }
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
                labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                datasets: [{
                    label: 'Orders',
                    data: [32, 35, 28, 40, 38, 45, 50],
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
                labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                datasets: [{
                    label: 'New Customers',
                    data: [15, 20, 18, 28, 35, 42],
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
    
    window.reportsChartsInitialized = true;
});

