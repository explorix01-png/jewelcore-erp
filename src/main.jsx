import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)

// Register PWA Service Worker in supported browsers with update lifecycle
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((reg) => {
        // Probe for updates on reload/navigation
        reg.update().catch(() => {});
      })
      .catch((error) => {
        console.warn('PWA service worker registration notice:', error);
      });
  });
}
