import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const LINKS_PATH = path.join(process.cwd(), 'data', 'links.json');

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { slug } = params;
  
  if (!slug) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  try {
    const data = fs.readFileSync(LINKS_PATH, 'utf-8');
    const parsed = JSON.parse(data);
    const linkIndex = parsed.links.findIndex(l => l.slug === slug);
    
    if (linkIndex === -1) {
      return NextResponse.redirect(new URL('/?error=link_not_found', request.url));
    }
    
    // Increment clicks
    parsed.links[linkIndex].clicks = (parsed.links[linkIndex].clicks || 0) + 1;
    fs.writeFileSync(LINKS_PATH, JSON.stringify(parsed, null, 2), 'utf-8');
    
    // Redirect to target URL
    const targetUrl = parsed.links[linkIndex].url;
    
    // Ensure URL has protocol
    const finalUrl = targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`;
    
    return NextResponse.redirect(finalUrl);
  } catch (error) {
    console.error("Link redirect error:", error);
    return NextResponse.redirect(new URL('/', request.url));
  }
}
