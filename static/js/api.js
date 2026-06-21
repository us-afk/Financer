// ======= Centralized API Layer =======
// Note: API_BASE, API_HEADERS, getAuthHeaders are defined in script.js

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...getAuthHeaders(), ...(options.headers || {}) }
  });
  if (res.status === 401) {
    handleAuthError();
    throw new Error('Unauthorized');
  }
  return res;
}