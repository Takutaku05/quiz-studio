import { createInstallPromptStore } from './installPrompt';

/**
 * App-wide store for the `beforeinstallprompt` event. Imported from main.tsx so the
 * listener is attached at startup, before the dashboard (which shows the button) mounts.
 */
export const appInstallPromptStore = createInstallPromptStore(window);
