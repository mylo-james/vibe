import { api, showError, clearLegacySession } from './api.js';
clearLegacySession();
const button = document.querySelector('#demoButton');
const idleLabel = button.dataset.idleLabel || button.textContent.trim();
button.addEventListener('click', async () => {
  button.disabled = true;
  button.textContent = 'Opening your music…';
  try {
    await api('/demo', { method: 'POST' });
    location.href = '/music';
  } catch (error) {
    showError(document.querySelector('#error'), error);
    button.disabled = false;
    button.textContent = idleLabel;
  }
});
