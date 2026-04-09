import { Link } from 'react-router-dom';
import { Zap } from 'lucide-react';

export function LandingHeader() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/70 backdrop-blur-xl border-b border-stone-200/40 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-14">
          {/* Logo — matches app brand */}
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-[#1C1917] flex items-center justify-center shadow-[0_0_12px_rgba(45,212,191,0.2)] hover:shadow-[0_0_20px_rgba(45,212,191,0.35)] transition-all duration-300">
              <Zap className="size-4 text-[#2DD4BF]" fill="currentColor" />
            </div>
            <span className="text-[17px] font-semibold text-slate-900 tracking-tight">Velocity AI</span>
          </div>

          {/* Nav */}
          <nav className="hidden md:flex items-center gap-8">
            <a href="#how-it-works" className="text-sm text-slate-500 hover:text-slate-900 transition-colors duration-200 font-medium">How it works</a>
            <a href="#pricing" className="text-sm text-slate-500 hover:text-slate-900 transition-colors duration-200 font-medium">Pricing</a>
            <a href="#book-call" className="text-sm text-slate-500 hover:text-slate-900 transition-colors duration-200 font-medium">Book a Call</a>
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors duration-200 px-3 py-1.5"
            >
              Sign In
            </Link>
            <Link
              to="/signup"
              className="px-4 py-2 rounded-xl bg-[#1C1917] text-white text-sm font-medium hover:bg-[#292524] hover:shadow-[0_0_16px_rgba(45,212,191,0.2)] transition-all duration-200 shadow-sm"
            >
              Get Started
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
