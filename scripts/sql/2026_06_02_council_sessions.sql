-- ════════════════════════════════════════════════════════════════════
-- AI ADVISORY BOUNCIL ("Council") — 2026-06-02
-- Multi-agent strategic deliberation tied to Lumea's reservation-centric
-- architecture. RLS by tenant_id. SECURITY INVOKER on the read view.
-- Optional reservation_id FK enables hotel-context injection.
-- ════════════════════════════════════════════════════════════════════

-- ── 1. SESSIONS ──────────────────────────────────────────────────────
create table if not exists public.council_sessions (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  user_id           integer references public.staff(id) on delete set null,  -- staff.id is integer
  reservation_id    uuid references public.reservations(id) on delete set null,
  scope_mode        text not null default 'hotel'
                      check (scope_mode in ('hotel','general')),
  prompt            text not null,
  chairman_verdict  text,
  status            text not null default 'pending'
                      check (status in ('pending','deliberating','complete','failed')),
  total_tokens_in   integer not null default 0,
  total_tokens_out  integer not null default 0,
  total_cost_bdt    numeric(10,2) not null default 0,
  error             text,
  created_at        timestamptz not null default now(),
  completed_at      timestamptz
);

create index if not exists idx_council_sessions_tenant
  on public.council_sessions(tenant_id, created_at desc);
create index if not exists idx_council_sessions_res
  on public.council_sessions(reservation_id) where reservation_id is not null;

-- ── 2. PANELISTS (one row per agent verdict per session) ─────────────
create table if not exists public.council_panelists (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.council_sessions(id) on delete cascade,
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  role              text not null
                      check (role in (
                        'devils_advocate','first_principles','optimist',
                        'rationalist','executor','chairman'
                      )),
  verdict           text not null,
  tokens_in         integer not null default 0,
  tokens_out        integer not null default 0,
  cost_bdt          numeric(10,2) not null default 0,
  latency_ms        integer not null default 0,
  model             text not null default 'claude-sonnet-4-6',
  created_at        timestamptz not null default now(),
  unique(session_id, role)
);

create index if not exists idx_council_panelists_session
  on public.council_panelists(session_id);

-- ── 3. RLS ────────────────────────────────────────────────────────────
alter table public.council_sessions  enable row level security;
alter table public.council_panelists enable row level security;

-- Sessions: tenant isolation (same pattern as transactions/reservations)
drop policy if exists council_sessions_tenant_rw on public.council_sessions;
create policy council_sessions_tenant_rw on public.council_sessions
  for all
  using (tenant_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id')::uuid)
  with check (tenant_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id')::uuid);

drop policy if exists council_panelists_tenant_rw on public.council_panelists;
create policy council_panelists_tenant_rw on public.council_panelists
  for all
  using (tenant_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id')::uuid)
  with check (tenant_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id')::uuid);

-- Service-role bypass (used by /api/council/deliberate edge route)
grant all on public.council_sessions  to service_role;
grant all on public.council_panelists to service_role;
grant select, insert on public.council_sessions  to authenticated;
grant select         on public.council_panelists to authenticated;

-- ── 4. CONVENIENCE VIEW (SECURITY INVOKER per project default) ────────
drop view if exists public.v_council_sessions_with_panel;
create view public.v_council_sessions_with_panel
with (security_invoker = on) as
select
  s.id              as session_id,
  s.tenant_id,
  s.user_id,
  s.reservation_id,
  s.scope_mode,
  s.prompt,
  s.chairman_verdict,
  s.status,
  s.total_tokens_in,
  s.total_tokens_out,
  s.total_cost_bdt,
  s.created_at,
  s.completed_at,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'role',       p.role,
        'verdict',    p.verdict,
        'tokens_in',  p.tokens_in,
        'tokens_out', p.tokens_out,
        'cost_bdt',   p.cost_bdt,
        'latency_ms', p.latency_ms,
        'model',      p.model
      ) order by p.created_at
    ) filter (where p.id is not null),
    '[]'::jsonb
  ) as panelists
from public.council_sessions s
left join public.council_panelists p on p.session_id = s.id
group by s.id;

comment on table public.council_sessions  is
  'AI Advisory Council — top-level deliberation session (one prompt → 5 panelists + Chairman).';
comment on table public.council_panelists is
  'Individual panelist verdicts produced during a council session.';
comment on view  public.v_council_sessions_with_panel is
  'Joined session + panelist array for UI consumption. SECURITY INVOKER.';
