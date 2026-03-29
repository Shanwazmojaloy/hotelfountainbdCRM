'use client';

import { useState } from 'react';

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const triggerOrchestration = async () => {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch('/api/orchestrate', {
        method: 'POST'
      });
      const data = await res.json();
      
      if (data.status === 'success') {
        setResult(data.message);
      } else {
        setError(data.error || 'Execution failed.');
      }
    } catch (err) {
      setError('Network failure triggering API.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans selection:bg-cyan-500/30 flex items-center justify-center p-6 relative overflow-hidden">
        
      {/* Background Gradients */}
      <div className="absolute top-0 -left-4 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
      <div className="absolute top-0 -right-4 w-72 h-72 bg-cyan-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
      <div className="absolute -bottom-8 left-20 w-72 h-72 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>

      <div className="relative z-10 w-full max-w-4xl p-8 backdrop-blur-xl bg-white/5 border border-white/10 rounded-3xl shadow-2xl">
        <header className="mb-10 text-center space-y-4">
          <h1 className="text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500">
            Antigravity Sales Engine
          </h1>
          <p className="text-neutral-400 text-lg font-medium max-w-2xl mx-auto">
            The 3-Agent AI Engine that prospects leads, manages guest lifecycles, and auto-generates analytics.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {['Agent A: Prospector', 'Agent B: Closer', 'Agent C: Analyst'].map((agent, i) => (
            <div key={i} className="bg-white/5 border border-white/10 p-6 rounded-2xl hover:bg-white/10 transition-all duration-300">
              <h2 className="text-xl font-bold text-white mb-2">{agent}</h2>
              <div className="h-1 w-12 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full mb-4"></div>
              <p className="text-sm text-neutral-400">
                {i === 0 && 'Scours the web dynamically for corporate & lodging event leads.'}
                {i === 1 && 'Uses Gemini 1.5 Pro to send personalized pitches and stay emails.'}
                {i === 2 && 'Aggregates end-of-day Check-In/Out data into admin reports.'}
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center justify-center space-y-6">
          <button
            onClick={triggerOrchestration}
            disabled={loading}
            className={`px-8 py-4 rounded-full font-bold text-lg tracking-wide transition-all transform active:scale-95 shadow-lg ${
              loading 
                ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed border border-neutral-700' 
                : 'bg-gradient-to-r hover:scale-105 from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-cyan-500/25 border border-transparent'
            }`}
          >
            {loading ? (
              <span className="flex items-center space-x-2">
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                <span>Running Lifecycle Agents...</span>
              </span>
            ) : (
              'Simulate Full Daily Lifecycle'
            )}
          </button>

          {/* Feedback Status */}
          {result && (
            <div className="mt-6 w-full p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-center animate-fade-in">
              <strong className="block text-xl mb-1">Success!</strong>
              {result}
            </div>
          )}
          
          {error && (
            <div className="mt-6 w-full p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-center animate-fade-in">
              <strong className="block text-xl mb-1">Execution Error</strong>
              {error}
              <p className="text-xs mt-2 text-red-400/70">Check your Vercel/Node console logs or verify your .env API keys.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
