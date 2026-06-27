'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './page.module.css';

// SVG Icons
const PlayIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
);
const PauseIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
);
const LoadingIcon = () => (
  <svg className={styles.spinner} width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
);
const ArrowDown = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
);

export default function Home() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [bufferCountdown, setBufferCountdown] = useState(0);
  const [volume, setVolume] = useState(1);
  const [historyIndex, setHistoryIndex] = useState(0);
  const audioRef = useRef(null);
  const isPlayingRef = useRef(false);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);
  
  
  // For detecting mini player window
  const [isMini, setIsMini] = useState(false);

  const [icecastData, setIcecastData] = useState({
    currentTrack: { title: 'Loading...', artist: 'Please wait', coverArt: '/default-album-art.svg' },
    history: []
  });
  
  const [calendarData, setCalendarData] = useState({ currentShow: null, nextShow: null });
  const [publicConfig, setPublicConfig] = useState({ streamUrl: '', discordBotLink: '#', discordServerLink: '#', bentoButtonLink: '#', discordBotCommand: '/setup' });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Check if we are running in the popup window by checking if window has an opener AND matches standard popup sizes
    // Just measuring window size allows extreme resizability testing in regular browser.
    // If the user explicitly wants a popup, we check window.opener.
    if (window.opener || (window.innerWidth < 500 && window.innerHeight < 500)) {
      setIsMini(true);
    }

    fetch('/api/config', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => setPublicConfig(data))
      .catch(console.error);
  }, []);

  const effectiveTrack = useMemo(() => {
    let track = { ...icecastData.currentTrack };
    if (calendarData.currentShow && publicConfig.brandedShows) {
      const showName = calendarData.currentShow.name.trim().toLowerCase();
      for (const brandedShow of publicConfig.brandedShows) {
        if (!brandedShow.matchers) continue;
        const matchers = brandedShow.matchers.split('\n').map(s => s.trim().toLowerCase()).filter(s => s);
        let matched = false;
        for (const matcher of matchers) {
          if (matcher.endsWith('*')) {
            const prefix = matcher.slice(0, -1);
            if (showName.startsWith(prefix) || showName.includes(prefix)) {
              matched = true;
              break;
            }
          } else if (showName === matcher || showName.includes(matcher)) {
            matched = true;
            break;
          }
        }
        if (matched) {
          track = {
            ...track,
            title: brandedShow.primaryName,
            artist: "Live Broadcast",
            coverArt: brandedShow.logoUrl || track.coverArt
          };
          break;
        }
      }
    }
    return track;
  }, [icecastData.currentTrack, calendarData.currentShow, publicConfig.brandedShows]);

  // Update document title dynamically
  useEffect(() => {
    if (effectiveTrack.title !== 'Loading...' && effectiveTrack.title !== 'Offline') {
      document.title = `${effectiveTrack.title} - ${effectiveTrack.artist}`;
    } else {
      document.title = 'Euno Sonaris';
    }
  }, [effectiveTrack]);

  useEffect(() => {
    if (publicConfig.streamUrl) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(publicConfig.streamUrl);
      audio.volume = volume;
      
      const handleErrorOrDrop = () => {
        if (!isPlayingRef.current) {
          setIsLoading(false);
          return;
        }
        setIsReloading(true);
        setIsLoading(true);
        setTimeout(() => {
          if (audioRef.current && isPlayingRef.current) {
            const timestamp = new Date().getTime();
            const baseUrl = publicConfig.streamUrl.split('?')[0];
            audioRef.current.src = `${baseUrl}?t=${timestamp}`;
            audioRef.current.load();
            audioRef.current.play().catch(err => {
              console.error("Auto-reconnect failed", err);
              setIsPlaying(false);
              setIsLoading(false);
              setIsReloading(false);
            }).then(() => {
              setIsReloading(false);
            });
          } else {
             setIsReloading(false);
             setIsLoading(false);
          }
        }, 2500);
      };

      audio.addEventListener('waiting', () => setIsLoading(true));
      audio.addEventListener('playing', () => { setIsLoading(false); setIsReloading(false); });
      audio.addEventListener('pause', () => setIsLoading(false));
      audio.addEventListener('error', handleErrorOrDrop);
      audio.addEventListener('ended', handleErrorOrDrop);
      
      audioRef.current = audio;
    }
  }, [publicConfig.streamUrl]);

  useEffect(() => {
    let timer;
    if (isLoading) {
      setBufferCountdown((publicConfig.bufferTime || 4) * 10);
      timer = setInterval(() => {
        setBufferCountdown(prev => prev > 0 ? prev - 1 : 0);
      }, 100);
    } else {
      setBufferCountdown(0);
    }
    return () => clearInterval(timer);
  }, [isLoading, publicConfig.bufferTime]);

  useEffect(() => {
    const fetchIcecast = async () => {
      try {
        const res = await fetch('/api/icecast');
        const data = await res.json();
        if (data.status === 'online' || data.status === 'offline') {
          setIcecastData({
            currentTrack: data.currentTrack,
            history: data.history || []
          });
        }
      } catch (err) {}
    };

    const fetchCalendar = async () => {
      try {
        const res = await fetch('/api/calendar');
        const data = await res.json();
        setCalendarData(data);
      } catch (err) {}
    };

    fetchIcecast();
    fetchCalendar();

    const icecastInterval = setInterval(fetchIcecast, 10000);
    const calendarInterval = setInterval(fetchCalendar, 60000);

    return () => {
      clearInterval(icecastInterval);
      clearInterval(calendarInterval);
    };
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      setIsLoading(true);
      audioRef.current.load();
      audioRef.current.play()
        .then(() => setIsPlaying(true))
        .catch(err => {
          console.error(err);
          setIsLoading(false);
          setIsPlaying(false);
        });
    }
  };

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (audioRef.current) {
      audioRef.current.volume = val;
    }
  };

  const formatTime = (isoString) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    if (d.toDateString() === today.toDateString()) {
      return timeStr;
    } else if (d.toDateString() === tomorrow.toDateString()) {
      return `Tomorrow at ${timeStr}`;
    } else {
      return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${timeStr}`;
    }
  };

  const copyCommand = () => {
    navigator.clipboard.writeText(publicConfig.discordBotCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openMiniPlayer = () => {
    // Open the current URL with a query param or just small dimensions
    window.open(window.location.href, 'MiniPlayer', 'width=350,height=450,menubar=no,toolbar=no,location=no,status=no,resizable=yes');
  };

  const handleHistoryUp = () => {
    if (icecastData.history && historyIndex > 0) {
      setHistoryIndex(prev => prev - 1);
    }
  };

  const handleHistoryDown = () => {
    if (icecastData.history && historyIndex < icecastData.history.length - 1) {
      setHistoryIndex(prev => prev + 1);
    }
  };

  if (isMini) {
    return (
      <main className={styles.main}>
        <div className={styles.miniContainer}>
          <AnimatePresence mode="popLayout">
            <motion.div 
              key={effectiveTrack.coverArt}
              initial={{ opacity: 0, x: -30, filter: 'blur(5px)' }}
              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, x: 30, filter: 'blur(5px)' }}
              transition={{ duration: 0.6, ease: "easeInOut" }}
              className={styles.miniArtWrapper}
            >
              <img 
                src={effectiveTrack.coverArt || '/default-album-art.svg'} 
                alt="Album Art" 
                className={styles.miniArt} 
              />
            </motion.div>
          </AnimatePresence>
          <div className={styles.miniInfo}>
            <AnimatePresence mode="popLayout">
              <motion.div 
                key={effectiveTrack.title} 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
                className={styles.miniTitle}
              >
                {effectiveTrack.title}
              </motion.div>
            </AnimatePresence>
            <AnimatePresence mode="popLayout">
              <motion.div 
                key={effectiveTrack.artist} 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
                className={styles.miniArtist}
              >
                {effectiveTrack.artist}
              </motion.div>
            </AnimatePresence>
          </div>
          <div className={styles.controls} style={{ justifyContent: 'center' }}>
            <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
              <button onClick={togglePlay} className={styles.playBtn}>
                {isLoading ? <LoadingIcon /> : (isPlaying ? <PauseIcon /> : <PlayIcon />)}
              </button>
              <AnimatePresence>
                {isLoading && (
                  <motion.div 
                    initial={{ opacity: 0, y: -5 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    exit={{ opacity: 0, y: 5 }} 
                    className={styles.bufferingText}
                  >
                    {isReloading ? 'Reloading...' : `Buffering... ${bufferCountdown > 0 ? `[${(bufferCountdown / 10).toFixed(1)}s]` : ''}`}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <input 
              type="range" 
              min="0" max="1" step="0.01" 
              value={volume} 
              onChange={handleVolumeChange} 
              className={styles.volumeSlider}
            />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      {/* SECTION 1: Radio Player */}
      <section className={styles.section}>
        <div className={styles.radioContainer}>
          
          {/* Left: Album Art & Controls */}
          <div className={styles.albumSide}>
            <AnimatePresence mode="popLayout">
              <motion.div 
                key={effectiveTrack.coverArt}
                initial={{ opacity: 0, x: -30, filter: 'blur(5px)' }}
                animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, x: 30, filter: 'blur(5px)' }}
                transition={{ duration: 0.6, ease: "easeInOut" }}
                className={styles.albumArtWrapper}
              >
                <img 
                  src={effectiveTrack.coverArt || '/default-album-art.svg'} 
                  alt="Album Art" 
                  className={styles.albumArt} 
                />
              </motion.div>
            </AnimatePresence>
            
            <div className={styles.controls}>
              <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                <button onClick={togglePlay} className={styles.playBtn}>
                  {isLoading ? <LoadingIcon /> : (isPlaying ? <PauseIcon /> : <PlayIcon />)}
                </button>
                <AnimatePresence>
                  {isLoading && (
                    <motion.div 
                      initial={{ opacity: 0, y: -5 }} 
                      animate={{ opacity: 1, y: 0 }} 
                      exit={{ opacity: 0, y: 5 }} 
                      className={styles.bufferingText}
                    >
                      {isReloading ? 'Reloading...' : `Buffering... ${bufferCountdown > 0 ? `[${(bufferCountdown / 10).toFixed(1)}s]` : ''}`}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <input 
                type="range" 
                min="0" max="1" step="0.01" 
                value={volume} 
                onChange={handleVolumeChange} 
                className={styles.volumeSlider}
              />
            </div>
          </div>

          {/* Right: Info & History & Calendar */}
          <div className={styles.infoSide}>
            <div className={styles.headerRow}>
              <div className={styles.tunedTo}>EUNO SONARIS</div>
              <button onClick={openMiniPlayer} className={styles.popupButton}>Pop-out Player</button>
            </div>
            
            <AnimatePresence mode="popLayout">
              <motion.div 
                key={effectiveTrack.title} 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
                className={styles.songTitle}
              >
                {effectiveTrack.title}
              </motion.div>
            </AnimatePresence>
            <AnimatePresence mode="popLayout">
              <motion.div 
                key={effectiveTrack.artist} 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
                className={styles.artistName}
              >
                {effectiveTrack.artist}
              </motion.div>
            </AnimatePresence>

            <div className={styles.historyHeader}>
              HISTORY
            </div>
            
            <div className={styles.historyContainer}>
              <div className={styles.historyArrowStack}>
                <button onClick={handleHistoryUp} disabled={historyIndex === 0} className={styles.historyArrow}>
                  ▲
                </button>
                <button onClick={handleHistoryDown} disabled={!icecastData.history || historyIndex >= icecastData.history.length - 1} className={styles.historyArrow}>
                  ▼
                </button>
              </div>
              
              <div className={styles.historyList}>
                {icecastData.history && icecastData.history.length > 0 ? (
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={historyIndex}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.3 }}
                      className={styles.historyItem}
                    >
                      <img src={icecastData.history[historyIndex].coverArt || '/default-album-art.svg'} alt="" className={styles.historyArt} />
                      <div className={styles.historyInfo}>
                        <div className={styles.historyTitle}>{icecastData.history[historyIndex].title}</div>
                        <div className={styles.historyArtist}>{icecastData.history[historyIndex].artist}</div>
                      </div>
                    </motion.div>
                  </AnimatePresence>
                ) : (
                  <div className={styles.historyItem}>
                    <div className={styles.historyInfo}>No history yet</div>
                  </div>
                )}
              </div>
            </div>

            {/* Calendar Widget */}
            <div className={styles.calendarWrapper}>
              <div className={styles.calendarTitle}>SCHEDULE</div>
              
              {calendarData.currentShow ? (
                <div className={styles.showRow}>
                  <div className={styles.showInfo}>
                    <div className={styles.showLabel}>ON AIR NOW</div>
                    <div className={styles.showName}>
                      {calendarData.currentShow.name}
                      {calendarData.currentShow.tag && (
                        <span style={{ fontSize: '0.65rem', padding: '2px 6px', background: calendarData.currentShow.tag === 'Live Broadcast' ? '#eab308' : '#333', color: calendarData.currentShow.tag === 'Live Broadcast' ? '#000' : '#aaa', borderRadius: '4px', marginLeft: '8px', verticalAlign: 'middle', fontWeight: 'bold' }}>
                          {calendarData.currentShow.tag === 'Live Broadcast' ? 'LIVE' : calendarData.currentShow.tag.toUpperCase()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={styles.showTime}>
                    {formatTime(calendarData.currentShow.start)} - {formatTime(calendarData.currentShow.end)}
                  </div>
                </div>
              ) : (
                <div className={styles.showRow}>
                  <div className={styles.showInfo}>
                    <div className={styles.showLabel}>ON AIR NOW</div>
                    <div className={styles.showName}>Auto DJ</div>
                  </div>
                </div>
              )}

              {calendarData.nextShow && (
                <div className={styles.showRow}>
                  <div className={styles.showInfo}>
                    <div className={styles.showLabel}>UP NEXT</div>
                    <div className={styles.showName}>
                      {calendarData.nextShow.name}
                      {calendarData.nextShow.tag && (
                        <span style={{ fontSize: '0.65rem', padding: '2px 6px', background: calendarData.nextShow.tag === 'Live Broadcast' ? '#eab308' : '#333', color: calendarData.nextShow.tag === 'Live Broadcast' ? '#000' : '#aaa', borderRadius: '4px', marginLeft: '8px', verticalAlign: 'middle', fontWeight: 'bold' }}>
                          {calendarData.nextShow.tag === 'Live Broadcast' ? 'LIVE' : calendarData.nextShow.tag.toUpperCase()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={styles.showTime}>
                    Starts {formatTime(calendarData.nextShow.start)}
                  </div>
                </div>
              )}

              {calendarData.metrics && (
                <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #333', display: 'flex', gap: '20px', fontSize: '0.8rem', color: '#888' }}>
                  <div>
                    <strong style={{ color: '#fff', fontSize: '1.1rem' }}>{calendarData.metrics.liveCount}</strong>
                    <div style={{ textTransform: 'uppercase', fontSize: '0.65rem', marginTop: '2px' }}>Live Shows (30 Days)</div>
                  </div>
                  <div>
                    <strong style={{ color: '#fff', fontSize: '1.1rem' }}>{calendarData.metrics.automatedCount}</strong>
                    <div style={{ textTransform: 'uppercase', fontSize: '0.65rem', marginTop: '2px' }}>Automated (30 Days)</div>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        <div className={styles.scrollPrompt}>
          <ArrowDown />
        </div>
      </section>

      {/* SECTION 2: Bento Grid */}
      <section className={styles.section}>
        <div className={styles.bentoGrid}>
          
          <div className={`${styles.bentoCard} ${styles.topLeft}`}>
            <h2>Discord Bot Setup</h2>
            <p>
              Invite the Jockie Music Discord Bot to listen to Euno Sonaris straight from your voice channels! Just click the button below to invite it, then use this command in your server to play the radio in the voice channel you are in.
            </p>
            <div className={styles.copyBox} onClick={copyCommand}>
              <code>{publicConfig.discordBotCommand}</code>
              <span>{copied ? 'Copied!' : 'Copy'}</span>
            </div>
          </div>

          <a href={publicConfig.discordBotLink} target="_blank" rel="noreferrer" className={`${styles.bentoCard} ${styles.bottomLeft}`}>
            <h2>Invite Bot</h2>
            <p>Add the radio bot to your Discord server</p>
          </a>

          <a href={publicConfig.discordServerLink} target="_blank" rel="noreferrer" className={`${styles.bentoCard} ${styles.rightHalf}`}>
            <h1>Join our Discord</h1>
            <p>Connect with the community, request songs, and chat live.</p>
          </a>

        </div>
      </section>
    </main>
  );
}
