'use client';

// Settings — ported from legacy SettingsPage. Hotel Info (load + upsert hotel_settings,
// PK = key,tenant_id — these feed VAT / service-charge / check-in-out used by billing),
// Staff (read-only roster), and System info. Staff add/edit/remove, device-logout and
// security actions remain owner-only in the legacy admin for now.
import { useState, useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';

const TENANT = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';

const ROLE_LABEL = { owner: 'Founder / Owner', manager: 'Manager', receptionist: 'Receptionist', housekeeping: 'Housekeeping', accountant: 'Accountant' };

export default function Settings() {
  const [tab, setTab] = useState('hotel');
  const [hs, setHS] = useState({ hotelName: 'Hotel Fountain', city: 'Dhaka', currency: 'BDT', checkIn: '14:00', checkOut: '12:00', vat: '0', svc: '0' });
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const set = (k) => (e) => setHS((p) => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    (async () => {
      try {
        const supabase = getSupabaseClient();
        const [{ data: rows }, { data: st }] = await Promise.all([
          supabase.from('hotel_settings').select('key, value').eq('tenant_id', TENANT),
          supabase.from('staff').select('id, name, email, role, activated').order('role'),
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
      const supabase = getSupabaseClient();
      const rows = [
        ['hotel_name', hs.hotelName], ['city', hs.city], ['currency', hs.currency],
        ['check_in', hs.checkIn], ['check_out', hs.checkOut], ['vat_rate', hs.vat], ['service_charge', hs.svc],
      ].map(([key, value]) => ({ key, value: String(value), tenant_id: TENANT }));
      const { error } = await supabase.from('hotel_settings').upsert(rows, { onConflict: 'key,tenant_id' });
      if (error) throw error;
      setMsg('Hotel settings saved ✓');
    } catch (e) { setMsg('Save failed: ' + (e.message || String(e))); } finally { setSaving(false); }
  }

  const field = { padding: '8px 12px', border: '1px solid #E0D8C8', borderRadius: 8, background: '#FFFDF8', width: '100%', fontSize: 14 };
  const lbl = { fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#8A7F6E', marginBottom: 4, display: 'block' };
  const TABS = [['hotel', 'Hotel Info'], ['users', 'Staff'], ['system', 'System']];

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 className="text-3xl mb-8 pb-6 iv-divider">Settings</h1>

      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)} className={tab === v ? 'iv-btn' : 'iv-btn iv-btn--ghost'} style={{ padding: '6px 14px', fontSize: 13 }}>{l}</button>
        ))}
      </div>

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
          {msg && <div className="mb-3 text-sm" style={{ color: msg.startsWith('Save failed') ? '#C0566A' : '#3C6B4A' }}>{msg}</div>}
          <button className="iv-btn" onClick={saveHotel} disabled={saving}>{saving ? 'Saving…' : 'Save Settings'}</button>
        </div>
      )}

      {tab === 'users' && (
        <div className="iv-card">
          <h3 className="text-lg mb-4 pb-3 iv-divider">Staff Accounts <span className="iv-stat__sub" style={{ fontWeight: 400 }}>· read-only (manage in legacy admin)</span></h3>
          {loading && <div className="iv-stat__sub">Loading…</div>}
          {!loading && staff.length === 0 && <div className="iv-stat__sub">No staff accounts.</div>}
          <div className="flex flex-col gap-2">
            {staff.map((u) => (
              <div key={u.id} className="flex items-center justify-between" style={{ border: '1px solid #EAE3D6', borderRadius: 8, padding: '10px 14px' }}>
                <div><div style={{ fontWeight: 600, fontSize: 14 }}>{u.name}</div><div className="iv-mono" style={{ fontSize: 11, color: '#8A7F6E' }}>{u.email}</div></div>
                <div className="flex items-center gap-2">
                  {u.role === 'owner' ? <span className="iv-badge" style={{ background: 'rgba(139,105,20,0.15)', color: '#8B6914' }}>★ Owner</span>
                    : <span className="iv-badge">{ROLE_LABEL[u.role] || u.role}</span>}
                  {u.activated === false && <span className="iv-badge" style={{ background: 'rgba(192,86,106,0.12)', color: '#A23B4E' }}>Pending</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'system' && (
        <div className="iv-card">
          <h3 className="text-lg mb-4 pb-3 iv-divider">System</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[['Database', 'mynwfkgksqqwlqowlscj'], ['Region', 'us-east-1 (N. Virginia)'], ['Tenant', TENANT.slice(0, 18) + '…'], ['Plan', 'Founder — Unlimited']].map(([l, v]) => (
              <div key={l} style={{ border: '1px solid #EAE3D6', borderRadius: 8, padding: '10px 14px' }}>
                <div style={lbl}>{l}</div><div className="iv-mono" style={{ fontSize: 12, color: '#2B2722' }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
