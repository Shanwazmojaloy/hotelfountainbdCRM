export const dynamic = 'force-dynamic';
import { supabase } from '@/services/supabase';
import Layout from '@/components/Layout';

export const revalidate = 0; // Disable static rendering to ensure fresh leads

type LeadRow = {
  id: string;
  name: string | null;
  company: string | null;
  email: string | null;
  venue_preference: string | null;
  expected_guests: number | null;
};

export default async function LeadsPage() {
  const { data: leads, error } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false });

  return (
    <Layout>
      <h1 className="text-3xl mb-1">CRM Leads Base</h1>
      <p className="iv-stat__sub mb-8">Displaying all organically and artificially prospected leads.</p>

      {error ? (
        <div className="iv-card" style={{ background: '#FBEDE9', borderColor: 'rgba(140,47,29,.25)' }}>
          <h2 className="text-xl mb-2" style={{ color: '#8C2F1D' }}>Error Loading Leads</h2>
          <p style={{ color: '#8C2F1D' }}>{error.message}</p>
        </div>
      ) : (
        <div className="iv-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="iv-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Company</th>
                  <th>Email</th>
                  <th>Venue Preference</th>
                  <th style={{ textAlign: 'right' }}>Expected Guests</th>
                </tr>
              </thead>
              <tbody>
                {leads?.map((lead: LeadRow) => (
                  <tr key={lead.id}>
                    <td style={{ fontWeight: 600 }}>{lead.name}</td>
                    <td>{lead.company || <span style={{ color: '#9A907C' }}>N/A</span>}</td>
                    <td className="iv-mono">{lead.email}</td>
                    <td>
                      <span className="iv-chip" style={{ background: '#FBF4E2', color: '#8A6A1E', borderColor: 'rgba(138,106,30,.2)' }}>
                        {lead.venue_preference || 'TBD'}
                      </span>
                    </td>
                    <td className="iv-mono" style={{ textAlign: 'right' }}>{lead.expected_guests || 0}</td>
                  </tr>
                ))}
                {(!leads || leads.length === 0) && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '48px', color: '#8A847A' }}>
                      No leads found in Supabase. Run the simulation on the dashboard to generate some.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Layout>
  );
}
