'use client';

import { useState, useEffect } from 'react';
import styles from './admin.module.css';

export default function AdminPage() {
  const [token, setToken] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });
    
    try {
      const res = await fetch('/api/config', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (res.ok) {
        const data = await res.json();
        // Check if we got full config (auth success)
        if (data.icecastAdminUrl !== undefined) {
          setConfig(data);
          setIsAuthenticated(true);
        } else {
          setMessage({ type: 'error', text: 'Invalid Token' });
        }
      } else {
        setMessage({ type: 'error', text: 'Authentication failed' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error' });
    }
    setLoading(false);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setConfig(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });
    
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(config)
      });
      
      if (res.ok) {
        setMessage({ type: 'success', text: 'Configuration saved successfully!' });
      } else {
        setMessage({ type: 'error', text: 'Failed to save configuration.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error while saving.' });
    }
    setLoading(false);
  };

  const handleClearCache = async () => {
    setIsClearing(true);
    setMessage({ type: '', text: '' });
    
    try {
      const res = await fetch('/api/cache', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (res.ok) {
        setMessage({ type: 'success', text: 'Album art cache cleared successfully!' });
      } else {
        setMessage({ type: 'error', text: 'Failed to clear cache.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error while clearing cache.' });
    }
    setIsClearing(false);
  };

  if (!isAuthenticated) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>Admin Login</h1>
        <div className={styles.card}>
          {message.text && (
            <div className={`${styles.message} ${styles[message.type]}`}>
              {message.text}
            </div>
          )}
          <form onSubmit={handleLogin} className={styles.loginForm}>
            <div className={styles.inputGroup}>
              <label>Admin Token</label>
              <input 
                type="password" 
                value={token} 
                onChange={(e) => setToken(e.target.value)} 
                placeholder="Enter your admin token"
                required
              />
            </div>
            <button type="submit" className={styles.button} disabled={loading}>
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Dashboard</h1>
      
      {message.text && (
        <div className={`${styles.message} ${styles[message.type]}`}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSave} className={styles.settingsForm}>
        <div className={styles.card}>
          <div className={styles.settingsSection}>
            <h3>Icecast Settings</h3>
            <div className={styles.inputGroup}>
              <label>Admin URL (e.g., http://127.0.0.1:8000)</label>
              <input type="text" name="icecastAdminUrl" value={config.icecastAdminUrl || ''} onChange={handleChange} />
            </div>
            <div className={styles.inputGroup} style={{ marginTop: '15px' }}>
              <label>Admin Username</label>
              <input type="text" name="icecastUsername" value={config.icecastUsername || ''} onChange={handleChange} />
            </div>
            <div className={styles.inputGroup} style={{ marginTop: '15px' }}>
              <label>Admin Password</label>
              <input type="password" name="icecastPassword" value={config.icecastPassword || ''} onChange={handleChange} />
            </div>
            <div className={styles.inputGroup} style={{ marginTop: '15px' }}>
              <label>Icecast Mount Point (e.g., /autodj)</label>
              <input type="text" name="icecastMount" value={config.icecastMount || ''} onChange={handleChange} />
            </div>
            <div className={styles.inputGroup} style={{ marginTop: '15px' }}>
              <label>Frontend Stream URL (Audio Source)</label>
              <input type="text" name="streamUrl" value={config.streamUrl || ''} onChange={handleChange} />
            </div>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.settingsSection}>
            <h3>API Keys</h3>
            <div className={styles.inputGroup}>
              <label>Last.fm API Key (Optional)</label>
              <input type="text" name="lastFmApiKey" value={config.lastFmApiKey || ''} onChange={handleChange} />
            </div>
            <div className={styles.inputGroup} style={{ marginTop: '15px' }}>
              <label>Fanart.tv API Key (Optional)</label>
              <input type="text" name="fanartTvApiKey" value={config.fanartTvApiKey || ''} onChange={handleChange} />
            </div>

            <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #333' }}>
              <label style={{ display: 'block', marginBottom: '10px', fontSize: '1.2rem' }}>Album Art API Priority</label>
              <p style={{ fontSize: '0.9rem', color: '#888', marginBottom: '15px' }}>
                Select the order in which APIs are checked for album art.
              </p>
              
              <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                <div className={styles.inputGroup} style={{ flex: 1 }}>
                  <label>Priority 1</label>
                  <select name="apiPriority1" value={config.apiPriority1 || 'lastfm'} onChange={handleChange} style={{ width: '100%', padding: '10px', borderRadius: '4px', background: '#111', color: '#fff', border: '1px solid #333' }}>
                    <option value="lastfm">Last.fm</option>
                    <option value="itunes">iTunes</option>
                    <option value="fanart">Fanart.tv</option>
                  </select>
                </div>
                <div className={styles.inputGroup} style={{ flex: 1 }}>
                  <label>Priority 2</label>
                  <select name="apiPriority2" value={config.apiPriority2 || 'itunes'} onChange={handleChange} style={{ width: '100%', padding: '10px', borderRadius: '4px', background: '#111', color: '#fff', border: '1px solid #333' }}>
                    <option value="lastfm">Last.fm</option>
                    <option value="itunes">iTunes</option>
                    <option value="fanart">Fanart.tv</option>
                  </select>
                </div>
                <div className={styles.inputGroup} style={{ flex: 1 }}>
                  <label>Priority 3</label>
                  <select name="apiPriority3" value={config.apiPriority3 || 'fanart'} onChange={handleChange} style={{ width: '100%', padding: '10px', borderRadius: '4px', background: '#111', color: '#fff', border: '1px solid #333' }}>
                    <option value="lastfm">Last.fm</option>
                    <option value="itunes">iTunes</option>
                    <option value="fanart">Fanart.tv</option>
                  </select>
                </div>
              </div>
            </div>
            
            <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #333' }}>
              <label style={{ display: 'block', marginBottom: '10px' }}>Troubleshooting</label>
              <button 
                type="button" 
                onClick={handleClearCache} 
                className={styles.button} 
                style={{ backgroundColor: '#dc3545' }}
                disabled={isClearing}
              >
                {isClearing ? 'Clearing...' : 'Clear Album Art Cache'}
              </button>
            </div>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.settingsSection}>
            <h3>Bento Grid Links & Integration</h3>
            <div className={styles.inputGroup}>
              <label>Discord Bot Invite Link</label>
              <input type="text" name="discordBotLink" value={config.discordBotLink || ''} onChange={handleChange} />
            </div>
            <div className={styles.inputGroup} style={{ marginTop: '15px' }}>
              <label>Discord Bot Setup Command (e.g., /setup)</label>
              <input type="text" name="discordBotCommand" value={config.discordBotCommand || ''} onChange={handleChange} />
            </div>
            <div className={styles.inputGroup} style={{ marginTop: '15px' }}>
              <label>Discord Server Link</label>
              <input type="text" name="discordServerLink" value={config.discordServerLink || ''} onChange={handleChange} />
            </div>
          </div>
        </div>

        <button type="submit" className={styles.button} disabled={loading}>
          {loading ? 'Saving...' : 'Save Configuration'}
        </button>
      </form>
    </div>
  );
}
