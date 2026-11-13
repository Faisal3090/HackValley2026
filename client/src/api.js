const API_BASE = '/api/v1';

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function apiRequest(path, { method = 'GET', body, token, headers = {} } = {}) {
  const reqHeaders = { ...headers };
  if (body !== undefined) {
    reqHeaders['Content-Type'] = 'application/json';
  }
  if (token) {
    reqHeaders['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: reqHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text || 'Unexpected server response', code: 'PARSE_ERROR' };
  }

  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.code || 'REQUEST_FAILED',
      data?.error || `Request failed (${res.status})`
    );
  }

  return data;
}

export async function searchPlaces(query, { token, bias, signal } = {}) {
  const params = new URLSearchParams({ text: query.trim() });
  if (bias?.lat != null && bias?.lng != null) {
    params.set('lat', String(bias.lat));
    params.set('lng', String(bias.lng));
  }

  const reqHeaders = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${API_BASE}/places/search?${params.toString()}`, {
    headers: reqHeaders,
    signal,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.code || 'PLACE_SEARCH_FAILED',
      data?.error || `Place search failed (${res.status})`
    );
  }
  return data.results;
}
