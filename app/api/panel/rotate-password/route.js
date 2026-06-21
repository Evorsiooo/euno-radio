import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import path from 'path';

const execPromise = util.promisify(exec);
const CONFIG_PATH = path.join(process.cwd(), 'data', 'config.json');

function readConfig() {
  try {
    const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

function isAuthorized(request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log("[Rotate-Password] Auth failed: Missing or invalid Authorization header.", authHeader);
    return false;
  }
  const token = authHeader.substring(7);
  
  const expectedToken = process.env.ADMIN_TOKEN;
  if (!expectedToken) {
    console.log("[Rotate-Password] Auth bypass: ADMIN_TOKEN is not set in environment.");
    return true;
  }
  
  if (token !== expectedToken) {
    console.log(`[Rotate-Password] Auth failed: Token mismatch. Expected: '${expectedToken}', Got: '${token}'`);
    return false;
  }
  
  return true;
}

export async function POST(request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Execute the bash script
    const { stdout, stderr } = await execPromise('/usr/local/bin/rotate_radio_pass.sh');
    const newPassword = stdout.trim();

    if (!newPassword) {
      throw new Error('Script executed but returned empty password.');
    }

    // Send Discord Webhook if configured
    const config = readConfig();
    if (config.discordWebhookUrl) {
      try {
        await fetch(config.discordWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: `🚨 **Broadcast Password Rotated** \nThe new OBS source password is: \`${newPassword}\``
          })
        });
      } catch (webhookErr) {
        console.error("Failed to send discord webhook:", webhookErr);
      }
    }

    return NextResponse.json({ success: true, newPassword });
  } catch (error) {
    console.error("Password rotation failed:", error);
    return NextResponse.json({ error: 'Rotation failed', details: error.message }, { status: 500 });
  }
}
