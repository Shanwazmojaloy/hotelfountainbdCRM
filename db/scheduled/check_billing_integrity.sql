CREATE OR REPLACE FUNCTION public.check_billing_integrity()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_neg int; v_neg_sum numeric; v_new_dups int;
begin
  select count(*), coalesce(sum(balance_due_bdt),0) into v_neg, v_neg_sum
  from billing_invoices where balance_due_bdt < 0;

  -- only TIGHT clusters (<5 min apart) = submit-loop signature; wide same-amount payments are legit repeat tenders
  select count(*) into v_new_dups from (
    select reservation_id, amount_bdt, completed_at::date
    from payment_transactions
    where status='COMPLETED' and reservation_id is not null
      and completed_at > now() - interval '24 hours'
    group by 1,2,3
    having count(*) > 1 and (max(completed_at)-min(completed_at)) < interval '5 minutes') d;

  if v_neg > 0 or v_new_dups > 0 then
    insert into notifications_log(workflow, recipient_email, subject, body, status, triggered_by, metadata)
    values('billing-integrity-monitor','ahmedshanwaz5@gmail.com',
      format('[Lumea] Billing alert: %s negative invoice(s), %s submit-loop dup(s)', v_neg, v_new_dups),
      format('Daily billing integrity check found issues:%s- Negative invoices: %s (sum BDT %s)%s- New tight-cluster duplicate payments (last 24h, <5min apart = submit-loop): %s%s%sIf submit-loop dups > 0, the idempotency guard regressed. If negatives > 0, run billing remediation. Backups: _backup_*_neg_20260609.',
             chr(10), v_neg, v_neg_sum, chr(10), v_new_dups, chr(10), chr(10)),
      'pending','pg_cron:check_billing_integrity',
      jsonb_build_object('negatives',v_neg,'neg_sum',v_neg_sum,'submit_loop_dups',v_new_dups,'checked_at',now()));
  end if;
end$function$
