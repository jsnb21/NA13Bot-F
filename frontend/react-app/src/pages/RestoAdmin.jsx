import { useState } from 'react';
import api from '../api.js';

export default function RestoAdmin() {
  const [apiKey, setApiKey] = useState('');
  const [instruction, setInstruction] = useState('');
  const [menuText, setMenuText] = useState('');
  const [savingInstr, setSavingInstr] = useState(false);
  const [uploadingMenu, setUploadingMenu] = useState(false);
  const [instrResult, setInstrResult] = useState(null);
  const [menuResult, setMenuResult] = useState(null);
  const [error, setError] = useState('');

  const saveInstruction = async () => {
    if (!apiKey.trim()) return setError('API Key required');
    if (!instruction.trim()) return setError('Instruction required');
    setError(''); setSavingInstr(true);
    try {
      const { data } = await api.post('/resto-admin/system-instruction', { instruction: instruction.trim() }, {
        headers: { 'X-API-Key': apiKey.trim() }
      });
      setInstrResult(data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSavingInstr(false);
    }
  };

  const uploadMenu = async () => {
    if (!apiKey.trim()) return setError('API Key required');
    if (!menuText.trim()) return setError('menu_text required');
    setError(''); setUploadingMenu(true);
    try {
      const { data } = await api.post('/resto-admin/menus', { menu_text: menuText.trim() }, {
        headers: { 'X-API-Key': apiKey.trim() }
      });
      setMenuResult(data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setUploadingMenu(false);
    }
  };

  return (
    <div className="card">
      <h3>Restaurant Admin</h3>
      <div className="row">
        <label>API Key</label>
        <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="paste X-API-Key" />
      </div>

      <div className="row">
        <label>System Instruction</label>
        <textarea value={instruction} onChange={e => setInstruction(e.target.value)} placeholder="You are the AI for ..." />
      </div>
      <button onClick={saveInstruction} disabled={savingInstr}>{savingInstr ? 'Saving...' : 'Save Instruction'}</button>
      {instrResult && <pre>{JSON.stringify(instrResult, null, 2)}</pre>}

      <div className="row" style={{marginTop:'16px'}}>
        <label>Menu Text</label>
        <textarea value={menuText} onChange={e => setMenuText(e.target.value)} placeholder="Appetizers:\n- ..." />
      </div>
      <button onClick={uploadMenu} disabled={uploadingMenu}>{uploadingMenu ? 'Uploading...' : 'Upload Menu'}</button>
      {menuResult && <pre>{JSON.stringify(menuResult, null, 2)}</pre>}

      {error && <p style={{color:'crimson'}}>{error}</p>}
    </div>
  );
}
