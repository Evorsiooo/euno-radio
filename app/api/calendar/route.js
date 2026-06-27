import { NextResponse } from 'next/server';

const CALENDAR_ID = '8f04b7a541d330edc44e74ae3643405dc1c8b2a57a11d49b05574907ff2aec2a@group.calendar.google.com';
const API_KEY = 'AIzaSyB7YmB7mdVrKHgb25InRvS19O1sZDyROvU';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // We want events from right now to 30 days in the future
    const now = new Date();
    const timeMin = now.toISOString();
    const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const timeMax = future.toISOString();
    
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events?key=${API_KEY}&timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=250`;

    const res = await fetch(url, { 
      cache: 'no-store',
      headers: {
        'Referer': 'https://euno.cc'
      }
    });
    if (!res.ok) {
      console.error("Calendar API Error:", res.status, await res.text());
      return NextResponse.json({ error: 'Failed to fetch calendar' }, { status: 500 });
    }

    const data = await res.json();
    const events = data.items || [];

    let currentShow = null;
    let nextShow = null;
    let metrics = { liveCount: 0, automatedCount: 0 };

    const parseShow = (summary) => {
      if (!summary) return { name: 'Unknown', tag: 'Live Broadcast' };
      const upper = summary.toUpperCase();
      if (upper.startsWith('SIMULCAST:')) {
        return { name: summary.substring(10).trim(), tag: 'Simulcast' };
      }
      if (upper.startsWith('REBROADCAST:')) {
        return { name: summary.substring(12).trim(), tag: 'Rebroadcast' };
      }
      return { name: summary, tag: 'Live Broadcast' };
    };

    // Find current and next show, and calculate metrics
    for (const event of events) {
      const start = new Date(event.start.dateTime || event.start.date);
      const end = new Date(event.end.dateTime || event.end.date);
      const parsed = parseShow(event.summary);

      // Metrics Calculation
      if (parsed.tag === 'Live Broadcast') {
        metrics.liveCount++;
      } else {
        metrics.automatedCount++;
      }

      // Current/Next Show Logic
      if (start <= now && end > now) {
        currentShow = {
          name: parsed.name,
          tag: parsed.tag,
          start: start.toISOString(),
          end: end.toISOString()
        };
      } else if (start > now && !nextShow) {
        nextShow = {
          name: parsed.name,
          tag: parsed.tag,
          start: start.toISOString(),
          end: end.toISOString()
        };
      }
    }

    return NextResponse.json({ currentShow, nextShow, metrics });

  } catch (error) {
    console.error("Calendar proxy error:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
