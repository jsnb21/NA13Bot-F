import { useState } from 'react';
import api from '../api.js';

export default function ClientChat() {
  const [apiKey, setApiKey] = useState('');
  const [restaurantId, setRestaurantId] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState('');

  const send = async () => {
    if (!query.trim()) return setError('query required');
    setError(''); setLoading(true);
    try {
      const headers = {};
      if (apiKey.trim()) headers['X-API-Key'] = apiKey.trim();
      else if (restaurantId.trim()) headers['X-Restaurant-Id'] = restaurantId.trim();
      const { data } = await api.post('/client-api/v1/chat', { query: query.trim() }, { headers });
      setResponse(data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <h3>Client Chat</h3>
      <div className="row">
        <label>API Key (preferred)</label>
        <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="X-API-Key" />
      </div>
      <div className="row">
        <label>Restaurant ID (fallback)</label>
        <input value={restaurantId} onChange={e => setRestaurantId(e.target.value)} placeholder="123" />
      </div>
      <div className="row">
        <label>Query</label>
        <textarea value={query} onChange={e => setQuery(e.target.value)} placeholder="Do you have vegan options?" />
      </div>
      <button onClick={send} disabled={loading}>{loading ? 'Sending...' : 'Send'}</button>
      {error && <p style={{color:'crimson'}}>{error}</p>}
      {response && <pre>{JSON.stringify(response, null, 2)}</pre>}
    </div>
  );
}
