'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';

export interface CheckoutSummary {
  success: boolean;
  reservation_id: string;
  invoice_id: string;
  invoice_number: string;
  guest_name: string;
  rooms_vacated: string[];
  stay_nights: number;
  actual_nights: number;
  net_total_bdt: number;
  sc_total_bdt: number;
  vat_total_bdt: number;
  discount_total_bdt: number;
  gross_total_bdt: number;
  paid_total_bdt: number;
  balance_due_bdt: number;
  charges_voided: number;
  legacy_bridge: boolean;
  checkout_time: string;
}

async function callCheckoutFunction(p: {reservation_id:string; actual_checkout?:string}): Promise<CheckoutSummary> {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) throw new Error('No active session');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL + '/functions/v1/process-checkout';
  const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,'apikey':process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}, body: JSON.stringify(p) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Checkout failed');
  return data;
}

export function useCheckout() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: callCheckoutFunction, onSuccess: (s) => {
    qc.invalidateQueries({ queryKey: ['ledger', s.reservation_id] });
    qc.invalidateQueries({ queryKey: ['invoice', s.reservation_id] });
    qc.invalidateQueries({ queryKey: ['payments', s.reservation_id] });
    qc.invalidateQueries({ queryKey: ['rooms'] });
  }});
                               }
