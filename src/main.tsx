import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { registerServiceWorker } from './lib/registerServiceWorker';
// Attach the beforeinstallprompt listener at startup (Issue #43).
import './lib/appInstallPrompt';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerServiceWorker({ enabled: import.meta.env.PROD, window, navigator });
