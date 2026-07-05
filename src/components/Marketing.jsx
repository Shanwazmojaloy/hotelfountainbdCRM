'use client';

// Marketing Studio — the human approval hub for the AI content pipeline.
// The strategist agents write drafts into content_calendar; NOTHING reaches Facebook
// until an admin approves it here (approved_channel='HUMAN' is set only by this page's
// API). The daily publisher cron then posts due approved items and pulls engagement.
import { useState, useEffect, useMemo } from 'react';

const TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'posted', label: 'Posted' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'impact', label: 'Impact' },
];

const bucketOf = (r) =>
  r.posted_at || r.status === 'POSTED' ? 'posted'
  : r.status === 'APPROVED' ? 'approved'
  : r.status === 'REJECTED' ? 'rejected'
  : 'pending';

const TYPE_COLORS = {
  OFFER: '#EAFF7A', TESTIMONIAL: '#7BE04A', ROOM_SPOTLIGHT: '#8AB4FF',
  SEASONAL: '#FFB86B', CORPORATE_PITCH: '#C8A96E', BEHIND_SCENES: '#D9A7FF',
};

const fmtDate = (d) => {
  try { return new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }); }
  catch { return String(d || ''); }
};
const fmtTs = (ts) => (ts ? new Date(ts).toLocaleString('en', { timeZone: 'Asia/Dhaka', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

async function api(body) {
  const r = await fetch('/api/crm/marketing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Request failed');
  return d;
}

const emptyNew = { title: '', body_en: '', scheduled_for: '', post_time: '10:00', image_url: '', platform: 'FACEBOOK' };

export default function Marketing() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('pending');
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState('');
  const [edit, setEdit] = useState(null); // { id, body_en, title, scheduled_for, post_time, image_url }
  const [showNew, setShowNew] = useState(false);
  const [nw, setNw] = useState(emptyNew);
  const [impact, setImpact] = useState(null); // { summary, posts } — lazy-loaded

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (tab !== 'impact' || impact) return;
    fetch('/api/crm/marketing?view=impact', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (d.summary) setImpact(d); else setErr(d.error || 'Could not load impact data'); })
      .catch((e) => setErr(String(e)));
  }, [tab, impact]);

  async function load() {
    try {
      const r = await fetch('/api/crm/marketing', { cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not load content');
      setRows(d.rows || []);
      setErr('');
    } catch (e) { setErr(String(e.message || e)); }
    finally { setLoading(false); }
  }

  async function act(id, action, fields) {
    setBusy(`${id}:${action}`); setErr('');
    try { await api({ action, id, fields }); setEdit(null); await load(); }
    catch (e) { setErr(String(e.message || e)); }
    finally { setBusy(null); }
  }

  async function createPost() {
    if (!nw.body_en.trim()) { setErr('Post body is required.'); return; }
    setBusy('new'); setErr('');
    try { await api({ action: 'create', fields: { ...nw } }); setNw(emptyNew); setShowNew(false); await load(); }
    catch (e) { setErr(String(e.message || e)); }
    finally { setBusy(null); }
  }

  const buckets = useMemo(() => {
    const b = { pending: [], approved: [], posted: [], rejected: [] };
    for (const r of rows) b[bucketOf(r)].push(r);
    b.posted.sort((x, y) => String(y.posted_at || '').localeCompare(String(x.posted_at || '')));
    b.pending.sort((x, y) => String(x.scheduled_for || '').localeCompare(String(y.scheduled_for || '')));
    b.approved.sort((x, y) => String(x.scheduled_for || '').localeCompare(String(y.scheduled_for || '')));
    return b;
  }, [rows]);

  const startEdit = (r) => setEdit({
    id: r.id, title: r.title || '', body_en: r.body_en || r.body_bn || '',
    scheduled_for: r.scheduled_for || '', post_time: r.post_time || '10:00', image_url: r.image_url || '',
  });
  const editFields = () => ({ title: edit.title, body_en: edit.body_en, scheduled_for: edit.scheduled_for, post_time: edit.post_time, image_url: edit.image_url });

  const inputStyle = { width: '100%', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 8, padding: '8px 10px', color: 'var(--iv-ink)', fontSize: 13, fontFamily: 'var(--iv-body)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Tab bar + New Post */}
      <div className="iv-card" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className="iv-btn iv-btn--ghost"
            style={{ padding: '5px 14px', fontSize: 12, ...(tab === t.key ? { background: 'rgba(223,255,69,.14)', color: 'var(--iv-gold)', borderColor: 'rgba(223,255,69,.3)' } : {}) }}>
            {t.label}{buckets[t.key] ? <span style={{ opacity: .6, marginLeft: 4 }}>{buckets[t.key].length}</span> : null}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button className="iv-btn" style={{ padding: '5px 14px', fontSize: 12 }} onClick={() => setShowNew((v) => !v)}>
          {showNew ? '✕ Cancel' : '+ New Post'}
        </button>
      </div>

      {err && <div className="iv-card" style={{ color: '#FF6B6B', fontSize: 13 }}>⚠ {err}</div>}

      {/* Manual composer */}
      {showNew && (
        <div className="iv-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h3 className="text-lg" style={{ marginBottom: 4 }}>New Facebook Post</h3>
          <input style={inputStyle} placeholder="Title (internal label)" value={nw.title} onChange={(e) => setNw({ ...nw, title: e.target.value })} />
          <textarea style={{ ...inputStyle, minHeight: 110, resize: 'vertical' }} placeholder="Post text…" value={nw.body_en} onChange={(e) => setNw({ ...nw, body_en: e.target.value })} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select style={{ ...inputStyle, width: 140 }} value={nw.platform} onChange={(e) => setNw({ ...nw, platform: e.target.value })}>
              <option value="FACEBOOK">Facebook</option>
              <option value="INSTAGRAM">Instagram</option>
            </select>
            <input type="date" style={{ ...inputStyle, width: 160 }} value={nw.scheduled_for} onChange={(e) => setNw({ ...nw, scheduled_for: e.target.value })} />
            <input type="time" style={{ ...inputStyle, width: 120 }} value={nw.post_time} onChange={(e) => setNw({ ...nw, post_time: e.target.value })} />
            <input style={{ ...inputStyle, flex: 1, minWidth: 200 }} placeholder={nw.platform === 'INSTAGRAM' ? 'Image URL (required for Instagram)' : 'Image URL (optional, https://…)'} value={nw.image_url} onChange={(e) => setNw({ ...nw, image_url: e.target.value })} />
          </div>
          <div>
            <button className="iv-btn" style={{ padding: '6px 16px', fontSize: 12 }} disabled={busy === 'new'} onClick={createPost}>
              {busy === 'new' ? 'Saving…' : 'Save to Pending'}
            </button>
          </div>
        </div>
      )}

      {/* Impact — correlation report (posts × bookings), not click attribution */}
      {tab === 'impact' && (
        !impact ? (
          <div className="iv-card iv-stat__sub">Loading impact data…</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              {[
                ['Posts (60d)', impact.summary.posts],
                ['Total reactions', impact.summary.total_reactions],
                ['Bookings/day · post days', impact.summary.avg_bookings_post_days ?? '—'],
                ['Bookings/day · other days', impact.summary.avg_bookings_other_days ?? '—'],
              ].map(([label, val]) => (
                <div key={label} className="iv-card" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--iv-gold)' }}>{val}</div>
                  <div className="iv-stat__sub" style={{ marginTop: 4 }}>{label}</div>
                </div>
              ))}
            </div>
            <div className="iv-card">
              <div className="iv-stat__sub" style={{ marginBottom: 10 }}>
                Bookings created within 48h of each post — correlation, not proof of cause. Reaction counts refresh daily at 10:00.
              </div>
              {impact.posts.length === 0 && <div className="iv-stat__sub">No posts published in the last 60 days yet.</div>}
              {impact.posts.map((p) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--iv-border2)' }}>
                  <span className="iv-stat__sub" style={{ width: 92, flexShrink: 0 }}>{fmtTs(p.posted_at)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--iv-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title}</div>
                    <div className="iv-stat__sub">{p.content_type}</div>
                  </div>
                  <span className="iv-stat__sub">👍 {p.engagement_likes ?? 0}</span>
                  <span className="iv-badge" style={{ background: 'rgba(123,224,74,.12)', color: '#7BE04A' }}>{p.bookings_48h} bookings/48h</span>
                  {(p.permalink || p.fb_post_id) && (
                    <a href={p.permalink || `https://www.facebook.com/${p.fb_post_id}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--iv-gold)' }}>↗</a>
                  )}
                </div>
              ))}
            </div>
          </>
        )
      )}

      {tab !== 'impact' && loading && <div className="iv-card iv-stat__sub">Loading content…</div>}
      {tab !== 'impact' && !loading && buckets[tab].length === 0 && (
        <div className="iv-card iv-stat__sub">
          {tab === 'pending' ? 'No posts waiting for review. The strategist agent drafts new content every Monday.' : 'Nothing here yet.'}
        </div>
      )}

      {tab !== 'impact' && !loading && buckets[tab].map((r) => {
        const isEditing = edit?.id === r.id;
        const typeColor = TYPE_COLORS[r.content_type] || '#9AA3B2';
        const humanApproved = r.approved_channel === 'HUMAN';
        return (
          <div key={r.id} className="iv-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Meta line */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span className="iv-badge" style={{ background: 'rgba(255,255,255,.06)', color: typeColor }}>{r.content_type || 'POST'}</span>
              <span className="iv-badge" style={{ background: 'rgba(138,180,255,.1)', color: '#8AB4FF' }}>{r.platform}</span>
              <span className="iv-stat__sub">📅 {fmtDate(r.scheduled_for)} · {r.post_time || '—'}</span>
              <span className="iv-stat__sub" style={{ opacity: .7 }}>by {r.created_by_agent || '—'}</span>
              <div style={{ flex: 1 }} />
              {tab === 'approved' && (humanApproved
                ? <span className="iv-badge" style={{ background: 'rgba(123,224,74,.12)', color: '#7BE04A' }}>queued — auto-posts ~10:00</span>
                : <span className="iv-badge" style={{ background: 'rgba(255,184,107,.12)', color: '#FFB86B' }}>AI-approved — needs your approval</span>)}
              {tab === 'posted' && <span className="iv-stat__sub">✔ {fmtTs(r.posted_at)}{r.approved_by ? ` · approved by ${r.approved_by}` : ''}</span>}
            </div>

            {/* Body */}
            {isEditing ? (
              <>
                <input style={inputStyle} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
                <textarea style={{ ...inputStyle, minHeight: 130, resize: 'vertical' }} value={edit.body_en} onChange={(e) => setEdit({ ...edit, body_en: e.target.value })} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input type="date" style={{ ...inputStyle, width: 160 }} value={edit.scheduled_for} onChange={(e) => setEdit({ ...edit, scheduled_for: e.target.value })} />
                  <input type="time" style={{ ...inputStyle, width: 120 }} value={edit.post_time} onChange={(e) => setEdit({ ...edit, post_time: e.target.value })} />
                  <input style={{ ...inputStyle, flex: 1, minWidth: 200 }} placeholder="Image URL (optional)" value={edit.image_url} onChange={(e) => setEdit({ ...edit, image_url: e.target.value })} />
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--iv-ink)' }}>{r.title}</div>
                <div style={{ fontSize: 13, lineHeight: 1.55, color: 'rgba(242,241,245,.85)', whiteSpace: 'pre-wrap' }}>{r.body_en || r.body_bn}</div>
                {r.hashtags && <div className="iv-stat__sub" style={{ color: '#8AB4FF' }}>{r.hashtags}</div>}
                {r.image_url && (
                  <a href={r.image_url} target="_blank" rel="noreferrer" style={{ alignSelf: 'flex-start' }}>
                    <img src={r.image_url} alt="post graphic" loading="lazy"
                      style={{ maxHeight: 180, maxWidth: '100%', borderRadius: 10, border: '1px solid rgba(255,255,255,.1)' }} />
                  </a>
                )}
                {r.publish_error && <div style={{ fontSize: 12, color: '#FF6B6B' }}>⚠ Last publish attempt failed: {r.publish_error}</div>}
              </>
            )}

            {/* Engagement (posted) */}
            {tab === 'posted' && (
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <span className="iv-stat__sub">👍 {r.engagement_likes ?? 0} reactions</span>
                {r.engagement_reach != null && <span className="iv-stat__sub">👁 {r.engagement_reach} reach</span>}
                {(r.permalink || r.fb_post_id) && (
                  <a href={r.permalink || `https://www.facebook.com/${r.fb_post_id}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--iv-gold)' }}>
                    View on {r.platform === 'INSTAGRAM' ? 'Instagram' : 'Facebook'} ↗
                  </a>
                )}
              </div>
            )}

            {/* Actions */}
            {tab !== 'posted' && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {isEditing ? (
                  <>
                    <button className="iv-btn" style={{ padding: '5px 14px', fontSize: 12 }} disabled={!!busy} onClick={() => act(r.id, 'edit', editFields())}>Save</button>
                    <button className="iv-btn iv-btn--ghost" style={{ padding: '5px 14px', fontSize: 12 }} disabled={!!busy}
                      onClick={() => act(r.id, 'approve', editFields())}>✓ Save & Approve</button>
                    <button className="iv-btn iv-btn--ghost" style={{ padding: '5px 14px', fontSize: 12 }} onClick={() => setEdit(null)}>Cancel</button>
                  </>
                ) : (
                  <>
                    {(tab === 'pending' || (tab === 'approved' && !humanApproved)) && (
                      <button className="iv-btn" style={{ padding: '5px 14px', fontSize: 12 }} disabled={!!busy}
                        onClick={() => act(r.id, 'approve')}>{busy === `${r.id}:approve` ? '…' : '✓ Approve'}</button>
                    )}
                    {tab !== 'rejected' && (
                      <button className="iv-btn iv-btn--ghost" style={{ padding: '5px 14px', fontSize: 12 }} disabled={!!busy} onClick={() => startEdit(r)}>✎ Edit</button>
                    )}
                    {tab === 'approved' && (
                      <button className="iv-btn iv-btn--ghost" style={{ padding: '5px 14px', fontSize: 12, color: '#7BE04A' }} disabled={!!busy}
                        onClick={() => { if (window.confirm('Post this to the Hotel Fountain Facebook Page right now?')) act(r.id, 'post_now'); }}>
                        {busy === `${r.id}:post_now` ? 'Posting…' : '▶ Post Now'}
                      </button>
                    )}
                    {tab !== 'rejected' ? (
                      <button className="iv-btn iv-btn--ghost" style={{ padding: '5px 14px', fontSize: 12, color: '#FF6B6B' }} disabled={!!busy}
                        onClick={() => act(r.id, 'reject')}>✕ Reject</button>
                    ) : (
                      <button className="iv-btn iv-btn--ghost" style={{ padding: '5px 14px', fontSize: 12 }} disabled={!!busy}
                        onClick={() => act(r.id, 'restore')}>↩ Restore to Pending</button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
