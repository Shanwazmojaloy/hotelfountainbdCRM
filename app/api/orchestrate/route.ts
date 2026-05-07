export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { ProspectorAgent } from '@/agents/prospector';
import { CloserAgent } from '@/agents/closer';
import { AnalystAgent } from '@/agents/analyst';
import { insertLead, getLeadByEmail, insertTransaction } from '@/services/supabase';
import { backupTransaction } from '@/services/make';

export async function POST() {
  console.log('=== Vercel API Triggered: Antigravity 3-Agent Sales Engine ===\n');

  try {
      const prospector = new ProspectorAgent();
      const closer = new CloserAgent();
      const analyst = new AnalystAgent();
      const ADMIN_EMAIL = 'ahmedshanwaz5@gmail.com';

      const dailyLeads = [];
      const dailyTransactions = [];
      const todayDate = new Date().toISOString().split('T')[0];

      // 1. Prospector finds Event Leads
      const newLeads = await prospector.findLeads();
      console.log(`[API Manager] Prospector found ${newLeads.length} leads.`);

      for (const [index, leadData] of newLeads.entries()) {
        if (!leadData.email) continue;
        
        // Ensure no duplicate processing
        let existingLead = null;
        try { existingLead = await getLeadByEmail(leadData.email); } catch { }

        let currentLead = existingLead;
        if (!existingLead) {
          try {
            currentLead = await insertLead({ ...leadData, source: leadData.source || 'Orchestration API Engine' });
            console.log(`[API Manager] Saved new lead: ${currentLead.name}`);
          } catch { continue; }
        }
        dailyLeads.push(currentLead);

        // Agents step in
        await closer.draftAndSendPitch(currentLead);

        const simulatedRoomNumber = `RM-${100 + index}`;
        const simulatedBill = leadData.expected_guests ? leadData.expected_guests * 50 : 500;

        let checkInTx: import('@/types').Transaction = {
          lead_id: currentLead.id,
          room_number: simulatedRoomNumber,
          check_in_date: todayDate,
          amount: simulatedBill,
          status: 'active'
        };

        try {
          checkInTx = await insertTransaction(checkInTx);
          dailyTransactions.push(checkInTx);
          await closer.sendCheckInEmail(currentLead, checkInTx);
          await backupTransaction(checkInTx, currentLead); // Webhook to Make
        } catch (e) { console.error('[API] Error Check-In:', e); }

        checkInTx.status = 'completed';
        checkInTx.check_out_date = todayDate;
        
        try {
          await closer.sendCheckOutEmail(currentLead, checkInTx);
        } catch (e) { console.error('[API] Error Check-Out:', e); }
      }

      await analyst.sendDailyClosingReport(dailyTransactions, dailyLeads, ADMIN_EMAIL);

      return NextResponse.json({
          status: 'success',
          message: `Sales loop complete! Handled ${newLeads.length} leads and sent daily report to ${ADMIN_EMAIL}.`,
          processed_leads: newLeads.length
      });

  } catch (error) {
      console.error('API Error:', error);
      return NextResponse.json({ status: 'error', error: String(error) }, { status: 500 });
  }
}
