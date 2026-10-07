// Hosted cloud adapter. Keys remain in this closure until the tab closes.
window.GameBuilderCloud = (() => {
  let settings = null;
  async function request(path, options = {}) {
    const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The cloud request failed.');
    return result;
  }
  return {
    configure(value) { settings = value; },
    configured() { return !!settings; },
    async sample(prompt, options = {}) {
      if (!settings) throw new Error('Enter your API key in AI settings first.');
      const result = await request('/api/generate', { method: 'POST', body: JSON.stringify({ ...settings, prompt }), signal: options.signal });
      options.onText?.({ text: result.text }); return result;
    },
    session: () => request('/api/session'),
    list: async () => (await request('/api/games')).games,
    save: (id, document) => request('/api/games/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify(document) }),
    remove: id => request('/api/games/' + encodeURIComponent(id), { method: 'DELETE' })
  };
})();
