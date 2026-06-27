'use client';

import { useState, useEffect } from 'react';
import styles from './admin.module.css';

export default function AdminPage() {
  const [token, setToken] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [newPassword, setNewPassword] = useState('');
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

  const handleAddBrandedShow = () => {
    setConfig(prev => ({
      ...prev,
      brandedShows: [...(prev.brandedShows || []), { primaryName: '', matchers: '', logoUrl: '' }]
    }));
  };

  const handleBrandedShowChange = (index, field, value) => {
    setConfig(prev => {
      const newShows = [...(prev.brandedShows || [])];
      newShows[index][field] = value;
      return { ...prev, brandedShows: newShows };
    });
  };

  const handleRemoveBrandedShow = (index) => {
    setConfig(prev => {
      const newShows = [...(prev.brandedShows || [])];
      newShows.splice(index, 1);
      return { ...prev, brandedShows: newShows };
    });
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

  const handleRotate = async () => {
    setIsRotating(true);
    setNewPassword('');
    try {
      const res = await fetch('/api/panel/rotate-password', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        // Trigger cron save
        if (config.rotationFrequency !== undefined) {
          await fetch('/api/panel/save-cron', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ frequency: config.rotationFrequency })
          });
        }
        setNewPassword(data.newPassword);
      } else {
        alert("Rotation failed: " + data.error);
      }
    } catch (err) {
      alert("Error triggering rotation");
    }
    setIsRotating(false);
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
            <div className={styles.inputGroup} style={{ marginTop: '15px' }}>
              <label>Buffer Countdown (Seconds)</label>
              <input type="number" name="bufferTime" value={config.bufferTime || 4} onChange={handleChange} min="1" max="30" />
            </div>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitle}>OBS Source Password Rotation</div>
          </div>
          <div className={styles.cardBody}>
            <p style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '15px' }}>
              Automatically or manually rotate the Icecast broadcasting source password to maintain security.
            </p>
            
            <div className={styles.inputGroup} style={{ marginBottom: '15px' }}>
              <label>Discord Webhook URL (For Notifications)</label>
              <input type="text" name="discordWebhookUrl" value={config.discordWebhookUrl || ''} onChange={handleChange} placeholder="https://discord.com/api/webhooks/..." />
            </div>
            
            <div className={styles.inputGroup} style={{ marginBottom: '20px' }}>
              <label>Auto-Rotate Frequency</label>
              <select name="rotationFrequency" value={config.rotationFrequency || '0'} onChange={handleChange} style={{ width: '100%', padding: '10px', borderRadius: '4px', background: '#111', color: '#fff', border: '1px solid #333' }}>
                <option value="0">Off (Manual Only)</option>
                <option value="12">Every 12 Hours</option>
                <option value="24">Every 24 Hours</option>
                <option value="48">Every 48 Hours</option>
                <option value="72">Every 72 Hours</option>
              </select>
            </div>

            <button 
              className={styles.button} 
              onClick={handleRotate} 
              disabled={isRotating}
              style={{ background: '#eab308', color: '#000', fontWeight: 'bold' }}
            >
              {isRotating ? 'Rotating...' : 'Rotate Broadcast Password Now'}
            </button>

            {newPassword && (
              <div style={{ marginTop: '20px', padding: '15px', background: '#222', borderRadius: '8px', border: '1px solid #444' }}>
                <div style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '5px' }}>New Password:</div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <code style={{ fontSize: '1.2rem', color: '#4ade80', flex: 1, wordBreak: 'break-all' }}>{newPassword}</code>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(newPassword);
                      alert('Copied to clipboard!');
                    }}
                    style={{ padding: '8px 12px', background: '#333', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitle}>Dynamic Show Branding (Overrides)</div>
          </div>
          <div className={styles.cardBody}>
            <p style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '15px' }}>
              Override the live metadata and album art when these shows are active on the Google Calendar.
            </p>
            
            {(config.brandedShows || []).map((show, idx) => (
              <div key={idx} style={{ marginBottom: '20px', padding: '15px', background: '#1a1a1a', borderRadius: '8px', border: '1px solid #333' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <h4 style={{ margin: 0, color: '#eab308' }}>Show #{idx + 1}</h4>
                  <button type="button" onClick={() => handleRemoveBrandedShow(idx)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer' }}>Remove</button>
                </div>
                <div className={styles.inputGroup} style={{ marginBottom: '10px' }}>
                  <label>Primary Show Name (Display Title)</label>
                  <input type="text" value={show.primaryName} onChange={(e) => handleBrandedShowChange(idx, 'primaryName', e.target.value)} placeholder="e.g. Late Nights with John" />
                </div>
                <div className={styles.inputGroup} style={{ marginBottom: '10px' }}>
                  <label>Calendar Matchers (Comma separated, * wildcard supported)</label>
                  <input type="text" value={show.matchers} onChange={(e) => handleBrandedShowChange(idx, 'matchers', e.target.value)} placeholder="e.g. Late Nights With John*, Euno | Late Nights" />
                </div>
                <div className={styles.inputGroup}>
                  <label>Show Logo Image URL</label>
                  <input type="text" value={show.logoUrl} onChange={(e) => handleBrandedShowChange(idx, 'logoUrl', e.target.value)} placeholder="https://imgur.com/..." />
                </div>
              </div>
            ))}

            <button type="button" onClick={handleAddBrandedShow} className={styles.button} style={{ background: '#333', color: '#fff', marginTop: '10px' }}>
              + Add Branded Show
            </button>
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
