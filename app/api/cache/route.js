import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { clearAlbumArtCache } from '@/utils/albumArt';

const CONFIG_PATH = path.join(process.cwd(), 'data', 'config.json');

function readConfig() {
  try {
    const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

export async function POST(req) {
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.split(' ')[1];
  
  // Basic security check (we reuse the config API's token structure or env token)
  const envToken = process.env.ADMIN_TOKEN || 'admin';
  if (token !== envToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    clearAlbumArtCache();
    return NextResponse.json({ success: true, message: 'Cache cleared successfully' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to clear cache' }, { status: 500 });
  }
}
