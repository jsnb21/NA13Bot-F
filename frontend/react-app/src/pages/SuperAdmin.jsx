import { useState } from 'react';
import api from '../api.js';

export default function SuperAdmin() {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!name.trim()) return setError('Name required');
    setError(''); setLoading(true);
    try {
      const { data } = await api.post('/super-admin/restaurants', { name: name.trim() });
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <h3>Super Admin: Create Restaurant</h3>
      <div className="row">
        <label>Restaurant Name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Bistro Nova" />
      </div>
      <button onClick={submit} disabled={loading}>{loading ? 'Creating...' : 'Create'}</button>
      {error && <p style={{color:'crimson'}}>{error}</p>}
      {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
}
