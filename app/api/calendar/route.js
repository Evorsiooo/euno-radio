import { NextResponse } from 'next/server';

const CALENDAR_ID = '8f04b7a541d330edc44e74ae3643405dc1c8b2a57a11d49b05574907ff2aec2a@group.calendar.google.com';
const API_KEY = 'AIzaSyB7YmB7mdVrKHgb25InRvS19O1sZDyROvU';

export async function GET() {
  try {
    // We want events from right now to the future
    const timeMin = new Date().toISOString();
    
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events?key=${API_KEY}&timeMin=${timeMin}&singleEvents=true&orderBy=startTime&maxResults=5`;

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

    const now = new Date();
    let currentShow = null;
    let nextShow = null;

    // Find current and next show
    for (const event of events) {
      const start = new Date(event.start.dateTime || event.start.date);
      const end = new Date(event.end.dateTime || event.end.date);

      if (start <= now && end > now) {
        currentShow = {
          name: event.summary,
          start: start.toISOString(),
          end: end.toISOString()
        };
      } else if (start > now && !nextShow) {
        nextShow = {
          name: event.summary,
          start: start.toISOString(),
          end: end.toISOString()
        };
      }
      
      // If we found both, we can stop iterating
      if (currentShow && nextShow) break;
    }

    return NextResponse.json({ currentShow, nextShow });

  } catch (error) {
    console.error("Calendar proxy error:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
