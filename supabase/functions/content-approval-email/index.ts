import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const TO_EMAIL = 'ahmedshanwaz5@gmail.com';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async () => {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Get all VARIATIONS_READY content for this week
  const { data: slots } = await sb
    .from('content_calendar')
    .select('id,platform,content_type,scheduled_for,post_time')
    .eq('status','VARIATIONS_READY')
    .gte('scheduled_for', new Date().toISOString().split('T')[0])
    .order('scheduled_for');

  if (!slots?.length) {
    return new Response(JSON.stringify({message:'No content ready for approval'}), {status:200});
  }

  // Get all variations for these slots
  const ids = slots.map(s => s.id);
  const { data: vars } = await sb
    .from('content_variations')
    .select('*')
    .in('content_id', ids)
    .order('content_id,variant_number');

  // Build HTML email
  let html = `
<!DOCTYPE html><html><head>
<style>
body{font-family:Arial,sans-serif;background:#F9F7F2;margin:0;padding:20px;color:#2D2A26}
.wrap{max-width:700px;margin:0 auto}
.hdr{background:#1A1816;color:#C5A059;padding:24px;border-radius:8px 8px 0 0;text-align:center}
.hdr h1{margin:0;font-size:22px;letter-spacing:1px}
.hdr p{margin:4px 0 0;color:#888;font-size:13px}
.intro{background:#fff;padding:20px 24px;border:1px solid #EAE6DD}
.slot-header{background:#1A1816;color:#C5A059;padding:12px 20px;margin-top:24px;border-radius:6px 6px 0 0;font-size:14px;font-weight:bold}
.slot-meta{background:#F4F1EA;padding:8px 20px;font-size:12px;color:#666;border-left:1px solid #EAE6DD;border-right:1px solid #EAE6DD}
.variation{background:#fff;border:1px solid #EAE6DD;border-top:none;padding:16px 20px}
.variation:last-child{border-radius:0 0 6px 6px}
.var-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.var-num{background:#C5A059;color:#fff;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:bold}
.var-angle{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px}
.body-bn{background:#F9F7F2;border-left:3px solid #C5A059;padding:10px 14px;margin:8px 0;font-size:13px;white-space:pre-wrap;border-radius:0 4px 4px 0}
.body-en{background:#F0F4FF;border-left:3px solid #4A90D9;padding:10px 14px;margin:8px 0;font-size:13px;white-space:pre-wrap;border-radius:0 4px 4px 0}
.visual{background:#FFF8EC;border:1px dashed #C5A059;padding:8px 12px;font-size:11px;color:#666;border-radius:4px;margin-top:6px}
.cta-tag{display:inline-block;background:#E8F5E9;color:#2E7D32;padding:3px 10px;border-radius:12px;font-size:11px;margin-top:6px}
.approve-btn{display:inline-block;background:#C5A059;color:#fff;padding:8px 18px;border-radius:6px;text-decoration:none;font-size:12px;font-weight:bold;margin-top:8px}
.footer{background:#F4F1EA;padding:16px 24px;text-align:center;font-size:11px;color:#888;border-radius:0 0 8px 8px;border:1px solid #EAE6DD;border-top:none}
.how-to{background:#fff;border:1px solid #C5A059;padding:16px 20px;margin-top:16px;border-radius:6px}
.how-to h3{margin:0 0 8px;color:#C5A059;font-size:14px}
</style></head><body><div class="wrap">
<div class="hdr"><h1>🏨 HOTEL FOUNTAIN BD</h1><p>Weekly Content Approval — ${slots.length} posts × 6 variations each</p></div>
<div class="intro">
<p>Assalamu Alaikum Shan! 👋</p>
<p>Your social media content team has prepared <strong>${slots.length} posts</strong> for this week, each with <strong>6 different angle variations</strong>.</p>
<p>Please reply to this email with your selections using the format below, or update directly in the CRM dashboard.</p>
</div>
<div class="how-to">
<h3>How to Approve</h3>
<p style="font-size:13px;margin:0">Reply to this email with:<br/>
<code style="background:#f4f4f4;padding:2px 6px;border-radius:3px">POST-1: V3, POST-2: V1, POST-3: V5...</code><br/>
Or update in Supabase: <code>UPDATE content_variations SET selected=true WHERE id='...'</code></p>
</div>
`;

  let postNum = 0;
  for (const slot of slots) {
    postNum++;
    const slotVars = vars?.filter(v => v.content_id === slot.id) || [];
    const dateStr = new Date(slot.scheduled_for).toLocaleDateString('en-BD', {weekday:'long',month:'short',day:'numeric'});

    html += `
<div class="slot-header">POST-${postNum}: ${slot.content_type.replace('_',' ')} — ${slot.platform} — ${dateStr} @ ${slot.post_time}</div>
<div class="slot-meta">📅 ${dateStr} &nbsp;|&nbsp; 📱 ${slot.platform} &nbsp;|&nbsp; 🎯 ${slot.content_type}</div>
`;
    for (const v of slotVars) {
      html += `
<div class="variation">
  <div class="var-header">
    <span class="var-num">V${v.variant_number}</span>
    <span class="var-angle">Angle: ${v.angle}</span>
  </div>
  ${v.body_bn ? `<div style="font-size:11px;color:#888;margin-bottom:2px">🇧🇩 Bangla:</div><div class="body-bn">${v.body_bn.replace(/</g,'&lt;')}</div>` : ''}
  ${v.body_en ? `<div style="font-size:11px;color:#888;margin-top:6px;margin-bottom:2px">🇬🇧 English:</div><div class="body-en">${v.body_en.replace(/</g,'&lt;')}</div>` : ''}
  <div class="visual">📸 Visual: ${(v.visual_brief||'').substring(0,100)}</div>
  <div class="cta-tag">CTA: ${v.cta||''}</div>
</div>`;
    }
  }

  html += `
<div class="how-to" style="margin-top:24px">
<h3>Quick Reply Format</h3>
<p style="font-size:13px;margin:0">`;
  for (let i=1;i<=slots.length;i++) html += `POST-${i}: V? &nbsp;`;
  html += `</p></div>
<div class="footer">Lumea CRM — Hotel Fountain BD | Nikunja-02, Dhaka 1229<br/>This email requires your approval before content is posted.</div>
</div></body></html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method:'POST',
    headers:{'Authorization':`Bearer ${RESEND_API_KEY}`,'Content-Type':'application/json'},
    body: JSON.stringify({
      from:'Lumea CRM <onboarding@resend.dev>',
      to:[TO_EMAIL],
      subject:`✅ [APPROVAL NEEDED] ${slots.length} Posts × 6 Variations — Hotel Fountain BD`,
      html
    })
  });

  const data = await res.json();

  if (res.ok) {
    // Mark variations as emailed
    await sb.from('content_variations')
      .update({email_sent:true, email_sent_at: new Date().toISOString()})
      .in('content_id', ids);
  }

  return new Response(JSON.stringify({success:res.ok, id:data.id, posts:slots.length}),
    {headers:{'Content-Type':'application/json'}});
});
