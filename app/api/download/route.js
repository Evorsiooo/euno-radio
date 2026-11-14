import { NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/auth';
import { createJob, listJobs } from '@/lib/radio/jobs';
import { r2Configured } from '@/lib/radio/r2';
import { DENO, YTDLP } from '@/lib/radio/tools';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

// Unauthorised requests get a bare 404, like /api/rotate.
const notFound = () => new NextResponse(null, { status: 404 });

/** Recent jobs (without their song lists) and whether the tools are in place. */
export function GET(request) {
  if (!isAuthorized(request)) return notFound();
  return NextResponse.json(
    { setup: { ytdlp: YTDLP, deno: DENO, r2: r2Configured() }, jobs: listJobs() },
    { headers: noStore },
  );
}

/** { url, meta? } -> 202 { jobId, job } */
export async function POST(request) {
  if (!isAuthorized(request)) return notFound();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Send a JSON body: { "url": "..." }' }, { status: 400, headers: noStore });
  }

  if (!r2Configured()) {
    return NextResponse.json({ error: 'R2 is not configured on the radio server' }, { status: 503, headers: noStore });
  }

  try {
    const job = createJob({ url: body?.url, meta: body?.meta });
    return NextResponse.json({ jobId: job.id, job }, { status: 202, headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400, headers: noStore });
  }
}
