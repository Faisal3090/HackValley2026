const API_BASE = '/api/v1';
const SESSION_KEY = 'kasucab_session';

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function api(path, options = {}) {
  const session = readSession();
  const headers = { Accept: 'application/json', ...(options.headers || {}) };

  if (options.body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (session?.accessToken) {
    headers.Authorization = `Bearer ${session.accessToken}`;
  }

  const response = await fetch(path.startsWith('/') ? path : `${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const error = new Error(
      data?.message || data?.error || `Request failed (${response.status})`
    );
    error.status = response.status;
    error.code = data?.code;
    throw error;
  }

  return data;
}

export function saveSession(data) {
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ user: data.user, accessToken: data.accessToken })
  );
}

export function getStoredUser() {
  return readSession()?.user || null;
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function money(value) {
  if (value == null || value === '') return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export function pretty(value) {
  return String(value ?? '')
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
