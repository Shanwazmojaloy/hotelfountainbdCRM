'use client';

import { useState, useMemo } from 'react';
import { ROOM_CATEGORIES, RoomCategory } from '@/types';

function RoomCard({ room, selected, onClick }: { room: RoomCategory; selected: boolean; onClick: () => void }) {
  const icons: Record<string, string> = { 'Fountain Deluxe': '🌊', 'Fountain Executive': '⭐', 'Fountain Standard': '🏨', 'Fountain Suite': '👑' };

  return (
    <button onClick={onClick} className={`w-full text-left p-5 rounded-2xl border transition-all duration-200 ${selected ? 'bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border-cyan-400/60 shadow-lg shadow-cyan-500/10' : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{icons[room.name] ?? '🛏️'}</span>
          <div>
            <h3 className={`font-bold text-base ${selected ? 'text-cyan-300' : 'text-white'}`}>{room.name}</h3>
            <p className="text-xs text-neutral-400 mt-0.5">Up to {room.max_guests} guest{room.max_guests > 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="text-right shrink-0 ml-3">
          <p className={`text-xl font-extrabold ${selected ? 'text-cyan-300' : 'text-white'}`}>Tk. {room.rate_per_night.toLocaleString()}</p>
          <p className="text-xs text-neutral-500">per night</p>
        </div>
      </div>
      <p className="text-sm text-neutral-400 mb-3">{room.description}</p>
      <div className="flex flex-wrap gap-1.5">
        {room.amenities?.map((a) => (
          <span key={a} className="px-2 py-0.5 bg-white/5 border border-white/10 rounded-full text-[10px] text-neutral-400">{a}</span>
        ))}
      </div>
      {selected && <div className="mt-3 text-xs text-cyan-400 font-semibold flex items-center gap-1">✓ Selected</div>}
    </button>
  );
}

export default function ReservationPage() {
  const [selectedRoom, setSelectedRoom] = useState<RoomCategory | null>(null);
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [numGuests, setNumGuests] = useState(1);
  const [specialRequests, setSpecialRequests] = useState('');
  const [step, setStep] = useState<'select' | 'form' | 'success'>('select');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().split('T')[0];
  const nights = useMemo(() => {
    if (!checkIn || !checkOut) return 0;
    return Math.max(0, Math.ceil((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60 * 60 * 24)));
  }, [checkIn, checkOut]);
  const totalAmount = selectedRoom ? nights * selectedRoom.rate_per_night : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoom) { setError('Please select a room.'); return; }
    if (nights <= 0) { setError('Check-out must be after check-in.'); return; }
    if (numGuests > selectedRoom.max_guests) { setError(`${selectedRoom.name} allows max ${selectedRoom.max_guests} guests.`); return; }
    setSubmitting(true); setError(null);
    try {
      const res = await fetch('/api/reservation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guest_name: guestName, guest_email: guestEmail, guest_phone: guestPhone || null, room_category: selectedRoom.name, check_in_date: checkIn, check_out_date: checkOut, num_guests: numGuests, rate_per_night: selectedRoom.rate_per_night, special_requests: specialRequests || null }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Submission failed.');
      setStep('success');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center p-8 backdrop-blur-xl bg-white/5 border border-white/10 rounded-3xl shadow-2xl space-y-5">
          <div className="text-6xl animate-bounce">🎉</div>
          <h2 className="text-2xl font-extrabold text-white">Reservation Submitted!</h2>
          <p className="text-neutral-400 text-sm leading-relaxed">Thank you, <strong className="text-white">{guestName}</strong>! Your <strong className="text-cyan-300">{selectedRoom?.name}</strong> request is received. We'll confirm to <strong className="text-white">{guestEmail}</strong> shortly.</p>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-left space-y-2">
            <div className="flex justify-between"><span className="text-neutral-400">Check-In</span><span className="text-white font-medium">{checkIn}</span></div>
            <div className="flex justify-between"><span className="text-neutral-400">Check-Out</span><span className="text-white font-medium">{checkOut}</span></div>
            <div className="flex justify-between border-t border-white/10 pt-2 mt-2"><span className="text-neutral-400">Estimated Total</span><span className="text-cyan-300 font-bold">Tk. {totalAmount.toLocaleString()}</span></div>
          </div>
          <button onClick={() => { setStep('select'); setSelectedRoom(null); setGuestName(''); setGuestEmail(''); setGuestPhone(''); setCheckIn(''); setCheckOut(''); setNumGuests(1); setSpecialRequests(''); }} className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity">Make Another Reservation</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans relative overflow-hidden">
      <div className="absolute top-0 -left-4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 pointer-events-none" />
      <div className="absolute top-0 -right-4 w-96 h-96 bg-cyan-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 pointer-events-none" />
      <div className="relative z-10 max-w-6xl mx-auto px-4 py-10">
        <header className="text-center mb-10 space-y-3">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-cyan-500/10 border border-cyan-500/20 rounded-full text-cyan-400 text-xs font-semibold mb-2">🏨 Hotel Fountain, Dhaka</div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500">Reserve Your Stay</h1>
          <p className="text-neutral-400 text-base max-w-xl mx-auto">Choose from our premium room categories. All rates per night inclusive of taxes.</p>
        </header>

        <div className="flex items-center justify-center gap-3 mb-8 text-xs">
          {[{ n: 1, label: 'Select Room' }, { n: 2, label: 'Guest Details' }].map(({ n, label }) => (
            <div key={n} className="flex items-center gap-2">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs border ${(step === 'select' && n === 1) || (step === 'form' && n === 2) ? 'bg-cyan-500 border-cyan-500 text-white' : step === 'form' && n === 1 ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white/5 border-white/20 text-neutral-500'}`}>{step === 'form' && n === 1 ? '✓' : n}</span>
              <span className={`${(step === 'select' && n === 1) || (step === 'form' && n === 2) ? 'text-white font-medium' : 'text-neutral-500'}`}>{label}</span>
              {n < 2 && <span className="text-neutral-700 mx-1">—</span>}
            </div>
          ))}
        </div>

        {step === 'select' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {ROOM_CATEGORIES.map((room) => <RoomCard key={room.name} room={room} selected={selectedRoom?.name === room.name} onClick={() => setSelectedRoom(room)} />)}
            </div>
            <div className="flex justify-center">
              <button onClick={() => { if (!selectedRoom) { setError('Please select a room.'); return; } setError(null); setStep('form'); }} disabled={!selectedRoom} className="px-10 py-3.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold rounded-full transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg hover:scale-105 active:scale-95">Continue →</button>
            </div>
            {error && <p className="text-center text-red-400 text-sm">{error}</p>}
          </div>
        )}

        {step === 'form' && selectedRoom && (
          <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-6">
            <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-2xl p-4 flex items-center justify-between">
              <div><p className="text-xs text-neutral-400 mb-0.5">Selected Room</p><p className="font-bold text-white">{selectedRoom.name}</p></div>
              <div className="text-right"><p className="text-xl font-extrabold text-cyan-300">Tk. {selectedRoom.rate_per_night.toLocaleString()}</p><p className="text-xs text-neutral-500">per night</p></div>
              <button type="button" onClick={() => setStep('select')} className="ml-4 text-xs text-neutral-400 hover:text-white underline">Change</button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-neutral-400 mb-1.5">Check-In Date *</label>
                <input type="date" required min={today} value={checkIn} onChange={(e) => { setCheckIn(e.target.value); if (checkOut && e.target.value >= checkOut) setCheckOut(''); }} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500/50 [color-scheme:dark]" />
              </div>
              <div>
                <label className="block text-xs text-neutral-400 mb-1.5">Check-Out Date *</label>
                <input type="date" required min={checkIn || today} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500/50 [color-scheme:dark]" />
              </div>
            </div>

            {nights > 0 && (
              <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl px-4 py-3 flex items-center justify-between text-sm">
                <span className="text-neutral-400">{nights} night{nights > 1 ? 's' : ''} × Tk. {selectedRoom.rate_per_night.toLocaleString()}</span>
                <span className="text-emerald-300 font-bold text-base">= Tk. {totalAmount.toLocaleString()}</span>
              </div>
            )}

            <div>
              <label className="block text-xs text-neutral-400 mb-1.5">Number of Guests * <span className="text-neutral-600">(max {selectedRoom.max_guests})</span></label>
              <select value={numGuests} onChange={(e) => setNumGuests(Number(e.target.value))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500/50 [color-scheme:dark]">
                {Array.from({ length: selectedRoom.max_guests }, (_, i) => i + 1).map((n) => <option key={n} value={n} className="bg-neutral-900">{n} Guest{n > 1 ? 's' : ''}</option>)}
              </select>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-neutral-300 border-b border-white/10 pb-2">Guest Information</h3>
              <div><label className="block text-xs text-neutral-400 mb-1.5">Full Name *</label><input type="text" required value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="e.g. Mohammed Rahman" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-neutral-600 focus:outline-none focus:border-cyan-500/50" /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="block text-xs text-neutral-400 mb-1.5">Email Address *</label><input type="email" required value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="guest@example.com" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-neutral-600 focus:outline-none focus:border-cyan-500/50" /></div>
                <div><label className="block text-xs text-neutral-400 mb-1.5">Phone Number</label><input type="tel" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} placeholder="+880 1XXX-XXXXXX" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-neutral-600 focus:outline-none focus:border-cyan-500/50" /></div>
              </div>
              <div><label className="block text-xs text-neutral-400 mb-1.5">Special Requests</label><textarea rows={3} value={specialRequests} onChange={(e) => setSpecialRequests(e.target.value)} placeholder="Early check-in, dietary requirements…" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-neutral-600 focus:outline-none focus:border-cyan-500/50 resize-none" /></div>
            </div>

            {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">{error}</div>}

            <div className="flex gap-3">
              <button type="button" onClick={() => setStep('select')} className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 font-medium text-sm transition-all">← Back</button>
              <button type="submit" disabled={submitting} className="flex-[2] py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                {submitting ? 'Submitting…' : 'Submit Reservation Request'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
