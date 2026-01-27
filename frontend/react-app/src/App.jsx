import { useState } from 'react';
import SuperAdmin from './pages/SuperAdmin.jsx';
import RestoAdmin from './pages/RestoAdmin.jsx';
import ClientChat from './pages/ClientChat.jsx';

const tabs = [
  { key: 'super', label: 'Super Admin', component: <SuperAdmin /> },
  { key: 'resto', label: 'Resto Admin', component: <RestoAdmin /> },
  { key: 'client', label: 'Client Chat', component: <ClientChat /> },
];

export default function App() {
  const [active, setActive] = useState('super');

  return (
    <div>
      <h2>Resto AI — React Frontend</h2>
      <div className="nav">
        {tabs.map(t => (
          <button key={t.key} className={active === t.key ? 'active' : ''} onClick={() => setActive(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {tabs.find(t => t.key === active)?.component}
    </div>
  );
}
