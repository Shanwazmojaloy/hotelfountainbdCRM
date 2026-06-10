'use client';

// Settings — ported from legacy SettingsPage. Hotel Info (load + upsert hotel_settings,
// PK = key,tenant_id — these feed VAT / service-charge / check-in-out used by billing),
// Staff (read-only roster), and System info. Staff add/edit/remove, device-logout and
// security actions remain owner-only in the legacy admin for now.
import { useState, useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import StaffFormModal from './StaffFormModal';
import WorkflowMonitor from './WorkflowMonitor';
import { Tabs } from './dskit';

const TENANT = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';

const ROLE_LABEL = { owner: 'Founder / Owner', manager: 'Manager', receptionist: 'Receptionist', housekeeping: 'Housekeeping', accountant: 'Accountant' };

export default function Settings() {
  const [tab, setTab] = useState('hotel');
  const [hs, setHS] = useState({ hotelName: 'Hotel Fountain', city: 'Dhaka', currency: 'BDT', checkIn: '14:00', checkOut: '12:00', vat: '0', svc: '0' });
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [staffModal, setStaffModal] = useState(null); // 'new' | { user } | null
  const set = (k) => (e) => setHS((p) => ({ ...p, [k]: e.target.value }));

  async function reloadStaff() {
    try {
      const supabase = getSupabaseClient();
      const { data: st } = await supabase.from('staff').select('id, name, email, role, activated, device').order('role');
      setStaff(st || []);
    } catch (e) { console.error('[Settings] staff reload:', e); }
  }

  const [secBusy, setSecBusy] = useState(false);
  const [secMsg, setSecMsg] = useState('');
  async function logoutAllDevices() {
    if (!window.confirm('Sign out ALL staff on every device? They will be logged out on next sync (≤90s).')) return;
    setSecBusy(true); setSecMsg('');
    try {
      const r = await fetch('/api/crm/staff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout_all' }) });
      if (r.status === 401) {
        const supabase = getSupabaseClient();
        const { error } = await supabase.from('staff').update({ session_v: 2 }).eq('tenant_id', TENANT).neq('role', 'owner');
        if (error) throw error;
      } else { const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || 'Failed'); }
      setSecMsg('All sessions invalidated — staff will be signed out shortly.');
      reloadStaff();
    } catch (e) { setSecMsg('Failed: ' + (e.message || String(e))); } finally { setSecBusy(false); }
  }

  useEffect(() => {
    (async () => {
      try {
        const supabase = getSupabaseClient();
        const [{ data: rows }, { data: st }] = await Promise.all([
          supabase.from('hotel_settings').select('key, value').eq('tenant_id', TENANT),
          supabase.from('staff').select('id, name, email, role, activated, device').order('role'),
        ]);
        if (rows && rows.length) {
          const m = {}; rows.forEach((r) => { m[r.key] = r.value; });
          setHS((p) => ({
            hotelName: m.hotel_name ?? p.hotelName, city: m.city ?? p.city, currency: m.currency ?? p.currency,
            checkIn: m.check_in ?? p.checkIn, checkOut: m.check_out ?? p.checkOut, vat: m.vat_rate ?? p.vat, svc: m.service_charge ?? p.svc,
          }));
        }
        setStaff(st || []);
      } catch (e) { console.error('[Settings] load:', e); } finally { setLoading(false); }
    })();
  }, []);

  async function saveHotel() {
    setSaving(true); setMsg('');
    try {
      const values = { hotel_name: hs.hotelName, city: hs.city, currency: hs.currency, check_in: hs.checkIn, check_out: hs.checkOut, vat_rate: hs.vat, service_charge: hs.svc };
      const r = await fetch('/api/crm/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values }) });
      if (r.status === 401) {
        const supabase = getSupabaseClient();
        const rows = Object.entries(values).map(([key, value]) => ({ key, value: String(value), tenant_id: TENANT }));
        const { error } = await supabase.from('hotel_settings').upsert(rows, { onConflict: 'key,tenant_id' });
        if (error) throw error;
      } else { const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || 'Save failed'); }
      setMsg('Hotel settings saved ✓');
    } catch (e) { setMsg('Save failed: ' + (e.message || String(e))); } finally { setSaving(false); }
  }

  const field = { padding: '10px 12px', border: '1px solid var(--iv-border)', borderRadius: 8, background: '#fff', width: '100%', fontSize: 13, minHeight: 42, color: 'var(--iv-ink)' };
  const lbl = { fontSize: 10, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--iv-ink3)', marginBottom: 6, display: 'block' };
  const TABS = [{ id: 'hotel', label: 'Hotel Info' }, { id: 'users', label: 'Staff' }, { id: 'security', label: 'Security' }, { id: 'system', label: 'System' }];

  return (
    <div style={{ maxWidth: 820 }}>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === 'hotel' && (
        <div className="iv-card">
          <h3 className="text-lg mb-4 pb-3 iv-divider">Hotel Information</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div><label style={lbl}>Hotel Name</label><input style={field} value={hs.hotelName} onChange={set('hotelName')} /></div>
            <div><label style={lbl}>City / Location</label><input style={field} value={hs.city} onChange={set('city')} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div><label style={lbl}>Currency</label>
              <select style={field} value={hs.currency} onChange={set('currency')}>
                <option value="BDT">BDT — Bangladeshi Taka (৳)</option>
                <option value="USD">USD — US Dollar ($)</option>
                <option value="EUR">EUR — Euro (€)</option>
              </select></div>
            <div><label style={lbl}>Timezone</label><input style={{ ...field, opacity: 0.6 }} value="Asia/Dhaka (UTC+6)" disabled /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div><label style={lbl}>Standard Check-In</label><input type="time" style={field} value={hs.checkIn} onChange={set('checkIn')} /></div>
            <div><label style={lbl}>Standard Check-Out</label><input type="time" style={field} value={hs.checkOut} onChange={set('checkOut')} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div><label style={lbl}>VAT Rate (%)</label><input type="number" style={field} value={hs.vat} onChange={set('vat')} min="0" max="30" /></div>
            <div><label style={lbl}>Service Charge (%)</label><input type="number" style={field} value={hs.svc} onChange={set('svc')} min="0" max="30" /></div>
          </div>
          {msg && <div className="mb-3 text-sm" style={{ color: msg.startsWith('Save failed') ? '#DC2626' : '#16A34A' }}>{msg}</div>}
          <button className="iv-btn" onClick={saveHotel} disabled={saving}>{saving ? 'Saving…' : 'Save Settings'}</button>
        </div>
      )}

      {tab === 'users' && (
        <div className="iv-card">
          <div className="flex items-center justify-between mb-4 pb-3 iv-divider">
            <h3 className="text-lg">Staff Accounts</h3>
            <button className="iv-btn" style={{ padding: '5px 12px', fontSize: 13 }} onClick={() => setStaffModal('new')}>+ Add Staff</button>
          </div>
          {loading && <div className="iv-stat__sub">Loading…</div>}
          {!loading && staff.length === 0 && <div className="iv-stat__sub">No staff accounts.</div>}
          <div className="flex flex-col gap-2">
            {staff.map((u) => (
              <div key={u.id} className="flex items-center justify-between" style={{ border: '1px solid var(--iv-border2)', borderRadius: 8, padding: '10px 14px' }}>
                <div><div style={{ fontWeight: 600, fontSize: 14 }}>{u.name}</div><div className="iv-mono" style={{ fontSize: 11, color: 'var(--iv-ink3)' }}>{u.email}</div></div>
                <div className="flex items-center gap-2">
                  {u.role === 'owner' ? <span className="iv-badge" style={{ background: 'rgba(139,105,20,0.12)', color: 'var(--iv-gold)' }}>★ Owner</span>
                    : <span className="iv-badge">{ROLE_LABEL[u.role] || u.role}</span>}
                  {u.activated === false && <span className="iv-badge" style={{ background: 'rgba(220,38,38,0.10)', color: '#DC2626' }}>Pending</span>}
                  {u.role !== 'owner' && <button className="iv-btn iv-btn--ghost" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => setStaffModal({ user: u })}>Edit</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'security' && (
        <div className="iv-card">
          <h3 className="text-lg mb-4 pb-3 iv-divider">Security</h3>
          <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 4 }}>Logout All Devices</div>
          <div className="iv-stat__sub mb-3">Immediately invalidates all active staff sessions. Everyone (except the owner) is signed out on next sync (≤90s).</div>
          {secMsg && <div className="mb-3 text-sm" style={{ color: secMsg.startsWith('Failed') ? '#DC2626' : '#16A34A' }}>{secMsg}</div>}
          <button className="iv-btn" style={{ background: '#DC2626' }} onClick={logoutAllDevices} disabled={secBusy}>{secBusy ? 'Working…' : '⏻ Logout All Devices'}</button>
        </div>
      )}

      {tab === 'system' && (<>
        <div className="iv-card">
          <h3 className="text-lg mb-4 pb-3 iv-divider">System</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[['Database', 'mynwfkgksqqwlqowlscj'], ['Region', 'us-east-1 (N. Virginia)'], ['Tenant', TENANT.slice(0, 18) + '…'], ['Plan', 'Founder — Unlimited']].map(([l, v]) => (
              <div key={l} style={{ border: '1px solid var(--iv-border2)', borderRadius: 8, padding: '10px 14px' }}>
                <div style={lbl}>{l}</div><div className="iv-mono" style={{ fontSize: 12, color: 'var(--iv-ink)' }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-5"><WorkflowMonitor /></div>
      </>)}

      {staffModal && (
        <StaffFormModal
          user={staffModal === 'new' ? null : staffModal.user}
          existing={staff}
          onClose={() => setStaffModal(null)}
          onSaved={reloadStaff}
        />
      )}
    </div>
  );
}
