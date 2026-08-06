import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const LINKS_PATH = path.join(process.cwd(), 'data', 'links.json');

export const dynamic = 'force-dynamic';

export async function GET(request, props) {
  const params = await props.params;
  const { slug } = params;
  
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3000';
  const proto = request.headers.get('x-forwarded-proto') || 'http';
  const baseUrl = `${proto}://${host}`;
  
  if (!slug) {
    return NextResponse.redirect(new URL('/', baseUrl));
  }

  try {
    const data = fs.readFileSync(LINKS_PATH, 'utf-8');
    const parsed = JSON.parse(data);
    const linkIndex = parsed.links.findIndex(l => l.slug === slug);
    
    if (linkIndex === -1) {
      return NextResponse.redirect(new URL('/?error=link_not_found', baseUrl));
    }
    
    // Increment clicks and record detailed log
    parsed.links[linkIndex].clicks = (parsed.links[linkIndex].clicks || 0) + 1;
    if (!parsed.links[linkIndex].clickLogs) {
      parsed.links[linkIndex].clickLogs = [];
    }
    
    const ip = request.headers.get('x-forwarded-for') || request.ip || 'Unknown';
    const userAgent = request.headers.get('user-agent') || 'Unknown';
    
    parsed.links[linkIndex].clickLogs.push({
      timestamp: new Date().toISOString(),
      ip: ip.split(',')[0].trim(),
      userAgent
    });
    
    // Keep only last 1000 logs to prevent file from growing indefinitely
    if (parsed.links[linkIndex].clickLogs.length > 1000) {
      parsed.links[linkIndex].clickLogs = parsed.links[linkIndex].clickLogs.slice(-1000);
    }
    
    fs.writeFileSync(LINKS_PATH, JSON.stringify(parsed, null, 2), 'utf-8');
    
    // Redirect to target URL
    const targetUrl = parsed.links[linkIndex].url;
    
    // Ensure URL has protocol
    const finalUrl = targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`;
    
    return NextResponse.redirect(finalUrl);
  } catch (error) {
    console.error("Link redirect error:", error);
    return NextResponse.redirect(new URL('/', baseUrl));
  }
}
