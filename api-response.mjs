export async function readApiResponse(response, fallback = 'The service is unavailable. Please try again.') {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    if (response.status === 429) throw new Error('Too many requests. Please wait a moment and try again.');
    throw new Error(`${fallback} (HTTP ${response.status})`);
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`${fallback} The server returned an invalid response.`);
  }
  if (!response.ok) throw new Error(data?.error || (response.status === 429
    ? 'Too many requests. Please wait a moment and try again.'
    : fallback));
  return data;
}
