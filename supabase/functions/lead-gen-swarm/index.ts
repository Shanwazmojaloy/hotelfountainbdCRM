import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ===========================================================================
// RETIRED 2026-08-08 (owner instruction). Tombstone — this function is dead.
//
// The previous implementation (v29, unchanged since 2026-03-23) asked Gemini
// to "find 5 realistic corporate leads" and inserted the FABRICATED contacts
// into public.swarm_leads. Because the `swarm_lead_autopromote` trigger
// promotes approved swarm_leads into corporate_leads, and outreach-bot emails
// corporate_leads, running it would send real cold email to invented
// addresses. No pg_cron job ever invoked it; real leads never came from it.
//
// Original source archived at:
//   outputs/lead-gen-swarm_v29_ARCHIVED_2026-08-08.ts
// To restore, redeploy that file with verify_jwt=false.
//
// verify_jwt is now TRUE (was false), so unauthenticated calls are rejected
// before this handler is even reached.
// ===========================================================================

Deno.serve(() =>
  new Response(
    JSON.stringify({
      error: "gone",
      function: "lead-gen-swarm",
      retired_on: "2026-08-08",
      reason: "Retired: generated fabricated leads via LLM and inserted them into swarm_leads, which auto-promote into the live outreach queue.",
      archived_source: "outputs/lead-gen-swarm_v29_ARCHIVED_2026-08-08.ts",
    }),
    { status: 410, headers: { "Content-Type": "application/json" } },
  )
);
