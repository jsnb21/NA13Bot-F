/**
 * Turbo-specific enhancements for seamless navigation
 * Provides smooth transitions and proper link handling
 * 
 * IMPORTANT FIXES:
 * - Logout links are excluded from Turbo (data-turbo="false") for proper session cleanup
 * - Pointer events are NOT disabled on the main frame (was breaking all button clicks)
 * - Visual feedback happens via opacity/fade instead of disabling interactions
 */

// Prevent multiple initialization
if (!window.turboEnhancementsInitialized) {
  window.turboEnhancementsInitialized = true;

  // Clean up page-specific flags and destroy charts when actually navigating away
  document.addEventListener('turbo:before-cache', function() {
    // Clear any running page-specific intervals
    if (window.ordersRefreshInterval) {
      clearInterval(window.ordersRefreshInterval);
      window.ordersRefreshInterval = null;
    }
    
    if (window.dashboardRefreshInterval) {
      clearInterval(window.dashboardRefreshInterval);
      window.dashboardRefreshInterval = null;
    }
    
    // Destroy chart instances to prevent canvas reuse errors
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
    
    // Reset initialization flags for page-specific scripts
    window.menuScriptInitialized = false;
    window.ordersScriptInitialized = false;
    window.reportsChartsInitialized = false;
    window.dashboardInitialized = false;
  });

  // Fade out main frame before rendering new content
  document.addEventListener('turbo:before-frame-render', function() {
    const mainFrame = document.getElementById('main-frame');
    if (mainFrame) {
      mainFrame.style.transition = 'opacity 0.15s ease-out';
      mainFrame.style.opacity = '0.6';
    }
  });

  // Restore frame with smooth fade-in after rendering
  document.addEventListener('turbo:after-frame-render', function() {
    const mainFrame = document.getElementById('main-frame');
    if (mainFrame) {
      mainFrame.style.transition = 'opacity 0.3s ease-in';
      mainFrame.style.opacity = '1';
    }
  });

  // Ensure frame is visible on page load
  document.addEventListener('turbo:load', function() {
    const mainFrame = document.getElementById('main-frame');
    if (mainFrame) {
      mainFrame.style.opacity = '1';
      mainFrame.style.transition = 'none';
    }
    
    // Update active nav link
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
      link.classList.remove('active');
      if (link.getAttribute('href') === window.location.pathname) {
        link.classList.add('active');
      }
    });
  });

  // Configure logout links to bypass Turbo (required for proper session cleanup)
  document.addEventListener('turbo:load', function() {
    // Find all logout/signout links and explicitly disable Turbo handling
    const logoutLinks = document.querySelectorAll(
      'a.sidebar-logout-link, a.navbar-logout, [href*="/logout"], [href*="logout"]'
    );
    logoutLinks.forEach(link => {
      link.setAttribute('data-turbo', 'false');
    });
  });

  // Handle Turbo errors gracefully
  document.addEventListener('turbo:fetch-request-error', function() {
    const mainFrame = document.getElementById('main-frame');
    if (mainFrame) {
      mainFrame.style.opacity = '1';
    }
  });

  // Initialize logout link exclusion on initial page load
  document.addEventListener('DOMContentLoaded', function() {
    const logoutLinks = document.querySelectorAll(
      'a.sidebar-logout-link, a.navbar-logout, [href*="/logout"], [href*="logout"]'
    );
    logoutLinks.forEach(link => {
      link.setAttribute('data-turbo', 'false');
    });
  });

} // End of turboEnhancementsInitialized check
