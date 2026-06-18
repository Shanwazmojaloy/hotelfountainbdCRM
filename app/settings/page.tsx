'use client';

import { useState } from 'react';
import { useRole } from '@/context/RoleContext';
import { getVisibleTabs, SETTINGS_TABS } from '@/lib/roles';
import { UserRole } from '@/types';

function AIAgentsPanel({ readOnly }: { readOnly: boolean }) {
  const agents = [
    { name: 'Agent A – Prospector', status: 'active', description: 'Scours the web for corporate & lodging event leads.', metrics: { leads_today: 12, conversion_rate: '18%' } },
    { name: 'Agent B – Closer', status: 'active', description: 'Sends personalised pitches and stay emails via Gemini.', metrics: { emails_sent: 47, replies: 9 } },
    { name: 'Agent C – Analyst', status: 'active', description: 'Aggregates Check-In/Out data into admin reports.', metrics: { reports_generated: 3, last_run: 'Today 06:00' } },
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">AI Sales Agents</h3>
        {!readOnly && <button className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm rounded-xl font-medium hover:opacity-90 transition-opacity">+ New Agent</button>}
      </div>
      {agents.map((agent) => (
        <div key={agent.name} className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <div className="flex items-start justify-between mb-3">
            <div><h4 className="font-semibold text-white">{agent.name}</h4><p className="text-sm text-neutral-400 mt-0.5">{agent.description}</p></div>
            <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 text-xs rounded-full border border-emerald-500/20 shrink-0 ml-4">● {agent.status}</span>
          </div>
          <div className="flex gap-3 flex-wrap">
            {Object.entries(agent.metrics).map(([k, v]) => (
              <div key={k} className="bg-white/5 rounded-lg px-3 py-1.5 text-xs"><span className="text-neutral-500 capitalize">{k.replace(/_/g, ' ')}: </span><span className="text-cyan-300 font-medium">{v}</span></div>
            ))}
          </div>
          {!readOnly && <div className="flex gap-2 mt-4"><button className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs text-white transition-colors">Configure</button><button className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs text-white transition-colors">Run Now</button><button className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-xs text-red-300 transition-colors">Pause</button></div>}
        </div>
      ))}
    </div>
  );
}

function B2BPartnersPanel({ readOnly }: { readOnly: boolean }) {
  const partners = [
    { name: 'Dhaka Corporate Hub', type: 'Corporate Events', status: 'Active', contact: 'events@dchub.com', revenue: 'Tk. 2,40,000' },
    { name: 'BizTravel BD', type: 'Business Travel', status: 'Active', contact: 'bd@biztravel.com', revenue: 'Tk. 1,80,000' },
    { name: 'Summit Conferences', type: 'Conference Organiser', status: 'Prospect', contact: 'info@summitconf.bd', revenue: '—' },
    { name: 'MedCon Bangladesh', type: 'Medical Conferences', status: 'Active', contact: 'stays@medcon.bd', revenue: 'Tk. 95,000' },
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">B2B Partner Accounts</h3>
        {!readOnly && <button className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-600 text-white text-sm rounded-xl font-medium hover:opacity-90 transition-opacity">+ Add Partner</button>}
      </div>
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-neutral-400 text-xs uppercase tracking-wide">
              <tr><th className="px-5 py-3 text-left">Partner</th><th className="px-5 py-3 text-left">Type</th><th className="px-5 py-3 text-left">Contact</th><th className="px-5 py-3 text-left">Status</th><th className="px-5 py-3 text-right">YTD Revenue</th>{!readOnly && <th className="px-5 py-3 text-center">Actions</th>}</tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {partners.map((p) => (
                <tr key={p.name} className="hover:bg-white/5 transition-colors">
                  <td className="px-5 py-3 font-medium text-white">{p.name}</td>
                  <td className="px-5 py-3 text-neutral-400">{p.type}</td>
                  <td className="px-5 py-3 text-neutral-400">{p.contact}</td>
                  <td className="px-5 py-3"><span className={`px-2.5 py-1 text-xs rounded-full border font-medium ${p.status === 'Active' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/20' : 'bg-amber-500/20 text-amber-300 border-amber-500/20'}`}>{p.status}</span></td>
                  <td className="px-5 py-3 text-right text-cyan-300 font-medium">{p.revenue}</td>
                  {!readOnly && <td className="px-5 py-3 text-center"><button className="px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs text-white transition-colors">Edit</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div><h4 className="font-semibold text-white">AI-Powered Outreach</h4><p className="text-sm text-neutral-400 mt-0.5">Run Agent B to send personalised pitch sequences to prospects.</p></div>
        {!readOnly && <button className="px-5 py-2.5 bg-gradient-to-r from-purple-500 to-pink-600 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity shrink-0">Launch Outreach</button>}
      </div>
    </div>
  );
}

function FinancialsPanel() {
  const months = ['Jan', 'Feb', 'Mar', 'Apr'];
  const revenue = [420000, 510000, 485000, 630000];
  return (
    <div className="space-y-5">
      <h3 className="text-lg font-semibold text-white">Financial Overview</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[{ label: 'Total Revenue (YTD)', value: 'Tk. 20,45,000', delta: '+12%', up: true }, { label: 'Outstanding Invoices', value: 'Tk. 3,20,000', delta: '-5%', up: false }, { label: 'Monthly Avg (2026)', value: 'Tk. 5,11,250', delta: '+8%', up: true }].map((s) => (
          <div key={s.label} className="bg-white/5 border border-white/10 rounded-2xl p-5"><p className="text-neutral-400 text-xs mb-1">{s.label}</p><p className="text-2xl font-bold text-white">{s.value}</p><p className={`text-xs mt-1 ${s.up ? 'text-emerald-400' : 'text-red-400'}`}>{s.delta} vs last period</p></div>
        ))}
      </div>
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
        <h4 className="text-sm font-semibold text-neutral-300 mb-4">Monthly Revenue (Tk.)</h4>
        <div className="flex items-end gap-3 h-28">
          {months.map((m, i) => {
            const pct = (revenue[i] / Math.max(...revenue)) * 100;
            return (
              <div key={m} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] text-neutral-400">{(revenue[i] / 1000).toFixed(0)}k</span>
                <div style={{ height: `${pct}%` }} className="w-full bg-gradient-to-t from-cyan-600 to-blue-500 rounded-t-lg min-h-[4px]" />
                <span className="text-[10px] text-neutral-500">{m}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StaffManagementPanel() {
  const staff = [
    { name: 'Ahmed Shanwaz', role: 'Administrator', dept: 'Management', status: 'On Duty' },
    { name: 'Rina Akter', role: 'Front Office', dept: 'Reception', status: 'On Duty' },
    { name: 'Karim Hossain', role: 'Front Desk – Sales Lead', dept: 'Sales', status: 'On Duty' },
    { name: 'Mitu Begum', role: 'Housekeeping', dept: 'Operations', status: 'Off Duty' },
    { name: 'Rafiq Uddin', role: 'Manager', dept: 'Management', status: 'On Duty' },
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h3 className="text-lg font-semibold text-white">Staff Management</h3><button className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm rounded-xl font-medium hover:opacity-90 transition-opacity">+ Add Staff</button></div>
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-neutral-400 text-xs uppercase tracking-wide"><tr><th className="px-5 py-3 text-left">Name</th><th className="px-5 py-3 text-left">Role</th><th className="px-5 py-3 text-left">Department</th><th className="px-5 py-3 text-left">Status</th><th className="px-5 py-3 text-center">Actions</th></tr></thead>
          <tbody className="divide-y divide-white/5">
            {staff.map((s) => (
              <tr key={s.name} className="hover:bg-white/5 transition-colors">
                <td className="px-5 py-3 font-medium text-white">{s.name}</td><td className="px-5 py-3 text-neutral-400">{s.role}</td><td className="px-5 py-3 text-neutral-400">{s.dept}</td>
                <td className="px-5 py-3"><span className={`px-2.5 py-1 text-xs rounded-full border ${s.status === 'On Duty' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/20' : 'bg-neutral-500/20 text-neutral-400 border-neutral-500/20'}`}>{s.status}</span></td>
                <td className="px-5 py-3 text-center"><button className="px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs text-white transition-colors">Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FrontDeskPanel() {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white">Front Desk &amp; Sales</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[['🏨', 'Manage Reservations', 'Assign rooms and confirm bookings.', '/reservation'], ['🔔', 'Live Notifications', 'Monitor real-time reservation requests.', '/dashboard'], ['📋', 'Leads Database', 'Browse all organically and AI-prospected leads.', '/leads'], ['🚀', 'Sales Engine', 'Trigger the 3-Agent AI sales lifecycle.', '/']].map(([icon, title, desc, href]) => (
          <a key={href} href={href} className="block bg-white/5 border border-white/10 hover:bg-white/10 rounded-2xl p-5 transition-colors"><div className="text-3xl mb-2">{icon}</div><h4 className="font-semibold text-white">{title}</h4><p className="text-xs text-neutral-400 mt-1">{desc}</p></a>
        ))}
      </div>
    </div>
  );
}

function GeneralSettingsPanel() {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white">General System Settings</h3>
      <div className="space-y-3">
        {[{ label: 'Property Name', value: 'Hotel Fountain' }, { label: 'Admin Email', value: 'ahmedshanwaz5@gmail.com' }, { label: 'Timezone', value: 'Asia/Dhaka (UTC+6)' }, { label: 'Currency', value: 'BDT (Tk.)' }].map((f) => (
          <div key={f.label} className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between"><label className="text-sm text-neutral-400">{f.label}</label><span className="text-sm text-white font-medium">{f.value}</span></div>
        ))}
      </div>
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
        <h4 className="font-semibold text-white flex items-center gap-2">🔒 Hardware Security Whitelist</h4>
        <p className="text-sm text-neutral-400">Authorised devices access the CRM in full-write mode. Un-whitelisted machines are read-only.</p>
        <button onClick={() => fetch('/api/hardware-check').then((r) => r.json()).then((d) => alert(JSON.stringify(d, null, 2)))} className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm text-white transition-colors">Check This Device</button>
      </div>
      <div className="flex justify-end"><button className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity">Save Changes</button></div>
    </div>
  );
}

export default function SettingsPage() {
  const { role, roleLabel, isReadOnly } = useRole();
  const visibleTabs = getVisibleTabs(role as UserRole);
  const [activeTab, setActiveTab] = useState(visibleTabs[0]?.key ?? '');
  const safeActive = visibleTabs.find((t) => t.key === activeTab) ? activeTab : (visibleTabs[0]?.key ?? '');

  const renderPanel = () => {
    switch (safeActive) {
      case 'ai_agents':    return <AIAgentsPanel readOnly={isReadOnly} />;
      case 'b2b_partners': return <B2BPartnersPanel readOnly={isReadOnly} />;
      case 'front_desk':   return <FrontDeskPanel />;
      case 'financials':   return <FinancialsPanel />;
      case 'staff':        return <StaffManagementPanel />;
      case 'general':      return <GeneralSettingsPanel />;
      default:             return <p className="text-neutral-500 text-sm">Select a tab.</p>;
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans">
      {isReadOnly && <div className="w-full px-6 py-2.5 bg-red-500/10 border-b border-red-500/20 text-red-300 text-xs text-center font-semibold">🔒 Read-Only Mode — Changes are disabled.</div>}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500">Settings</h1>
            <p className="text-neutral-400 text-sm mt-1">
              Workspace for <span className="text-cyan-400 font-medium">{roleLabel}</span>
              {role === 'front_desk_sales_lead' && <span className="ml-2 px-2 py-0.5 bg-cyan-500/10 text-cyan-400 text-xs rounded-full border border-cyan-500/20">AI Agents &amp; B2B Only</span>}
            </p>
          </div>
          <a href="/dashboard" className="px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm text-white transition-all">← Dashboard</a>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          <nav className="lg:w-56 shrink-0">
            <ul className="space-y-1">
              {visibleTabs.map((tab) => (
                <li key={tab.key}>
                  <button onClick={() => setActiveTab(tab.key)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all text-left ${safeActive === tab.key ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/20 text-white' : 'text-neutral-400 hover:bg-white/5 hover:text-white border border-transparent'}`}>
                    <span className="text-base">{tab.icon}</span>{tab.label}
                  </button>
                </li>
              ))}
            </ul>
            {role === 'front_desk_sales_lead' && (
              <div className="mt-4 p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl">
                <p className="text-xs text-amber-400/80 leading-relaxed">Some tabs are restricted for your role. Contact an administrator for additional access.</p>
              </div>
            )}
            {(role === 'admin' || role === 'manager') && SETTINGS_TABS.filter((t) => !visibleTabs.find((v) => v.key === t.key)).length > 0 && (
              <div className="mt-4 space-y-0.5">
                <p className="text-xs text-neutral-600 px-4 pb-1 uppercase tracking-wide">Hidden</p>
                {SETTINGS_TABS.filter((t) => !visibleTabs.find((v) => v.key === t.key)).map((tab) => (
                  <div key={tab.key} className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs text-neutral-700 cursor-not-allowed"><span>{tab.icon}</span>{tab.label}<span className="ml-auto text-[10px] border border-neutral-800 rounded px-1">hidden</span></div>
                ))}
              </div>
            )}
          </nav>
          <main className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-3xl p-6">
            {visibleTabs.length === 0 ? (
              <div className="text-center py-12 text-neutral-500"><p className="text-4xl mb-3">🚫</p><p className="font-semibold text-white">No accessible sections</p><p className="text-sm mt-1">Your role has no access to settings.</p></div>
            ) : renderPanel()}
          </main>
        </div>
      </div>
    </div>
  );
}
