import { QueryClientProvider } from '@tanstack/preact-query';
import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { HOUR } from './data/config';
import { createClient, startPeriodicCheck } from './data/queries';
import { persistUpdates, restoreSources } from './data/storage';
import { App } from './ui/App';
import './ui/styles.css';

const client = createClient();

async function start() {
  // Los datos guardados se cargan antes de pintar; solo después se decide qué está caducado.
  let storageOk = true;
  try {
    await Promise.race([
      restoreSources(client),
      new Promise((_, reject) => setTimeout(() => reject(new Error('almacenamiento bloqueado')), 3000)),
    ]);
  } catch (error) {
    storageOk = false;
    console.error(error);
  }
  persistUpdates(client, (error) => console.error('No se han podido guardar los datos', error));

  startPeriodicCheck(client);

  render(
    <QueryClientProvider client={client}>
      <App storageOk={storageOk} />
    </QueryClientProvider>,
    document.getElementById('app')!,
  );

  // Instalada como aplicación, se pide que el sistema no borre los datos guardados.
  if (matchMedia('(display-mode: standalone)').matches) void navigator.storage?.persist?.();
}

void start();

registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (registration) setInterval(() => void registration.update().catch(() => {}), 6 * HOUR);
  },
});
