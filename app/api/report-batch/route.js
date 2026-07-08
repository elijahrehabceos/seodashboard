// Triggers the "Generate monthly reports" GitHub Action for all clients.
// Batch generation (55 clients x Claude calls) would exceed Vercel's
// function time limits, so this routes through GitHub Actions instead,
// which has no such constraint.

export async function POST() {
  const token = process.env.REPORTS_GITHUB_TOKEN;
  if (!token) {
    return Response.json(
      { error: "REPORTS_GITHUB_TOKEN isn't configured in Vercel yet." },
      { status: 501 }
    );
  }

  const res = await fetch(
    "https://api.github.com/repos/elijahrehabceos/seodashboard/actions/workflows/generate-reports.yml/dispatches",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main", inputs: { client_slug: "" } }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    return Response.json({ error: "Failed to trigger batch generation", details: text }, { status: 500 });
  }

  return Response.json({ started: true });
}
