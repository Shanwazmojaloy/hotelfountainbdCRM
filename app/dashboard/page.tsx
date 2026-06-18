'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRole } from '@/context/RoleContext';
import { DashboardNotification, Reservation, UserRole } from '@/types';

function ReservationModal({ notification, onClose, onConfirmed }: { notification: DashboardNotification; onClose: () => void; onConfirmed: () => void }) {
  const { permissions } = useRole();
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [roomNumber, setRoomNumber] = useState('');
  const [billingNotes, setBillingNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!notification.reservation_id) { setLoading(false); return; }
    fetch('/api/reservation')
      .then((r) => r.json())
      .then((d) => {
        const found = Array.isArray(d.reservations) ? d.reservations.find((r: Reservation) => r.id === notification.reservation_id) : null;
        setReservation(found ?? null);
      })
      .catch(() => setError('Failed to load reservation details.'))
      .finally(() => setLoading(false));
  }, [notification.reservation_id]);

  const handleConfirm = async () => {
    if (!roomNumber.trim()) { setError('Please enter a room number.'); return; }
    if (!reservation?.id) return;
    setConfirming(true); setError(null);
    try {
      const res = await fetch('/api/reservation/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reservation_id: reservation.id, room_number: roomNumber.trim(), billing_notes: billingNotes.trim() || null }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Confirmation failed.');
      setSuccess(true);
      setTimeout(() => { onConfirmed(); onClose(); }, 1800);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setConfirming(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-neutral-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-cyan-600/20 to-purple-600/20 border-b border-white/10">
          <h2 className="text-lg font-bold text-white">Reservation Request</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-white text-xl">✕</button>
        </div>
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {loading && <p className="text-neutral-400 text-sm text-center py-4">Loading…</p>}
          {!loading && !reservation && <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-sm">{notification.message}</div>}
          {reservation && (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {([['Guest', reservation.guest_name], ['Email', reservation.guest_email], ['Phone', reservation.guest_phone ?? '—'], ['Category', reservation.room_category], ['Check-In', reservation.check_in_date], ['Check-Out', reservation.check_out_date], ['Guests', String(reservation.num_guests)], ['Rate/Night', `Tk. ${reservation.rate_per_night?.toLocaleString()}`], ['Total', `Tk. ${reservation.total_amount?.toLocaleString()}`], ['Status', reservation.status]] as [string, string][]).map(([label, value]) => (
                  <div key={label} className="bg-white/5 rounded-xl p-3"><p className="text-neutral-500 text-xs mb-1">{label}</p><p className="text-white font-medium truncate">{value}</p></div>
                ))}
              </div>
              {reservation.special_requests && <div className="bg-white/5 rounded-xl p-3 text-sm"><p className="text-neutral-500 text-xs mb-1">Special Requests</p><p className="text-neutral-300">{reservation.special_requests}</p></div>}
            </>
          )}
          {!loading && reservation?.status === 'pending' && permissions.canAssignRooms && (
            <div className="space-y-3 pt-2 border-t border-white/10">
              <div><label className="text-xs text-neutral-400 block mb-1">Assign Room Number *</label><input value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} placeholder="e.g. 301" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-neutral-600 focus:outline-none focus:border-cyan-500/50" /></div>
              <div><label className="text-xs text-neutral-400 block mb-1">Billing Notes (optional)</label><textarea value={billingNotes} onChange={(e) => setBillingNotes(e.target.value)} rows={2} placeholder="e.g. Corporate rate, advance payment received…" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-neutral-600 focus:outline-none focus:border-cyan-500/50 resize-none" /></div>
            </div>
          )}
          {reservation?.status === 'confirmed' && <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm text-center">✓ Already confirmed (Room {reservation.room_number}).</div>}
          {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">{error}</div>}
          {success && <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm text-center">✓ Booking confirmed! Email sent.</div>}
        </div>
        {!loading && reservation?.status === 'pending' && permissions.canAssignRooms && (
          <div className="px-6 py-4 border-t border-white/10 flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 text-sm font-medium transition-all">Cancel</button>
            <button onClick={handleConfirm} disabled={confirming || success} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed">{confirming ? 'Confirming…' : 'Confirm Booking'}</button>
          </div>
        )}
      </div>
    </div>
  );
}

function NotificationBell({ notifications, unreadCount, onNotificationClick, onMarkAllRead }: { notifications: DashboardNotification[]; unreadCount: number; onNotificationClick: (n: DashboardNotification) => void; onMarkAllRead: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((p) => !p)} className="relative p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all" aria-label="Notifications">
        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
        {unreadCount > 0 && <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-neutral-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-40">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <span className="text-sm font-semibold text-white">Notifications</span>
            {unreadCount > 0 && <button onClick={onMarkAllRead} className="text-xs text-cyan-400 hover:text-cyan-300">Mark all read</button>}
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-white/5">
            {notifications.length === 0 && <p className="text-center text-neutral-500 text-sm py-6">No notifications</p>}
            {notifications.map((n) => (
              <button key={n.id} onClick={() => { onNotificationClick(n); setOpen(false); }} className={`w-full text-left px-4 py-3 hover:bg-white/5 transition-colors ${!n.is_read ? 'border-l-2 border-cyan-500' : ''}`}>
                <div className="flex items-start gap-2">
                  <span className="text-base mt-0.5">{n.type === 'reservation' ? '🏨' : '🔔'}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${!n.is_read ? 'text-white' : 'text-neutral-400'}`}>{n.title}</p>
                    <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2">{n.message}</p>
                    <p className="text-[10px] text-neutral-600 mt-1">{n.created_at ? new Date(n.created_at).toLocaleString() : '—'}</p>
                  </div>
                  {!n.is_read && <span className="w-2 h-2 rounded-full bg-cyan-400 mt-1.5 shrink-0" />}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RoleSwitcher() {
  const { role, setRole, roleLabel } = useRole();
  const roles: { value: UserRole; label: string }[] = [{ value: 'admin', label: 'Admin' }, { value: 'manager', label: 'Manager' }, { value: 'front_office', label: 'Front Office' }, { value: 'front_desk_sales_lead', label: 'Front Desk – Sales Lead' }];
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-neutral-500">Role:</span>
      <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className="bg-white/5 border border-white/10 text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none cursor-pointer">
        {roles.map((r) => <option key={r.value} value={r.value} className="bg-neutral-900">{r.label}</option>)}
      </select>
      <span className="text-xs text-neutral-400 hidden sm:inline">{roleLabel}</span>
    </div>
  );
}

export default function DashboardPage() {
  const { roleLabel, permissions, isReadOnly } = useRole();
  const [notifications, setNotifications] = useState<DashboardNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedNotif, setSelectedNotif] = useState<DashboardNotification | null>(null);
  const [streamStatus, setStreamStatus] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      const data = await res.json();
      setNotifications(data.notifications ?? []);
      setUnreadCount((data.notifications ?? []).filter((n: DashboardNotification) => !n.is_read).length);
    } catch {}
  }, []);

  const connectSSE = useCallback(() => {
    if (eventSourceRef.current) eventSourceRef.current.close();
    setStreamStatus('connecting');
    const es = new EventSource('/api/notifications/sse');
    eventSourceRef.current = es;
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.event === 'connected') { setStreamStatus('live'); fetchNotifications(); }
        if (data.event === 'notification_update') { setUnreadCount(data.unread_count ?? 0); fetchNotifications(); }
        if (data.event === 'reconnect') setTimeout(connectSSE, 1000);
      } catch {}
    };
    es.onerror = () => { setStreamStatus('offline'); es.close(); setTimeout(connectSSE, 5000); };
  }, [fetchNotifications]);

  useEffect(() => { fetchNotifications(); connectSSE(); return () => { eventSourceRef.current?.close(); }; }, [fetchNotifications, connectSSE]);

  const handleMarkAllRead = async () => { await fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mark_all_read: true }) }); fetchNotifications(); };

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans">
      {/* Status bar */}
      <div className={`w-full px-6 py-2.5 flex items-center justify-between text-xs border-b ${streamStatus === 'live' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : streamStatus === 'connecting' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
        <span className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${streamStatus === 'live' ? 'bg-emerald-400 animate-pulse' : streamStatus === 'connecting' ? 'bg-amber-400 animate-pulse' : 'bg-red-400'}`} />
          {streamStatus === 'live' && 'Live — notification stream active'}
          {streamStatus === 'connecting' && 'Connecting to notification stream…'}
          {streamStatus === 'offline' && 'Offline — retrying…'}
        </span>
        {isReadOnly && <span className="px-2 py-0.5 bg-red-500/20 border border-red-500/30 rounded-full text-red-300 font-semibold">READ-ONLY MODE</span>}
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500">Hotel Fountain CRM</h1>
            <p className="text-neutral-400 text-sm mt-1">Logged in as <span className="text-cyan-400 font-medium">{roleLabel}</span></p>
          </div>
          <div className="flex items-center gap-3">
            <RoleSwitcher />
            <NotificationBell notifications={notifications} unreadCount={unreadCount} onNotificationClick={setSelectedNotif} onMarkAllRead={handleMarkAllRead} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Pending Reservations', value: notifications.filter((n) => n.type === 'reservation' && !n.is_read).length, icon: '🏨', color: 'from-cyan-500/20 to-blue-500/20 border-cyan-500/20' },
            { label: 'Unread Notifications', value: unreadCount, icon: '🔔', color: 'from-purple-500/20 to-pink-500/20 border-purple-500/20' },
            { label: 'AI Agents Status', value: permissions.canViewAIAgents ? 'Active' : 'Restricted', icon: '🤖', color: 'from-emerald-500/20 to-teal-500/20 border-emerald-500/20' },
            { label: 'B2B Partners', value: permissions.canViewB2BPartners ? 'Accessible' : 'Restricted', icon: '🤝', color: 'from-amber-500/20 to-orange-500/20 border-amber-500/20' },
          ].map((tile) => (
            <div key={tile.label} className={`bg-gradient-to-br ${tile.color} border rounded-2xl p-5`}>
              <div className="text-2xl mb-2">{tile.icon}</div>
              <p className="text-2xl font-bold text-white">{tile.value}</p>
              <p className="text-xs text-neutral-400 mt-1">{tile.label}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 mb-8">
          {[['⚙️ Settings', '/settings'], ['🏨 Book a Room', '/reservation'], ['📋 Leads', '/leads'], ['🚀 Sales Engine', '/']].map(([label, href]) => (
            <a key={href} href={href} className="px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm text-white transition-all">{label}</a>
          ))}
        </div>

        <div className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
            <h2 className="font-semibold text-white">Recent Activity</h2>
            {unreadCount > 0 && <span className="px-2.5 py-0.5 bg-red-500/20 text-red-300 text-xs rounded-full border border-red-500/20">{unreadCount} unread</span>}
          </div>
          <div className="divide-y divide-white/5">
            {notifications.length === 0 && <p className="text-center text-neutral-500 text-sm py-10">No notifications yet. They will appear when guests submit reservations.</p>}
            {notifications.map((n) => (
              <button key={n.id} onClick={() => setSelectedNotif(n)} className={`w-full text-left flex items-start gap-4 px-6 py-4 hover:bg-white/5 transition-colors ${!n.is_read ? 'border-l-4 border-cyan-500' : 'border-l-4 border-transparent'}`}>
                <span className="text-xl mt-0.5">{n.type === 'reservation' ? '🏨' : '🔔'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-semibold ${!n.is_read ? 'text-white' : 'text-neutral-400'}`}>{n.title}</p>
                    {!n.is_read && <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-300 text-[10px] rounded-full">NEW</span>}
                  </div>
                  <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2">{n.message}</p>
                </div>
                <p className="text-xs text-neutral-600 shrink-0 mt-0.5">{n.created_at ? new Date(n.created_at).toLocaleDateString() : '—'}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {selectedNotif && <ReservationModal notification={selectedNotif} onClose={() => setSelectedNotif(null)} onConfirmed={fetchNotifications} />}
    </div>
  );
}
