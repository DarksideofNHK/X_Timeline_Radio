import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// 既存のService Workerを解除（キャッシュ問題の解消）
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister();
      console.log('[SW] Unregistered service worker');
    }
  });
  // キャッシュも削除
  if ('caches' in window) {
    caches.keys().then((names) => {
      for (const name of names) {
        caches.delete(name);
        console.log('[Cache] Deleted cache:', name);
      }
    });
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
