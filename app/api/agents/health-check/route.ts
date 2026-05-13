import { NextResponse } from 'next/server'

const CRON_SECRET = process.env.CRON_SECRET

const EXPECTED_AGENTS = [
  'booking-concierge',
  'lead-qualifier',
  'faq-specialist',
  'revenue-manager',
  'automated-marketer',
  'guest-retention',
  'architect',
  'security',
  'coder',
]

export async function GET(req: Request) {
  const auth = req.headers.get('authorization') || ''
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // This endpoint reports which agents are expected and their last-known
  // required status. Ruflo agents are session-based and must be re-spawned
  // from Claude — this route serves as a health dashboard and reminder.
  return NextResponse.json({
    checked_at: new Date().toISOString(),
    expected_agent_count: EXPECTED_AGENTS.length,
    expected_agents: EXPECTED_AGENTS,
    note: 'Ruflo agents are session-scoped. If agents are missing, start a Claude session and run: check agent health from ruflo.config.json',
    ruflo_config: '/ruflo.config.json',
    respawn_command: 'At session start: check mcp__ruflo__agent_list — if count < 9, spawn missing agents from ruflo.config.json',
  })
}
