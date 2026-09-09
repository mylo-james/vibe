import { api, showError, clearLegacySession } from './api.js';
clearLegacySession();
const button = document.querySelector('#demoButton');
button.addEventListener('click', async () => {
  button.disabled = true;
  button.textContent = 'Opening your music…';
  try {
    await api('/demo', { method: 'POST' });
    location.href = '/music';
  } catch (error) {
    showError(document.querySelector('#error'), error);
    button.disabled = false;
    button.textContent = 'Try the demo';
  }
});
