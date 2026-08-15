import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// SECURITY 2026-08-15: a live token was hardcoded here and is redacted in this repo.
// Rotate it, set the env var in Supabase Edge Function secrets, then redeploy.
const VERCEL_TOKEN = Deno.env.get("VERCEL_TOKEN") ?? "";
const TEAM_ID = "team_l1SAECyZJ9giIw4o2SGxjpqd";

const INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Hotel Fountain</title>
</head>
<body>
  <div id="root"></div>
  <script src="/bundle.js"></script>
</body>
</html>`;

Deno.serve(async (_req: Request) => {
  if (!VERCEL_TOKEN) return new Response(JSON.stringify({ error: "VERCEL_TOKEN is not configured" }), { status: 503, headers: { "Content-Type": "application/json" } });
  try {
    const projRes = await fetch(`https://api.vercel.com/v10/projects?teamId=${TEAM_ID}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${VERCEL_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "hotel-fountain-v4", framework: null }),
    });
    const proj = await projRes.json();
    if (!proj.id) return new Response(JSON.stringify({ step: "project", error: proj }), { status: 500 });

    const deployRes = await fetch(`https://api.vercel.com/v13/deployments?teamId=${TEAM_ID}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${VERCEL_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: proj.name,
        project: proj.id,
        target: "production",
        files: [
          { file: "index.html", data: btoa(INDEX_HTML), encoding: "base64" },
          { file: "bundle.js", data: "BUNDLE_PLACEHOLDER", encoding: "base64" },
        ],
        projectSettings: { framework: null, buildCommand: null, outputDirectory: null },
      }),
    });
    const deploy = await deployRes.json();
    return new Response(JSON.stringify({ projectId: proj.id, projectName: proj.name, deployId: deploy.id, url: deploy.url, state: deploy.readyState }, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
});
