import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const LINKS_PATH = path.join(process.cwd(), 'data', 'links.json');

export const dynamic = 'force-dynamic';

function readLinks() {
  try {
    const data = fs.readFileSync(LINKS_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return { links: [] };
  }
}

function writeLinks(data) {
  try {
    fs.writeFileSync(LINKS_PATH, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    return false;
  }
}

function isAuthorized(req) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.split(' ')[1];
  return token === process.env.ADMIN_TOKEN;
}

export async function GET(req) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const data = readLinks();
  return NextResponse.json(data);
}

export async function POST(req) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { slug, url, notes } = await req.json();
    if (!url) return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    
    const data = readLinks();
    let finalSlug = slug;
    
    // Auto-generate slug if not provided
    if (!finalSlug) {
      finalSlug = Math.random().toString(36).substring(2, 8);
    }
    
    // Check for duplicates
    if (data.links.find(l => l.slug === finalSlug)) {
      return NextResponse.json({ error: 'Slug already exists' }, { status: 400 });
    }
    
    data.links.push({
      slug: finalSlug,
      url,
      notes: notes || '',
      clicks: 0,
      createdAt: new Date().toISOString()
    });
    
    if (writeLinks(data)) {
      return NextResponse.json({ success: true, slug: finalSlug });
    }
    return NextResponse.json({ error: 'Failed to write' }, { status: 500 });
  } catch(err) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
}

export async function DELETE(req) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get('slug');
  
  if (!slug) return NextResponse.json({ error: 'Slug required' }, { status: 400 });
  
  const data = readLinks();
  const initialLength = data.links.length;
  data.links = data.links.filter(l => l.slug !== slug);
  
  if (data.links.length === initialLength) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  
  if (writeLinks(data)) {
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ error: 'Failed to write' }, { status: 500 });
}

export async function PUT(req) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { originalSlug, slug, url, notes } = await req.json();
    if (!originalSlug || !url || !slug) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    
    const data = readLinks();
    
    // Check if new slug conflicts with another link
    if (slug !== originalSlug && data.links.find(l => l.slug === slug)) {
      return NextResponse.json({ error: 'New slug already exists' }, { status: 400 });
    }
    
    const linkIndex = data.links.findIndex(l => l.slug === originalSlug);
    if (linkIndex === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    
    data.links[linkIndex].slug = slug;
    data.links[linkIndex].url = url;
    if (notes !== undefined) data.links[linkIndex].notes = notes;
    
    if (writeLinks(data)) {
      return NextResponse.json({ success: true, slug });
    }
    return NextResponse.json({ error: 'Failed to write' }, { status: 500 });
  } catch(err) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
}

