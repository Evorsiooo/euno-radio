import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const CONFIG_PATH = path.join(process.cwd(), 'data', 'config.json');

export const dynamic = 'force-dynamic';

// Helper to read config
function readConfig() {
  try {
    const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading config:", error);
    return {};
  }
}

// Helper to write config
function writeConfig(data) {
  try {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error("Error writing config:", error);
    return false;
  }
}

// Check if token is valid
function isAuthorized(request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return false;
  const token = authHeader.replace('Bearer ', '');
  return token === process.env.ADMIN_TOKEN;
}

export async function GET(request) {
  const config = readConfig();
  const authorized = isAuthorized(request);

  if (authorized) {
    // Return full config to admin
    return NextResponse.json(config);
  } else {
    // Return only public config to frontend
    const publicConfig = {
      streamUrl: config.streamUrl,
      icecastMount: config.icecastMount,
      discordBotLink: config.discordBotLink,
      discordServerLink: config.discordServerLink,
      bentoButtonLink: config.bentoButtonLink,
      discordBotCommand: config.discordBotCommand || '/setup',
      bufferTime: config.bufferTime || 4,
      rotationFrequency: config.rotationFrequency || '0',
      rotationTimeUtc: config.rotationTimeUtc || '00:00',
      brandedShows: config.brandedShows || []
    };
    return NextResponse.json(publicConfig);
  }
}

export async function POST(request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const currentConfig = readConfig();
    const newConfig = { ...currentConfig, ...body };
    
    const success = writeConfig(newConfig);
    if (success) {
      return NextResponse.json({ success: true, config: newConfig });
    } else {
      return NextResponse.json({ error: 'Failed to write config' }, { status: 500 });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
