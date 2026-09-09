import { api, showError, clearLegacySession } from './api.js';
export function setupAuth(path) {
  clearLegacySession();
  const form = document.querySelector('#auth-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('[type=submit]');
    const errors = document.querySelector('#errors');
    errors.hidden = true;
    button.disabled = true;
    try {
      await api(path, { method: 'POST', body: Object.fromEntries(new FormData(form)) });
      location.href = '/music';
    } catch (error) {
      showError(errors, error);
      button.disabled = false;
    }
  });
}
