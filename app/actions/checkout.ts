"use server";

import { createClient } from '@supabase/supabase-js';

function createServerSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Supabase credentials are not configured.');
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function processCheckOut(roomId: string, invoiceId: string, totalDue: number) {
  const supabase = createServerSupabaseClient();

  // 1. Release the room immediately (Operational priority)
  const { error: roomError } = await supabase
    .from('rooms')
    .update({ status: 'Dirty' })
    .eq('id', roomId);

  if (roomError) throw new Error("Failed to update room status");

  // 2. Safely update the invoice based on the actual balance
  const { data: invoiceRow, error: invoiceFetchError } = await supabase
    .from('invoices')
    .select('amount_paid')
    .eq('id', invoiceId)
    .single();

  if (invoiceFetchError) throw new Error("Failed to load invoice");

  const paidSoFar = Number(invoiceRow?.amount_paid ?? 0);
  const finalPaymentStatus = totalDue <= 0 ? 'Paid' : (paidSoFar > 0 ? 'Partial' : 'Unpaid');

  const { error: invoiceError } = await supabase
    .from('invoices')
    .update({
      checkout_status: 'Departed',
      payment_status: finalPaymentStatus,
      total_due: totalDue,
    })
    .eq('id', invoiceId);

  if (invoiceError) throw new Error("Failed to update invoice");

  return { success: true, message: "Check-out complete." };
}
