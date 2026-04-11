'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const SB_URL = 'https://mynwfkgksqqwlqowlscj.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bndma2drc3Fxd2xxb3dsc2NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4ODc3OTMsImV4cCI6MjA4NTQ2Mzc5M30.J6-Oc_oAoPDUAytj03e8wh50lIHLIXzmFhuwizTRiow';
const supabase = createClient(SB_URL, SB_KEY);

const ROOMS = [
  { id:'standard', type:'Standard', category:'Standard', name:'Standard Room',
    desc:'Comfortable and elegantly furnished with all modern amenities. Queen or Twin beds with garden views.',
    rate:4500, amenities:['High-Speed WiFi','Air Conditioning','Smart TV','En-Suite Bath'],
    gradient:'linear-gradient(135deg,#0D1117 0%,#131B26 100%)', supabaseType:'Standard' },
  { id:'deluxe', type:'Deluxe', category:'Fountain Deluxe', name:'Fountain Deluxe',
    desc:'Spacious rooms with premium King beds, stunning pool views and curated minibar selections.',
    rate:8500, amenities:['High-Speed WiFi','Minibar','Pool View','Luxury Toiletries'],
    gradient:'linear-gradient(135deg,#131B26 0%,#1f2d40 100%)', supabaseType:'Deluxe' },
  { id:'suite', type:'Suite', category:'Royal Suite', name:'Royal Suite',
    desc:'The pinnacle of luxury — an expansive suite with private lounge, butler service and panoramic views.',
    rate:18000, amenities:['Butler Service','Private Lounge','Spa Access','Airport Transfer'],
    gradient:'linear-gradient(135deg,#1a1508 0%,#2a2010 100%)', supabaseType:'Suite' },
  { id:'presidential', type:'Presidential', category:'Presidential', name:'Presidential Suite',
    desc:'Our crown jewel — ultra-private with panoramic skyline views, dedicated staff and bespoke services.',
    rate:45000, amenities:['Dedicated Concierge','24hr Butler','Private Dining','Spa Suite'],
    gradient:'linear-gradient(135deg,#1a1000 0%,#3a2800 100%)', supabaseType:'Presidential' },
];

