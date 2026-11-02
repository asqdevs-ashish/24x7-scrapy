// Starts the scraper workflow immediately via the GitHub REST API
// (workflow_dispatch), instead of waiting for the next 3-hour cron tick.
//
// Env:
//   GITHUB_PAT        fine-grained token, this repo only, "Actions: Read and write"
//   GITHUB_REPO       "owner/name"
//   GITHUB_WORKFLOW   workflow file name (default "scraper.yml")
//   GITHUB_REF        branch to run on (default "main")
//   GITHUB_API_URL    default "https://api.github.com" (set for GitHub Enterprise)

export type TriggerResult =
  | { ok: true }
  | { ok: false; configured: boolean; error: string };

const REPO_PATTERN = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;
const WORKFLOW_PATTERN = /^[A-Za-z0-9._-]+\.ya?ml$/;

export async function triggerWorkerRun({ maxJobs, reason }: { maxJobs: number; reason: string }): Promise<TriggerResult> {
  const token = process.env.GITHUB_PAT;
  const repo = process.env.GITHUB_REPO;
  const workflow = process.env.GITHUB_WORKFLOW || 'scraper.yml';
  const ref = process.env.GITHUB_REF || 'main';
  const apiBase = (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/+$/, '');

  if (!token || !repo) {
    return { ok: false, configured: false, error: 'GITHUB_PAT / GITHUB_REPO are not set' };
  }
  if (!REPO_PATTERN.test(repo) || !WORKFLOW_PATTERN.test(workflow)) {
    return { ok: false, configured: false, error: 'GITHUB_REPO or GITHUB_WORKFLOW is malformed' };
  }

  try {
    const res = await fetch(`${apiBase}/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'realtor-leads-dashboard',
      },
      body: JSON.stringify({
        ref,
        inputs: { max_jobs: String(Math.min(Math.max(maxJobs, 1), 5)), reason: reason.slice(0, 100) },
      }),
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });

    if (res.status === 204) return { ok: true };

    const body = await res.text().catch(() => '');
    let message = body.slice(0, 200);
    try {
      message = (JSON.parse(body) as { message?: string }).message ?? message;
    } catch {
      /* not JSON */
    }
    return { ok: false, configured: true, error: `GitHub API ${res.status}: ${message}` };
  } catch (error) {
    return { ok: false, configured: true, error: `GitHub API unreachable: ${(error as Error).message}` };
  }
}
