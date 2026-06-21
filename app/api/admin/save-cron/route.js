import { NextResponse } from 'next/server';
import fs from 'fs';

const CRON_FILE_PATH = '/etc/cron.d/radio-pass-cycle';

function isAuthorized(request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.substring(7);
  
  const expectedToken = process.env.ADMIN_TOKEN;
  if (!expectedToken) return true;
  return token === expectedToken;
}

export async function POST(request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { frequency } = await request.json(); // "0", "12", "24", "48", "72"

    // If turned off, remove the cron file
    if (!frequency || frequency === "0") {
      if (fs.existsSync(CRON_FILE_PATH)) {
        fs.unlinkSync(CRON_FILE_PATH);
      }
      return NextResponse.json({ success: true, message: 'Cron removed' });
    }

    // Determine cron expression based on frequency in hours
    let cronExpr = "";
    switch (frequency) {
      case "12": cronExpr = "0 */12 * * *"; break;
      case "24": cronExpr = "0 0 * * *"; break;
      case "48": cronExpr = "0 0 */2 * *"; break;
      case "72": cronExpr = "0 0 */3 * *"; break;
      default:
        return NextResponse.json({ error: 'Invalid frequency' }, { status: 400 });
    }

    // Build the cron line to curl our rotate-password API route securely
    const token = process.env.ADMIN_TOKEN || "";
    // Note: The empty newline at the end is strictly required by cron
    const cronContent = `${cronExpr} root curl -X POST -H "Authorization: Bearer ${token}" http://localhost:3000/api/admin/rotate-password\n`;

    fs.writeFileSync(CRON_FILE_PATH, cronContent, { mode: 0o644 });

    return NextResponse.json({ success: true, message: 'Cron updated', expression: cronExpr });

  } catch (error) {
    console.error("Save cron failed:", error);
    return NextResponse.json({ error: 'Failed to update cron', details: error.message }, { status: 500 });
  }
}
