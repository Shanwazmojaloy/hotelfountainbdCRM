'use client';

// =============================================================================
// LUMEA — /churn route. Surfaces the churn predictor's output.
// Reads public.account_churn_profile (RLS tenant-scoped) embedding b2b_partners.
// Linked from the CRM sidebar (NAV_ITEMS -> window.location.href = '/churn').
// =============================================================================

import React from 'react';
import Link from 'next/link';
import { getSupabaseClient } from '../../src/lib/supabase/client';
import ChurnRiskPanel from '../components/ChurnRiskPanel';

export default function ChurnPage() {
  const supabase = React.useMemo(() => {
    try { return getSupabaseClient(); } catch { return null; }
  }, []);

  return (
    <main style={{ minHeight: '100vh', background: '#FBF9F4', padding: '2rem' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <Link href="/crm" style={{
          fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
          fontSize: 12, color: '#8A847A', textDecoration: 'none',
        }}>← Back to CRM</Link>
        <div style={{ height: 16 }} />
        <ChurnRiskPanel supabase={supabase} />
      </div>
    </main>
  );
}
