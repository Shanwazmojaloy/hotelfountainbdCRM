---
name: hotel-reels-design
description: Hotel Fountain's short-form video doctrine — Reels/TikTok/Shorts hook anatomy, pacing, the four reel blueprints, 9:16 technical specs, and the local-asset → Higgsfield I2V pipeline. Use whenever conceptualizing, generating, or reviewing video/reel content for Hotel Fountain, or when dispatching video-generation jobs from the asset library.
---

# Hotel Social Media Reels & Promotional Video Ads

Owner-supplied doctrine (2026-07-05). Core philosophy: video pacing is a different
discipline from static design — the first 3 seconds decide everything; blend lifestyle
entertainment with metric-driven promotional intent.

## House reconciliation (overrides where the doctrine conflicts)

- **Palette**: the doctrine's "Premium Gold and Deep Teal" style reference is superseded
  by the owner-locked master palette — deep walnut/charcoal + Premium Gold #D4AF37 +
  ivory; warm amber/terracotta accents for F&B/rooftop content. **No teal.**
- **Trend research**: Virlo is already wired (authenticated connector; first niche orbit
  `7d9c945f-…` holds Bangladesh hotel/travel analysis; re-run keyword searches ~$0.50).
  Use its outlier/trend data to pick reel formats before generating.
- **Asset source**: `F:\Hotel Fountain\Picture\Room\Edited\` (also holds one real .mp4).
  Curated stills are uploaded to the public `crm-assets/marketing/` bucket. Skip
  watermarked shots (Executive King has a burned-in phone watermark).
- **Working files**: job configs (`higgsfield_reel_job.json`) go to the session scratchpad,
  never the repo root (house rule).
- **Session tool reality (checked 2026-07-05)**: this environment's Higgsfield connector
  exposes `shorts_studio_*` only — it RESTYLES an already-uploaded 4–120s source video
  into 720p 9:16 clips (preset-based). True Image-to-Video (Seedance) and media upload
  are NOT exposed here; dispatching I2V requires the Higgsfield app/claude.ai Apps UI or
  an upgraded connector. Compile the job config regardless and hand off.

## The high-conversion reel timeline (15s)

| 0:00–0:03 — HOOK | 0:03–0:13 — RETENTION | 0:13–0:15 — INVISIBLE CTA |
|---|---|---|
| High-motion opener (door push revealing room, macro dining shot) + contextual text overlay ("POV: you checked into the closest premium oasis to the airport") | Rapid cuts 1.0–2.5s each, transitions synced to audio beats (pick trending sounds via Virlo) | On-screen text only, soft-sell: "Save this for your next transit stay" / "Link in bio — direct corporate rates" |

## Four reel blueprints

1. **Experiential space tour** — rooms in ACTIVE use (guest opens curtains to skyline,
   laptop lands on the work desk); never lifeless empty-room pans.
2. **Sensory ASMR / vibe check** — pure spatial soundscapes (sheet rustle, espresso pour,
   rain on glass); no voiceover.
3. **Authentic BTS** — kitchen plating a signature dish, front desk executing a crisp
   corporate check-in.
4. **Hyper-local area guide** — quick listicles ("3 hidden dining gems within 5 minutes
   of our lobby"); the hotel as the transit-convenience authority.

## Technical specs

- Native 9:16, 1080×1920. Master at highest available quality, export high-bitrate 1080p
  (platforms recompress). Note: shorts_studio outputs 720p — acceptable for restyles,
  not for hero campaign reels.
- Warm golden-hour lighting only; gimbal-smooth movement (shaky = budget-tier perception).
- **Safe zones**: keep text/subjects out of the bottom ~20% (caption zone) and right ~15%
  (engagement icon stack).

## I2V motion briefs (by asset category)

- **Room/Suite**: "Cinematic slow-motion pan across a premium hotel suite. Warm gold
  ambient light paths, pristine bedding textures, dark wood workspace. A professional
  traveler walks smoothly into frame and opens a laptop."
- **Lobby**: "Elite real-estate tracking shot across the lobby — polished floor
  reflections, warm premium gold lighting, staff visible at reception."
- **Restaurant/Rooftop**: "Atmospheric slow tracking pan across an elegant dining space
  at twilight. Soft amber table-light reflections, premium gold accents, deep walnut
  shadows." (teal removed per palette lock)
- Camera: 35mm architectural wide, dolly tracking; strict parity on lighting, geometry,
  and any text layers.

## Caption package rule

Every rendered reel ships with an FB + IG caption pack referencing direct-booking value
(25+ Mbps WiFi, 3.2 km / ~10 min from HSIA, ৳4,000–4,500 tiers, WhatsApp 01322 840 799)
— synchronized to the footage (rooftop = evening vibes, room = workspace/rest, F&B =
appetite). Everything flows through the Studio approval gate before posting.
