export const dynamic = 'force-dynamic';
import Link from 'next/link';
import { supabase } from '@/services/supabase';

export const revalidate = 0; // Disable static rendering to ensure fresh leads

export default async function LeadsPage() {
  const { data: leads, error } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-8">
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-6 rounded-2xl">
          <h2 className="text-2xl font-bold mb-2">Error Loading Leads</h2>
          <p>{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans selection:bg-cyan-500/30 p-8 relative overflow-x-hidden">
      {/* Background Gradients */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-[100px] opacity-20"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-cyan-500 rounded-full mix-blend-multiply filter blur-[100px] opacity-10"></div>

      <div className="relative z-10 max-w-7xl mx-auto">
        <header className="mb-10 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500">
              CRM Leads Base
            </h1>
            <p className="text-neutral-400 mt-2">Displaying all organically and artificially prospected leads.</p>
          </div>
          <Link href="/" className="px-6 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-all">
            Back to Dashboard
          </Link>
        </header>

        <div className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-md">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-neutral-300">
              <thead className="bg-white/5 text-neutral-400">
                <tr>
                  <th className="px-6 py-4 font-semibold">Name</th>
                  <th className="px-6 py-4 font-semibold">Company</th>
                  <th className="px-6 py-4 font-semibold">Email</th>
                  <th className="px-6 py-4 font-semibold">Venue Preference</th>
                  <th className="px-6 py-4 font-semibold text-right">Expected Guests</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {leads?.map((lead) => (
                  <tr key={lead.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 font-medium text-white">{lead.name}</td>
                    <td className="px-6 py-4">{lead.company || <span className="text-neutral-600">N/A</span>}</td>
                    <td className="px-6 py-4">{lead.email}</td>
                    <td className="px-6 py-4">
                      <span className="px-3 py-1 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded-full text-xs font-semibold">
                        {lead.venue_preference || 'TBD'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">{lead.expected_guests || 0}</td>
                  </tr>
                ))}
                {(!leads || leads.length === 0) && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-neutral-500">
                      No leads found in Supabase. Run the simulation on the main dashboard to generate some!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
