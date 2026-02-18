/**
 * Turbo-specific enhancements for seamless navigation
 * Provides loading indicators and smooth transitions
 */

// Clean up page-specific flags and destroy charts when actually navigating away (not on hover preview)
document.addEventListener('turbo:before-cache', function() {
  // Only triggered when actually navigating away from current page, not on hover preview
  
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

function setMainFrameInteractive(isInteractive) {
  const mainFrame = document.getElementById('main-frame');
  if (!mainFrame) return;
  mainFrame.style.pointerEvents = isInteractive ? 'auto' : 'none';
}

let frameInteractionTimer = null;
function scheduleInteractionRestore() {
  if (frameInteractionTimer) {
    clearTimeout(frameInteractionTimer);
  }
  frameInteractionTimer = setTimeout(function() {
    setMainFrameInteractive(true);
    frameInteractionTimer = null;
  }, 2000);
}

// Visual feedback during fetch request (hover preview or actual navigation)
document.addEventListener('turbo:before-fetch-request', function() {
  setMainFrameInteractive(false);
  scheduleInteractionRestore();
});

document.addEventListener('turbo:before-frame-render', function() {
  // Fade out before rendering new content
  const mainFrame = document.getElementById('main-frame');
  if (mainFrame) {
    mainFrame.style.transition = 'opacity 0.15s ease-out';
  }
});

document.addEventListener('turbo:after-frame-render', function() {
  // Restore frame after rendering, add smooth fade-in
  const mainFrame = document.getElementById('main-frame');
  if (mainFrame) {
    mainFrame.style.transition = 'opacity 0.3s ease-in';
    mainFrame.style.opacity = '1';
    mainFrame.style.pointerEvents = 'auto';
  }
  if (frameInteractionTimer) {
    clearTimeout(frameInteractionTimer);
    frameInteractionTimer = null;
  }
});

document.addEventListener('turbo:load', function() {
  // Called when page fully loads via Turbo
  const mainFrame = document.getElementById('main-frame');
  if (mainFrame) {
    mainFrame.style.opacity = '1';
    mainFrame.style.pointerEvents = 'auto';
  }
  if (frameInteractionTimer) {
    clearTimeout(frameInteractionTimer);
    frameInteractionTimer = null;
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

// Handle form submissions with Turbo
document.addEventListener('turbo:before-fetch-response', function(event) {
  const response = event.detail.fetchResponse;
  
  // Handle redirect responses (3xx status codes)
  if (response.response.status >= 300 && response.response.status < 400) {
    // Let Turbo handle the redirect
    return;
  }

  // Make sure interactions are restored even if the frame won't render.
  setMainFrameInteractive(true);
  if (frameInteractionTimer) {
    clearTimeout(frameInteractionTimer);
    frameInteractionTimer = null;
  }
});

// Restore interactions if a Turbo request fails or is canceled.
document.addEventListener('turbo:fetch-request-error', function() {
  setMainFrameInteractive(true);
  if (frameInteractionTimer) {
    clearTimeout(frameInteractionTimer);
    frameInteractionTimer = null;
  }
});

// Restore interactions after non-frame renders as a fallback.
document.addEventListener('turbo:render', function() {
  setMainFrameInteractive(true);
  if (frameInteractionTimer) {
    clearTimeout(frameInteractionTimer);
    frameInteractionTimer = null;
  }
});

// Enhance links with data-turbo attribute for explicit Turbo navigation
document.addEventListener('click', function(event) {
  const link = event.target.closest('a[data-turbo="true"]');
  if (link && !event.defaultPrevented) {
    // Ensure Turbo handles this link
    return true;
  }
});
