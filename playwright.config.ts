import { defineConfig } from '@playwright/test';

/** Usa el Edge ya instalado: no descarga navegadores. Puertos propios, para no chocar con una vista previa abierta. El servidor se cierra solo al terminar. */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4183',
    channel: 'msedge',
    locale: 'es-ES',
    // A propósito fuera de España: los horarios deben seguir siendo peninsulares.
    timezoneId: 'America/Los_Angeles',
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
  },
  webServer: [
    { command: 'npm run preview -- --port 4183', url: 'http://localhost:4183', reuseExistingServer: false },
    // La misma compilación en una subcarpeta, como la servirá GitHub Pages.
    {
      command: 'npm run preview -- --base /go-metahub/ --port 4184',
      url: 'http://localhost:4184/go-metahub/',
      reuseExistingServer: false,
    },
  ],
});
