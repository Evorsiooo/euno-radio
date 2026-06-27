import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { fetchAlbumArt } from '@/utils/albumArt';
const CONFIG_PATH = path.join(process.cwd(), 'data', 'config.json');

export const dynamic = 'force-dynamic';

function readConfig() {
  try {
    const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

// Global history array to keep track of recent songs
// (Since Icecast status-json usually only gives the current song, we must build the history ourselves)
let trackHistory = [];

export async function GET() {
  const config = readConfig();
  
  if (!config.icecastAdminUrl || !config.icecastUsername || !config.icecastPassword) {
    return NextResponse.json({ error: 'Icecast not configured' }, { status: 500 });
  }

  // Determine the mount point from the config, or fallback to stream URL, or /radio
  let targetMount = config.icecastMount || '/radio';
  if (!config.icecastMount && config.streamUrl) {
    try {
      const urlObj = new URL(config.streamUrl);
      targetMount = urlObj.pathname; // e.g. /radio
    } catch(e) {}
  }

  try {
    // Standard Icecast uses /status-json.xsl (no auth needed usually). 
    // Some panels use /admin/stats.json (auth required).
    const endpoints = [
      { url: `${config.icecastAdminUrl}/status-json.xsl`, auth: false },
      { url: `${config.icecastAdminUrl}/admin/stats.json`, auth: true }
    ];
    
    const authString = Buffer.from(`${config.icecastUsername}:${config.icecastPassword}`).toString('base64');
    
    let res = null;
    let data = null;

    for (const ep of endpoints) {
      const headers = {};
      if (ep.auth) headers['Authorization'] = `Basic ${authString}`;
      
      res = await fetch(ep.url, { headers, cache: 'no-store' });
      if (res.ok) {
        data = await res.json();
        break; // found the right endpoint
      }
    }

    if (!res || !res.ok) {
      console.error(`Icecast responded with ${res ? res.status : 'unknown error'} on all endpoints`);
      return NextResponse.json({ status: 'offline', message: 'Stream offline', currentTrack: { title: 'Offline', artist: 'Auto DJ', coverArt: '/default-album-art.svg' }, history: [] });
    }

    let sources = data.icestats.source;
    if (!sources) {
      return NextResponse.json({ status: 'offline', message: 'No sources mounted', currentTrack: { title: 'Offline', artist: 'Auto DJ', coverArt: '/default-album-art.svg' }, history: [] });
    }
    if (!Array.isArray(sources)) {
      sources = [sources]; // Ensure array
    }

    // Find the source matching our mount point
    let source = sources.find(s => s && s.listenurl && s.listenurl.endsWith(targetMount));
    
    // Fallback if exactly matching mount point not found, just take the first valid source
    if (!source) {
      source = sources.find(s => s && s.title);
    }

    if (!source) {
       return NextResponse.json({ status: 'offline', message: 'Stream offline', currentTrack: { title: 'Offline', artist: 'Auto DJ', coverArt: '/default-album-art.svg' }, history: [] });
    }

    let artist = source.artist || 'Unknown Artist';
    let title = source.title || 'Unknown Title';

    // Often icecast bundles artist - title in the 'title' field if 'artist' is missing
    if (artist === 'Unknown Artist' && title !== 'Unknown Title' && title.includes(' - ')) {
      const parts = title.split(' - ');
      artist = parts[0].trim();
      title = parts.slice(1).join(' - ').trim();
    }

    // Decode HTML entities (Icecast often encodes apostrophes and ampersands)
    const decodeHtmlEntities = (str) => {
      if (!str) return str;
      return str.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
                .replace(/&#x([0-9a-f]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
                .replace(/&quot;/g, '"')
                .replace(/&apos;/g, "'")
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>');
    };

    artist = decodeHtmlEntities(artist);
    title = decodeHtmlEntities(title);

    // Fetch album art
    const coverArt = await fetchAlbumArt(artist, title, config);

    const currentTrack = {
      artist,
      title,
      coverArt,
      listeners: source.listeners || 0,
      bitrate: source.bitrate || 128,
      format: source.server_type || 'audio/mpeg'
    };

    // Update history
    if (trackHistory.length === 0 || 
        trackHistory[0].title !== currentTrack.title || 
        trackHistory[0].artist !== currentTrack.artist) {
      
      // Prevent duplicates, unshift new track
      trackHistory.unshift(currentTrack);
      
      // Keep only last 20 tracks
      if (trackHistory.length > 20) {
        trackHistory.pop();
      }
    }

    return NextResponse.json({
      status: 'online',
      currentTrack,
      history: trackHistory.slice(1) // exclude current playing from history array
    });

  } catch (error) {
    console.error("Icecast proxy error:", error.message);
    // If Icecast is offline or unreachable, degrade gracefully
    return NextResponse.json({ status: 'offline', message: 'Stream offline', currentTrack: { title: 'Offline', artist: 'Auto DJ', coverArt: '/default-album-art.svg' }, history: [] });
  }
}