const fmt = (d: Date) => d.toISOString().split('T')[0];

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Geist:wght@200;300;400;500&display=swap');
  :root { --gold:#C8A96E; --gold2:#E0C585; --dark:#07090E; --dark2:#0D1117; --dark3:#131B26; --tx:#EEE9E2; --tx2:#C8BFB0; --tx3:#9A907C; --br:rgba(200,169,110,.15); }
  html { scroll-behavior:smooth; }
  body { background:var(--dark); color:var(--tx); overflow-x:hidden; }
  .cg { font-family:'Cormorant Garamond',Georgia,serif; }
  .gs { font-family:'Geist',var(--font-geist-sans),system-ui,sans-serif; }
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
  @keyframes fadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
  .apd { animation:pulse 2s infinite; }
  .afi { animation:fadeIn .5s ease forwards; }
  .gc { background:rgba(13,17,23,.75); backdrop-filter:blur(16px); border:1px solid var(--br); }
  .gb { background:var(--gold); color:var(--dark); font-family:'Geist',sans-serif; font-size:10px; letter-spacing:.2em; text-transform:uppercase; padding:13px 32px; border:none; cursor:pointer; transition:all .3s; font-weight:500; }
  .gb:hover { background:var(--gold2); transform:translateY(-1px); }
  .gb:disabled { opacity:.5; cursor:not-allowed; transform:none; }
  .ob { background:transparent; color:var(--tx); font-family:'Geist',sans-serif; font-size:10px; letter-spacing:.2em; text-transform:uppercase; padding:13px 32px; border:1px solid rgba(238,233,226,.25); cursor:pointer; transition:all .3s; }
  .ob:hover { border-color:var(--gold); color:var(--gold); }
  .fi { background:var(--dark); border:1px solid rgba(200,169,110,.2); color:var(--tx); font-family:'Geist',sans-serif; font-size:13px; padding:12px 14px; outline:none; transition:border-color .3s; width:100%; }
  .fi:focus { border-color:var(--gold); }
  .fi option { background:var(--dark); }
  .rc { transition:transform .4s,box-shadow .4s; cursor:pointer; }
  .rc:hover { transform:translateY(-6px); box-shadow:0 20px 60px rgba(200,169,110,.12); }
  .ef { padding:24px; border:1px solid var(--br); background:rgba(200,169,110,.03); transition:border-color .3s,background .3s; }
  .ef:hover { border-color:rgba(200,169,110,.35); background:rgba(200,169,110,.06); }
  .st { font-size:9px; letter-spacing:.25em; text-transform:uppercase; color:var(--gold); margin-bottom:16px; display:flex; align-items:center; gap:12px; }
  .st::before { content:''; width:24px; height:1px; background:var(--gold); }
  .mo { position:fixed; inset:0; background:rgba(7,9,14,.92); z-index:300; display:flex; align-items:center; justify-content:center; }
  input[type="date"]::-webkit-calendar-picker-indicator { filter:invert(.5) sepia(1) saturate(2) hue-rotate(10deg); }
  ::-webkit-scrollbar{width:6px} ::-webkit-scrollbar-track{background:var(--dark2)} ::-webkit-scrollbar-thumb{background:var(--br);border-radius:3px} ::-webkit-scrollbar-thumb:hover{background:var(--gold)}
  @media(max-width:768px){
    .hero-grid{grid-template-columns:1fr!important}
    .hero-right-panel{display:none!important}
    .hero-left-panel{padding:120px 24px 60px!important}
    .stats-bar{padding:20px 24px!important;flex-wrap:wrap;gap:16px}
    .rooms-grid{grid-template-columns:1fr!important}
    .exp-grid{grid-template-columns:1fr!important}
    .exp-visual{display:none!important}
    .avail-grid{grid-template-columns:1fr 1fr!important}
    .contact-grid{grid-template-columns:1fr!important}
    .sec{padding:70px 24px!important}
    .nav-links{display:none!important}
    .mobile-menu-btn{display:flex!important}
    footer{flex-direction:column!important;gap:16px!important;text-align:center!important;padding:24px!important}
  }
`;

export default function HotelFountainLanding() {
  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);

  const [availCount, setAvailCount] = useState<number | null>(null);
  const [checkIn, setCheckIn] = useState(fmt(today));
  const [checkOut, setCheckOut] = useState(fmt(tomorrow));
  const [roomType, setRoomType] = useState('');
  const [guests, setGuests] = useState('2 Guests');
  const [searching, setSearching] = useState(false);
  const [availResult, setAvailResult] = useState<{ rooms: any[]; error?: string } | null>(null);
  const [bookingModal, setBookingModal] = useState<{ open:boolean; room:any|null }>({ open:false, room:null });
  const [bookForm, setBookForm] = useState({ name:'', email:'', phone:'' });
  const [bookStatus, setBookStatus] = useState<'idle'|'sending'|'success'>('idle');
  const [loginModal, setLoginModal] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [navScrolled, setNavScrolled] = useState(false);

  useEffect(() => {
    async function fetchCount() {
      try {
        const { data } = await supabase.from('rooms').select('id').eq('status', 'available');
        if (data) setAvailCount(data.length);
      } catch {}
    }
    fetchCount();
    const onScroll = () => setNavScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  async function checkAvailability() {
    if (!checkIn || !checkOut) { setAvailResult({ rooms:[], error:'Please select check-in and check-out dates.' }); return; }
    if (new Date(checkOut) <= new Date(checkIn)) { setAvailResult({ rooms:[], error:'Check-out must be after check-in.' }); return; }
    setSearching(true); setAvailResult(null);
    try {
      let q = supabase.from('rooms').select('*').eq('status', 'available');
      if (roomType) q = q.eq('type', roomType);
      const { data, error } = await q;
      if (error) throw error;
      const results = data && data.length > 0 ? data : ROOMS.filter(r => !roomType || r.supabaseType === roomType);
      setAvailResult({ rooms: results });
    } catch {
      setAvailResult({ rooms: ROOMS.filter(r => !roomType || r.supabaseType === roomType) });
    } finally { setSearching(false); }
  }

  async function submitBooking() {
    if (!bookForm.name || !bookForm.email) return;
    setBookStatus('sending');
    try {
      await supabase.from('reservations').insert([{
        guest_name: bookForm.name, email: bookForm.email, phone: bookForm.phone,
        room_type: bookingModal.room?.supabaseType, room_id: bookingModal.room?.id,
        check_in: checkIn, check_out: checkOut, guests, status:'pending', source:'Direct Web',
        created_at: new Date().toISOString(),
      }]);
    } catch {}
    setBookStatus('success');
  }

  const scrollTo = (id: string) => { document.getElementById(id)?.scrollIntoView({ behavior:'smooth', block:'start' }); setMobileMenu(false); };
  const glow = { boxShadow:'0 0 32px rgba(200,169,110,.25),0 4px 16px rgba(0,0,0,.4)' };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* NAV */}
      <nav className="gs" style={{ position:'fixed', top:0, left:0, right:0, zIndex:100, display:'flex', justifyContent:'space-between', alignItems:'center', padding:'20px 60px', background: navScrolled ? 'rgba(7,9,14,.97)' : 'linear-gradient(180deg,rgba(7,9,14,.95) 0%,transparent 100%)', borderBottom:`1px solid ${navScrolled ? 'rgba(200,169,110,.15)' : 'rgba(200,169,110,.06)'}`, transition:'all .4s' }}>
        <div className="cg" style={{ fontSize:20, color:'var(--tx)', fontWeight:400, letterSpacing:'.04em' }}>Hotel <em style={{ color:'var(--gold)', fontStyle:'italic' }}>Fountain</em></div>
        <div className="nav-links" style={{ display:'flex', alignItems:'center', gap:40 }}>
          {['Rooms','Experience','Availability','Contact'].map(l => (
            <button key={l} onClick={() => scrollTo(l.toLowerCase())} style={{ background:'none', border:'none', color:'var(--tx2)', fontSize:10, letterSpacing:'.2em', textTransform:'uppercase', cursor:'pointer', transition:'color .3s' }} onMouseOver={e=>(e.currentTarget.style.color='var(--gold)')} onMouseOut={e=>(e.currentTarget.style.color='var(--tx2)')}>{l}</button>
          ))}
          <button className="ob" style={{ padding:'9px 22px', fontSize:10 }} onClick={() => setLoginModal(true)}>Staff Login</button>
        </div>
        <button className="mobile-menu-btn" onClick={() => setMobileMenu(!mobileMenu)} style={{ display:'none', background:'none', border:'1px solid var(--br)', color:'var(--tx)', padding:'8px 12px', cursor:'pointer', fontSize:16 }}>☰</button>
      </nav>

      {mobileMenu && (
        <div className="gs" style={{ position:'fixed', top:64, left:0, right:0, zIndex:99, background:'rgba(7,9,14,.98)', borderBottom:'1px solid var(--br)', padding:'20px 24px', display:'flex', flexDirection:'column', gap:16 }}>
          {['Rooms','Experience','Availability','Contact'].map(l => (
            <button key={l} onClick={() => scrollTo(l.toLowerCase())} style={{ background:'none', border:'none', color:'var(--tx2)', fontSize:11, letterSpacing:'.18em', textTransform:'uppercase', cursor:'pointer', textAlign:'left' }}>{l}</button>
          ))}
          <button className="gb" onClick={() => { setLoginModal(true); setMobileMenu(false); }}>Staff Login</button>
        </div>
      )}

      {/* HERO */}
      <section id="home" className="hero-grid" style={{ minHeight:'100vh', display:'grid', gridTemplateColumns:'1fr 1fr', position:'relative', overflow:'hidden' }}>
        <div className="hero-left-panel" style={{ display:'flex', flexDirection:'column', justifyContent:'center', padding:'140px 60px 80px', position:'relative', zIndex:2 }}>
          <div style={{ display:'inline-flex', alignItems:'center', gap:8, background:'rgba(200,169,110,.1)', border:'1px solid rgba(200,169,110,.25)', padding:'7px 14px', marginBottom:32, width:'fit-content' }}>
            <div className="apd" style={{ width:7, height:7, borderRadius:'50%', background:'#3FB950', boxShadow:'0 0 8px #3FB950' }} />
            <span className="gs" style={{ fontSize:9, letterSpacing:'.2em', textTransform:'uppercase', color:'var(--tx2)' }}>
              <strong style={{ color:'var(--gold)', fontWeight:400 }}>{availCount ?? '—'}</strong>&nbsp; Available Rooms Tonight
            </span>
          </div>
          <div className="gs" style={{ fontSize:9, letterSpacing:'.25em', textTransform:'uppercase', color:'var(--tx3)', marginBottom:20, display:'flex', alignItems:'center', gap:16 }}>
            <span style={{ display:'block', width:32, height:1, background:'var(--gold)', opacity:.5 }} />
            Dhaka, Bangladesh &nbsp;·&nbsp; Est. Since
          </div>
          <h1 className="cg" style={{ fontSize:'clamp(52px,6vw,88px)', lineHeight:1, fontWeight:300, color:'var(--tx)', marginBottom:24 }}>
            Hotel<br /><em style={{ color:'var(--gold)', fontStyle:'italic', fontWeight:300 }}>Fountain</em>
          </h1>
          <div className="gs" style={{ fontSize:9, letterSpacing:'.3em', textTransform:'uppercase', color:'var(--tx3)', marginBottom:28 }}>Where Every Stay Becomes a Memory</div>
          <p className="gs" style={{ fontSize:14, lineHeight:1.8, color:'var(--tx2)', maxWidth:420, marginBottom:48, fontWeight:300 }}>
            Nestled in the heart of Dhaka, Hotel Fountain offers a sanctuary of refined comfort — from our signature Fountain Deluxe rooms to the magnificent Royal Suite.
          </p>
          <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
            <button className="gb" onClick={() => scrollTo('rooms')}>Explore Rooms</button>
            <button className="ob" onClick={() => scrollTo('availability')}>Check Availability</button>
          </div>
        </div>
        <div className="hero-right-panel" style={{ position:'relative', overflow:'hidden' }}>
          <div style={{ width:'100%', height:'100%', background:'linear-gradient(135deg,#0D1117 0%,#131B26 40%,#1a2435 100%)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <span className="cg" style={{ fontSize:56, color:'rgba(200,169,110,.12)', fontStyle:'italic', fontWeight:300, textAlign:'center' }}>Hotel<br />Fountain</span>
          </div>
          <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse at 60% 50%,rgba(200,169,110,.08) 0%,transparent 70%)', pointerEvents:'none' }} />
          <div style={{ position:'absolute', inset:0, background:'linear-gradient(90deg,var(--dark) 0%,transparent 30%)', zIndex:1, pointerEvents:'none' }} />
        </div>
        <div style={{ position:'absolute', bottom:0, left:0, right:0, height:120, background:'linear-gradient(transparent,var(--dark))', pointerEvents:'none', zIndex:3 }} />
      </section>

      {/* STATS BAR */}
      <div className="gs stats-bar" style={{ background:'var(--dark2)', borderTop:'1px solid var(--br)', borderBottom:'1px solid var(--br)', padding:'28px 60px', display:'flex', flexWrap:'wrap' }}>
        {[{num:'48',lbl:'Premium Rooms'},{num:'৳4,500',lbl:'Starting Rate / Night'},{num:'24/7',lbl:'Concierge Service'},{num:'4.8★',lbl:'Guest Rating'}].map((s,i,a) => (
          <div key={s.lbl} style={{ flex:1, minWidth:140, padding:'0 32px', borderRight:i<a.length-1?'1px solid var(--br)':'none', textAlign:'center' }}>
            <div className="cg" style={{ fontSize:36, color:'var(--gold)', fontWeight:300, lineHeight:1 }}>{s.num}</div>
            <div style={{ fontSize:9, letterSpacing:'.18em', textTransform:'uppercase', color:'var(--tx3)', marginTop:6 }}>{s.lbl}</div>
          </div>
        ))}
      </div>

      {/* ROOMS */}
      <section id="rooms" className="sec" style={{ padding:'100px 60px', background:'var(--dark)' }}>
        <div className="st gs">Accommodations</div>
        <h2 className="cg" style={{ fontSize:'clamp(36px,4vw,52px)', fontWeight:300, color:'var(--tx)', lineHeight:1.15, marginBottom:20 }}>
          Our <em style={{ color:'var(--gold)', fontStyle:'italic' }}>Rooms</em> & Suites
        </h2>
        <p className="gs" style={{ fontSize:14, lineHeight:1.8, color:'var(--tx2)', maxWidth:520, fontWeight:300, marginBottom:60 }}>
          Every room is designed with meticulous attention to comfort and elegance. Choose from our curated collection of premium accommodations.
        </p>
        <div className="rooms-grid" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:1, background:'rgba(200,169,110,.08)' }}>
          {ROOMS.map(room => (
            <div key={room.id} className="rc" style={{ background:'var(--dark2)', overflow:'hidden' }}>
              <div style={{ height:220, background:room.gradient, position:'relative', overflow:'hidden' }}>
                <div style={{ position:'absolute', inset:0, background:'linear-gradient(180deg,transparent 40%,rgba(7,9,14,.85) 100%)' }} />
                <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse at 30% 40%,rgba(200,169,110,.07) 0%,transparent 70%)' }} />
                <div className="gs" style={{ position:'absolute', top:16, left:16, fontSize:8, letterSpacing:'.2em', textTransform:'uppercase', background:'rgba(200,169,110,.15)', border:'1px solid rgba(200,169,110,.3)', color:'var(--gold)', padding:'5px 10px' }}>{room.category}</div>
                <div className="cg" style={{ position:'absolute', bottom:16, left:16, right:16, fontSize:28, color:'rgba(200,169,110,.13)', fontStyle:'italic', lineHeight:1 }}>{room.name}</div>
              </div>
              <div style={{ padding:24 }}>
                <div className="cg" style={{ fontSize:22, color:'var(--tx)', fontWeight:400, marginBottom:8 }}>{room.name}</div>
                <p className="gs" style={{ fontSize:12, lineHeight:1.7, color:'var(--tx2)', marginBottom:16, fontWeight:300 }}>{room.desc}</p>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:20 }}>
                  {room.amenities.map(a => (
                    <span key={a} className="gs" style={{ fontSize:9, color:'var(--tx3)', letterSpacing:'.08em', background:'rgba(200,169,110,.06)', border:'1px solid rgba(200,169,110,.12)', padding:'3px 8px' }}>{a}</span>
                  ))}
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', paddingTop:16, borderTop:'1px solid var(--br)' }}>
                  <div>
                    <div className="gs" style={{ fontSize:9, letterSpacing:'.15em', textTransform:'uppercase', color:'var(--tx3)', marginBottom:4 }}>Starting from</div>
                    <div className="cg" style={{ fontSize:26, color:'var(--gold)', fontWeight:300 }}>
                      ৳{room.rate.toLocaleString()} <span className="gs" style={{ fontSize:10, color:'var(--tx3)', letterSpacing:'.1em', fontWeight:300 }}>/ night</span>
                    </div>
                  </div>
                  <button className="gb" style={{ padding:'10px 20px', fontSize:9 }} onClick={() => { setBookingModal({ open:true, room }); setBookStatus('idle'); setBookForm({ name:'', email:'', phone:'' }); }}>Book Now</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* EXPERIENCE */}
      <section id="experience" className="sec" style={{ padding:'100px 60px', background:'var(--dark2)' }}>
        <div className="st gs">The Experience</div>
        <div className="exp-grid" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:60, alignItems:'center' }}>
          <div>
            <h2 className="cg" style={{ fontSize:'clamp(36px,4vw,52px)', fontWeight:300, color:'var(--tx)', lineHeight:1.15, marginBottom:20 }}>
              More Than<br />a <em style={{ color:'var(--gold)', fontStyle:'italic' }}>Stay</em>
            </h2>
            <p className="gs" style={{ fontSize:14, lineHeight:1.8, color:'var(--tx2)', maxWidth:460, fontWeight:300, marginBottom:40 }}>
              From our rooftop restaurant to the business center, every facility is crafted to exceed expectations.
            </p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
              {[
                { icon:'🍽️', title:'Restaurant', desc:'Authentic Bangladeshi and international cuisine, 7am–11pm.' },
                { icon:'💼', title:'Business Center', desc:'Fully-equipped conference rooms and private offices.' },
                { icon:'🚗', title:'Airport Transfer', desc:'Complimentary pickup and drop-off for suite guests.' },
                { icon:'🌐', title:'High-Speed WiFi', desc:'Fiber-optic internet throughout the entire property.' },
              ].map(f => (
                <div key={f.title} className="ef">
                  <div style={{ fontSize:24, marginBottom:12 }}>{f.icon}</div>
                  <div className="gs" style={{ fontSize:13, fontWeight:500, color:'var(--tx)', marginBottom:6, letterSpacing:'.04em' }}>{f.title}</div>
                  <div className="gs" style={{ fontSize:11, lineHeight:1.7, color:'var(--tx2)', fontWeight:300 }}>{f.desc}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="exp-visual" style={{ height:480, background:'linear-gradient(135deg,#0D1117,#1a2435)', position:'relative', overflow:'hidden', border:'1px solid var(--br)' }}>
            <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse at 30% 60%,rgba(200,169,110,.08) 0%,transparent 70%)' }} />
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <span className="cg" style={{ fontSize:48, color:'rgba(200,169,110,.1)', fontStyle:'italic', textAlign:'center', lineHeight:1.3 }}>Crafted for<br />the Discerning</span>
            </div>
            <div style={{ position:'absolute', top:32, right:32, width:60, height:1, background:'var(--gold)', opacity:.3 }} />
            <div style={{ position:'absolute', bottom:32, left:32, width:60, height:1, background:'var(--gold)', opacity:.3 }} />
          </div>
        </div>
      </section>

      {/* AVAILABILITY */}
      <section id="availability" className="sec" style={{ padding:'100px 60px', background:'var(--dark)', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse at 50% 100%,rgba(200,169,110,.06) 0%,transparent 70%)', pointerEvents:'none' }} />
        <div className="st gs">Book Your Stay</div>
        <h2 className="cg" style={{ fontSize:'clamp(36px,4vw,52px)', fontWeight:300, color:'var(--tx)', lineHeight:1.15, marginBottom:16 }}>
          Check <em style={{ color:'var(--gold)', fontStyle:'italic' }}>Availability</em>
        </h2>
        <p className="gs" style={{ fontSize:14, lineHeight:1.8, color:'var(--tx2)', maxWidth:520, fontWeight:300, marginBottom:48 }}>
          Select your dates and preferred room type. We'll show you real-time availability from our rooms database.
        </p>
        <div className="gc" style={{ maxWidth:860, padding:48, position:'relative', zIndex:1 }}>
          <div className="avail-grid" style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:20, marginBottom:32 }}>
            {[
              { label:'Check-In', el: <input type="date" className="fi gs" value={checkIn} onChange={e=>setCheckIn(e.target.value)} /> },
              { label:'Check-Out', el: <input type="date" className="fi gs" value={checkOut} onChange={e=>setCheckOut(e.target.value)} /> },
              { label:'Room Type', el: <select className="fi gs" value={roomType} onChange={e=>setRoomType(e.target.value)}><option value="">Any Room</option><option value="Standard">Standard</option><option value="Deluxe">Deluxe</option><option value="Suite">Suite</option><option value="Presidential">Presidential</option></select> },
              { label:'Guests', el: <select className="fi gs" value={guests} onChange={e=>setGuests(e.target.value)}><option>1 Guest</option><option>2 Guests</option><option>3 Guests</option><option>4+ Guests</option></select> },
            ].map(({ label, el }) => (
              <div key={label} style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <label className="gs" style={{ fontSize:9, letterSpacing:'.2em', textTransform:'uppercase', color:'var(--tx3)' }}>{label}</label>
                {el}
              </div>
            ))}
          </div>
          <button className="gb" disabled={searching} onClick={checkAvailability} style={{ width:'100%', padding:15, fontSize:11, letterSpacing:'.25em', ...glow }}>
            {searching ? 'Searching Availability…' : 'Check Availability →'}
          </button>
          {availResult && (
            <div className="afi" style={{ marginTop:32 }}>
              {availResult.error ? (
                <div className="gs" style={{ padding:16, background:'rgba(224,92,122,.08)', border:'1px solid rgba(224,92,122,.2)', color:'#E05C7A', fontSize:13 }}>{availResult.error}</div>
              ) : availResult.rooms.length === 0 ? (
                <div className="gs" style={{ padding:16, background:'rgba(200,169,110,.06)', border:'1px solid var(--br)', color:'var(--tx2)', fontSize:13 }}>No rooms available for selected dates. Please try different dates or room type.</div>
              ) : (
                <div>
                  <div className="gs" style={{ fontSize:9, letterSpacing:'.2em', textTransform:'uppercase', color:'var(--gold)', marginBottom:20 }}>{availResult.rooms.length} Room{availResult.rooms.length!==1?'s':''} Available</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:12 }}>
                    {availResult.rooms.map((r: any, i: number) => {
                      const cat = ROOMS.find(rm => rm.supabaseType === (r.type || r.supabaseType)) || ROOMS[0];
                      return (
                        <div key={r.id||i} style={{ padding:16, background:'rgba(200,169,110,.04)', border:'1px solid var(--br)', display:'flex', flexDirection:'column', gap:8 }}>
                          <div className="cg" style={{ fontSize:18, color:'var(--tx)' }}>{r.name||cat.name}</div>
                          <div className="gs" style={{ fontSize:9, color:'var(--tx3)', letterSpacing:'.1em', textTransform:'uppercase' }}>Room {r.id||'—'}</div>
                          <div className="cg" style={{ fontSize:20, color:'var(--gold)' }}>৳{(r.rate||cat.rate).toLocaleString()} <span className="gs" style={{ fontSize:10, color:'var(--tx3)' }}>/night</span></div>
                          <button className="gb" style={{ padding:'9px 0', fontSize:9, marginTop:4 }} onClick={() => { setBookingModal({ open:true, room:{...cat,...r} }); setBookStatus('idle'); setBookForm({ name:'', email:'', phone:'' }); }}>Book This Room</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" className="sec" style={{ padding:'100px 60px', background:'var(--dark2)', borderTop:'1px solid var(--br)' }}>
        <div className="st gs">Contact Us</div>
        <h2 className="cg" style={{ fontSize:'clamp(36px,4vw,52px)', fontWeight:300, color:'var(--tx)', lineHeight:1.15, marginBottom:60 }}>
          Get in <em style={{ color:'var(--gold)', fontStyle:'italic' }}>Touch</em>
        </h2>
        <div className="contact-grid" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:80 }}>
          <div style={{ display:'flex', flexDirection:'column', gap:32 }}>
            {[
              { label:'Address', val:'Hotel Fountain\nDhaka, Bangladesh' },
              { label:'Phone', val:'+880 — — —' },
              { label:'Email', val:'hotellfountainbd@gmail.com' },
              { label:'Hours', val:'Front Desk: 24/7\nRestaurant: 7:00 AM – 11:00 PM\nCheck-In: 2:00 PM · Check-Out: 12:00 PM' },
            ].map(item => (
              <div key={item.label}>
                <div className="gs" style={{ fontSize:9, letterSpacing:'.2em', textTransform:'uppercase', color:'var(--gold)', marginBottom:8 }}>{item.label}</div>
                <div className="gs" style={{ fontSize:14, color:'var(--tx)', fontWeight:300, lineHeight:1.7, whiteSpace:'pre-line' }}>{item.val}</div>
              </div>
            ))}
          </div>
          <form onSubmit={e=>e.preventDefault()} style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <input type="text" placeholder="Full Name" className="fi gs" style={{ background:'rgba(200,169,110,.04)' }} />
            <input type="email" placeholder="Email Address" className="fi gs" style={{ background:'rgba(200,169,110,.04)' }} />
            <input type="tel" placeholder="Phone Number" className="fi gs" style={{ background:'rgba(200,169,110,.04)' }} />
            <textarea placeholder="Message or special request…" className="fi gs" style={{ height:120, resize:'none', background:'rgba(200,169,110,.04)' }} />
            <button type="submit" className="ob gs" style={{ alignSelf:'flex-start' }}>Send Message →</button>
          </form>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="gs" style={{ background:'var(--dark)', borderTop:'1px solid var(--br)', padding:'32px 60px', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:16 }}>
        <div className="cg" style={{ fontSize:17, color:'var(--tx)', fontWeight:400 }}>Hotel <em style={{ color:'var(--gold)', fontStyle:'italic' }}>Fountain</em></div>
        <div style={{ fontSize:10, color:'var(--tx3)', letterSpacing:'.12em' }}>© 2026 Hotel Fountain · Dhaka, Bangladesh · All Rights Reserved</div>
        <div style={{ display:'flex', gap:28 }}>
          {['Rooms','Experience','Contact'].map(l => (
            <button key={l} onClick={() => scrollTo(l.toLowerCase())} style={{ background:'none', border:'none', fontSize:10, color:'var(--tx3)', letterSpacing:'.14em', textTransform:'uppercase', cursor:'pointer', transition:'color .3s' }} onMouseOver={e=>(e.currentTarget.style.color='var(--gold)')} onMouseOut={e=>(e.currentTarget.style.color='var(--tx3)')}>{l}</button>
          ))}
          <button onClick={() => setLoginModal(true)} style={{ background:'none', border:'none', fontSize:10, color:'var(--tx3)', letterSpacing:'.14em', textTransform:'uppercase', cursor:'pointer', transition:'color .3s' }} onMouseOver={e=>(e.currentTarget.style.color='var(--gold)')} onMouseOut={e=>(e.currentTarget.style.color='var(--tx3)')}>Staff</button>
        </div>
      </footer>

      {/* BOOKING MODAL */}
      {bookingModal.open && (
        <div className="mo" onClick={e=>{ if(e.target===e.currentTarget) setBookingModal({open:false,room:null}); }}>
          <div className="gc afi" style={{ width:'100%', maxWidth:480, padding:48, position:'relative' }}>
            <button onClick={() => setBookingModal({open:false,room:null})} style={{ position:'absolute', top:16, right:20, background:'none', border:'none', color:'var(--tx3)', fontSize:20, cursor:'pointer' }}>✕</button>
            {bookStatus === 'success' ? (
              <div className="afi" style={{ textAlign:'center', padding:'20px 0' }}>
                <div style={{ fontSize:40, marginBottom:16, color:'var(--gold)' }}>✦</div>
                <h3 className="cg" style={{ fontSize:32, color:'var(--tx)', fontWeight:300, marginBottom:12 }}>Reservation Received</h3>
                <p className="gs" style={{ fontSize:13, color:'var(--tx2)', lineHeight:1.7, fontWeight:300 }}>
                  Thank you, <strong style={{ color:'var(--gold)', fontWeight:400 }}>{bookForm.name}</strong>.<br />
                  Our team will confirm your <strong style={{ color:'var(--gold)', fontWeight:400 }}>{bookingModal.room?.name}</strong> booking<br />from {checkIn} to {checkOut} within 2 hours.
                </p>
                <button className="gb" style={{ marginTop:28 }} onClick={() => setBookingModal({open:false,room:null})}>Close</button>
              </div>
            ) : (
              <>
                <div className="cg" style={{ fontSize:28, color:'var(--tx)', fontWeight:300, marginBottom:4 }}>Book Your Stay</div>
                <div className="gs" style={{ fontSize:11, color:'var(--tx3)', letterSpacing:'.1em', marginBottom:8 }}>{bookingModal.room?.name}</div>
                <div className="gs" style={{ fontSize:9, color:'var(--gold)', letterSpacing:'.15em', textTransform:'uppercase', marginBottom:28, paddingBottom:20, borderBottom:'1px solid var(--br)' }}>
                  {checkIn} → {checkOut} · {guests} · ৳{(bookingModal.room?.rate||0).toLocaleString()}/night
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                  {[
                    { label:'Full Name *', type:'text', key:'name', ph:'Your full name' },
                    { label:'Email Address *', type:'email', key:'email', ph:'your@email.com' },
                    { label:'Phone Number', type:'tel', key:'phone', ph:'+880 — — —' },
                  ].map(f => (
                    <div key={f.key} style={{ display:'flex', flexDirection:'column', gap:6 }}>
                      <label className="gs" style={{ fontSize:9, letterSpacing:'.2em', textTransform:'uppercase', color:'var(--tx3)' }}>{f.label}</label>
                      <input type={f.type} className="fi gs" placeholder={f.ph} value={(bookForm as any)[f.key]} onChange={e=>setBookForm(p=>({...p,[f.key]:e.target.value}))} />
                    </div>
                  ))}
                </div>
                <button className="gb" disabled={bookStatus==='sending'||!bookForm.name||!bookForm.email} style={{ width:'100%', padding:15, marginTop:28, fontSize:10, ...glow }} onClick={submitBooking}>
                  {bookStatus==='sending' ? 'Submitting…' : 'Confirm Reservation →'}
                </button>
                <p className="gs" style={{ fontSize:10, color:'var(--tx3)', textAlign:'center', marginTop:12 }}>No payment required now · Our team will contact you to confirm</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* STAFF LOGIN MODAL */}
      {loginModal && (
        <div className="mo" onClick={e=>{ if(e.target===e.currentTarget) setLoginModal(false); }}>
          <div className="gc afi" style={{ width:'100%', maxWidth:420, padding:48, position:'relative' }}>
            <button onClick={() => setLoginModal(false)} style={{ position:'absolute', top:16, right:20, background:'none', border:'none', color:'var(--tx3)', fontSize:20, cursor:'pointer' }}>✕</button>
            <div className="cg" style={{ fontSize:28, color:'var(--tx)', fontWeight:300, marginBottom:6 }}>Staff Login</div>
            <div className="gs" style={{ fontSize:11, color:'var(--tx3)', letterSpacing:'.1em', marginBottom:36 }}>Lumea · Hotel Fountain CRM</div>
            <input type="email" placeholder="Staff Email" className="fi gs" style={{ marginBottom:14 }} />
            <input type="password" placeholder="Password" className="fi gs" style={{ marginBottom:8 }} />
            <button className="gb" style={{ width:'100%', padding:14, marginTop:8 }} onClick={() => window.location.href='/dashboard'}>Access CRM →</button>
            <p className="gs" style={{ fontSize:10, color:'var(--tx3)', textAlign:'center', marginTop:16 }}>Authorised staff only</p>
          </div>
        </div>
      )}
    </>
  );
}
