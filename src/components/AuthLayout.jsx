import React from "react";
import { Gem } from "lucide-react";

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900/95 py-12 px-4 relative overflow-hidden">
      {/* Background ambient gold/slate glow */}
      <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-amber-600/10 blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Brand Identity */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Gem className="w-5 h-5 text-slate-950 stroke-[2.2]" />
            </div>
            <div className="text-left">
              <span className="font-display font-black tracking-wider text-base text-white block leading-tight">
                JEWEL<span className="text-amber-400">CORE</span>
              </span>
              <span className="text-[10px] uppercase font-semibold tracking-widest text-amber-200/70 block">
                Jewellery Store Suite
              </span>
            </div>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-white mt-4">{title}</h1>
          {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-7 sm:p-8">
          {children}
        </div>

        {footer && (
          <p className="text-center text-xs text-slate-400 mt-6">{footer}</p>
        )}
      </div>
    </div>
  );
}

