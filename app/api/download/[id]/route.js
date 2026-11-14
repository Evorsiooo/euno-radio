import { NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/auth';
import { cancelJob, getJob } from '@/lib/radio/jobs';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };
const notFound = () => new NextResponse(null, { status: 404 });

/** The job with every song's state, metadata and review candidates. */
export async function GET(request, { params }) {
  if (!isAuthorized(request)) return notFound();
  const { id } = await params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: 'No such job' }, { status: 404, headers: noStore });
  return NextResponse.json({ job }, { headers: noStore });
}

/** Cancels the songs not started yet; the song in progress finishes. */
export async function DELETE(request, { params }) {
  if (!isAuthorized(request)) return notFound();
  const { id } = await params;
  const job = cancelJob(id);
  if (!job) return NextResponse.json({ error: 'No such job' }, { status: 404, headers: noStore });
  return NextResponse.json({ job }, { headers: noStore });
}
