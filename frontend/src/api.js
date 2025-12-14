const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

async function parseErr(res) {
  try {
    const j = await res.json();
    return j.error || JSON.stringify(j);
  } catch {
    return await res.text();
  }
}

export async function getJSON(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...(options.headers || {}) },
  });
  if (!res.ok) throw new Error(await parseErr(res));
  return res.json();
}

export async function postJSON(path, body, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseErr(res));
  return res.json();
}
