export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
export async function api(path, { method = 'GET', body, signal } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      signal,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('Connection lost. Please try again.', 0);
  }
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      data?.errors?.join(' ') || data?.message || 'Something went wrong. Please try again.',
      response.status,
    );
  return data;
}
export function showError(element, error) {
  element.textContent = error.message;
  element.hidden = false;
}
export function clearLegacySession() {
  // Cookie authentication still works when browser storage is blocked.
  try {
    localStorage.removeItem('VIBE_TOKEN');
    localStorage.removeItem('VIBE_USER_ID');
  } catch {}
}
