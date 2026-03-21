import React, { useState } from 'react';
import { Eye, EyeOff, Scale } from 'lucide-react';

const USERS = [
  { email: 'admin@lextgress.com',   password: 'LexTgress@2026', name: 'Admin',          role: 'Advocate' },
  { email: 'paari@lextgress.com',   password: 'Paari@2026',     name: 'Paari Vendhan',  role: 'Advocate' },
  { email: 'demo@lextgress.com',    password: 'Demo@2026',      name: 'Demo User',      role: 'Advocate' },
  // ── Demo trial accounts (50 case search limit each) ─────────────────────────
  { email: 'demo1@lextgress.com',   password: 'Demo@123', name: 'Demo User 1',  role: 'Advocate', searchLimit: 50 },
  { email: 'demo2@lextgress.com',   password: 'Demo@123', name: 'Demo User 2',  role: 'Advocate', searchLimit: 50 },
  { email: 'demo3@lextgress.com',   password: 'Demo@123', name: 'Demo User 3',  role: 'Advocate', searchLimit: 50 },
  { email: 'demo4@lextgress.com',   password: 'Demo@123', name: 'Demo User 4',  role: 'Advocate', searchLimit: 50 },
  { email: 'demo5@lextgress.com',   password: 'Demo@123', name: 'Demo User 5',  role: 'Advocate', searchLimit: 50 },
  { email: 'demo6@lextgress.com',   password: 'Demo@123', name: 'Demo User 6',  role: 'Advocate', searchLimit: 50 },
  { email: 'demo7@lextgress.com',   password: 'Demo@123', name: 'Demo User 7',  role: 'Advocate', searchLimit: 50 },
  { email: 'demo8@lextgress.com',   password: 'Demo@123', name: 'Demo User 8',  role: 'Advocate', searchLimit: 50 },
  { email: 'demo9@lextgress.com',   password: 'Demo@123', name: 'Demo User 9',  role: 'Advocate', searchLimit: 50 },
  { email: 'demo10@lextgress.com',  password: 'Demo@123', name: 'Demo User 10', role: 'Advocate', searchLimit: 50 },
];

// ── Demo account search limit helpers (used by SearchCaseForm) ────────────────
export const SEARCH_LIMIT_KEY = (email: string) => `lx_search_count_${email}`;

export function getDemoSearchCount(email: string): number {
  return parseInt(localStorage.getItem(SEARCH_LIMIT_KEY(email)) || '0', 10);
}

export function incrementDemoSearchCount(email: string): void {
  const count = getDemoSearchCount(email);
  localStorage.setItem(SEARCH_LIMIT_KEY(email), String(count + 1));
}

export function getDemoSearchLimit(email: string): number | null {
  const user = USERS.find(u => u.email === email);
  return (user as any)?.searchLimit ?? null;  // null = unlimited
}

interface LoginProps {
  onLogin: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const user = USERS.find(
      u => u.email === email && u.password === password
    );

    if (user) {
      localStorage.setItem(
        'lextgress_user',
        JSON.stringify({
          email: user.email,
          name: user.name,
          role: user.role,
          searchLimit: (user as any).searchLimit ?? null,
          logged_in_at: new Date().toISOString()
        })
      );
      onLogin();
    } else {
      setError('Invalid email or password');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col items-center p-8">
        <div className="w-16 h-16 bg-[#1A2E5E] rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-[#1A2E5E]/20">
          <Scale className="text-white w-10 h-10" />
        </div>
        
        <h1 className="text-2xl font-extrabold text-[#1A2E5E] mb-1">Lex Tigress</h1>
        <p className="text-slate-500 font-medium mb-8 text-sm uppercase tracking-widest">AI Legal Platform</p>

        <form onSubmit={handleLogin} className="w-full space-y-6">
          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-700 ml-1">Email</label>
            <input 
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-[#1A2E5E] focus:ring-2 focus:ring-[#1A2E5E]/10 outline-none transition-all"
              placeholder="name@lextgress.com"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-700 ml-1">Password</label>
            <div className="relative">
              <input 
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-[#1A2E5E] focus:ring-2 focus:ring-[#1A2E5E]/10 outline-none transition-all"
                placeholder="••••••••"
                required
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-slate-600 transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm font-medium animate-shake">
              {error}
            </div>
          )}

          <button 
            type="submit"
            className="w-full bg-[#1A2E5E] hover:bg-[#2A4B9B] text-white font-bold py-3.5 rounded-xl shadow-lg shadow-[#1A2E5E]/20 active:scale-[0.98] transition-all"
          >
            Login
          </button>
        </form>

        <div className="mt-8 text-xs text-slate-400 font-medium">
          © 2026 Lex Tigress AI • Professional Legal Systems
        </div>
      </div>
      
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .animate-shake { animation: shake 0.2s ease-in-out 0s 2; }
      `}</style>
    </div>
  );
};

export default Login;