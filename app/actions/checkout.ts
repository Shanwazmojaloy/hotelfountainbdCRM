"use server";
import { createServerActionClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function processCheckOut(roomId: string, invoiceId: string, totalDue: number) {
  const supabase = createServerActionClient({ cookies });

  // 1. Release the room immediately (Operational priority)
  const { error: roomError } = await supabase
    .from('rooms')
    .update({ status: 'Dirty' }) // Triggers Botanical Jade -> Sunset Rose
    .eq('id', roomId);

  if (roomError) throw new Error("Failed to update room status");

  // 2. Safely update the invoice based on the actual balance
  const finalPaymentStatus = totalDue > 0 ? 'Unpaid' : 'Paid';

  const { error: invoiceError } = await supabase
    .from('invoices')
    .update({ 
      checkout_status: 'Departed',
      payment_status: finalPaymentStatus 
    })
    .eq('id', invoiceId);

  if (invoiceError) throw new Error("Failed to update invoice");

  return { success: true, message: "Check-out complete." };
}
