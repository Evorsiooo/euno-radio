// Resume download jobs a restart interrupted, without waiting for the next request.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { resumeJobs } = await import('./lib/radio/jobs');
    resumeJobs();
  }
}
