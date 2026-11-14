export async function requestPublicMenu(endpoint, apiKey, path = "", options = {}) {
  const response = await fetch(endpoint + path, {
    ...options,
    headers: { apikey: apiKey, "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({ error: "The service returned an unreadable response." }));
  if (!response.ok) throw new Error(body.error || "The menu service could not complete this request.");
  return body;
}
