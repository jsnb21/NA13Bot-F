/**
 * Turbo-specific enhancements for seamless navigation
 * Provides loading indicators and smooth transitions
 */

// Clean up page-specific flags when navigating to a new page
document.addEventListener('turbo:before-fetch-request', function() {
  // Clear any running page-specific intervals
  if (window.ordersRefreshInterval) {
    clearInterval(window.ordersRefreshInterval);
    window.ordersRefreshInterval = null;
  }
  
  // Reset initialization flags for page-specific scripts
  window.menuScriptInitialized = false;
  window.ordersScriptInitialized = false;
  
  // Add loading class to main frame for visual feedback
  const mainFrame = document.getElementById('main-frame');
  if (mainFrame) {
    mainFrame.style.pointerEvents = 'none';
  }
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
});

document.addEventListener('turbo:load', function() {
  // Called when page fully loads via Turbo
  const mainFrame = document.getElementById('main-frame');
  if (mainFrame) {
    mainFrame.style.opacity = '1';
    mainFrame.style.pointerEvents = 'auto';
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
});

// Enhance links with data-turbo attribute for explicit Turbo navigation
document.addEventListener('click', function(event) {
  const link = event.target.closest('a[data-turbo="true"]');
  if (link && !event.defaultPrevented) {
    // Ensure Turbo handles this link
    return true;
  }
});
