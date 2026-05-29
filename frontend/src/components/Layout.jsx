import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Layout({ children }) {
  const location = useLocation();
  const { logout } = useAuth();

  return (
    <div className="font-body-md text-body-md antialiased custom-scrollbar dark min-h-screen text-on-surface">
      {/* Side Navigation Bar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-surface-container-lowest border-r border-outline-variant/10 flex flex-col p-6 z-50">
        <div className="mb-10 px-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center text-on-secondary shadow-lg">
              <span className="material-symbols-outlined text-[24px]">shield_with_house</span>
            </div>
            <div>
              <h2 className="font-headline-sm text-[20px] font-bold text-secondary">AWA Insight</h2>
              <p className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest">Investigative Platform</p>
            </div>
          </div>
        </div>
        
        <nav className="flex flex-col gap-2 flex-1">
          <Link to="/" className={`flex items-center gap-3 rounded-lg px-4 py-3 transition-all active:scale-95 ${location.pathname === '/' ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/30'}`}>
            <span className="material-symbols-outlined">search</span>
            <span className="font-label-caps text-label-caps uppercase">Search</span>
          </Link>
          <Link to="/inspectors" className={`flex items-center gap-3 rounded-lg px-4 py-3 transition-all active:scale-95 ${location.pathname.startsWith('/inspector') ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/30'}`}>
            <span className="material-symbols-outlined">group</span>
            <span className="font-label-caps text-label-caps uppercase">Inspectors</span>
          </Link>
          <Link to="/search" className={`flex items-center gap-3 rounded-lg px-4 py-3 transition-all active:scale-95 ${location.pathname.startsWith('/search') || location.pathname.startsWith('/facility') ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/30'}`}>
            <span className="material-symbols-outlined">folder_managed</span>
            <span className="font-label-caps text-label-caps uppercase">Cases</span>
          </Link>
          <Link to="/document-review" className={`flex items-center gap-3 rounded-lg px-4 py-3 transition-all active:scale-95 ${location.pathname.startsWith('/document-review') ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/30'}`}>
            <span className="material-symbols-outlined">inventory_2</span>
            <span className="font-label-caps text-label-caps uppercase">Archive</span>
          </Link>
        </nav>
        
        <div className="mt-auto border-t border-outline-variant/10 pt-6 flex flex-col gap-4">
          <button className="flex items-center gap-3 text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/30 rounded-lg px-4 py-3 transition-all active:scale-95">
            <span className="material-symbols-outlined">settings</span>
            <span className="font-label-caps text-label-caps uppercase">Settings</span>
          </button>
          <button 
            onClick={logout} 
            className="flex items-center gap-3 text-on-surface-variant hover:text-error hover:bg-error/10 rounded-lg px-4 py-3 transition-all active:scale-95 w-full text-left"
          >
            <span className="material-symbols-outlined">logout</span>
            <span className="font-label-caps text-label-caps uppercase">Logout</span>
          </button>
          <div className="flex items-center gap-3 px-2 py-3 bg-surface-container-low rounded-xl border border-outline-variant/5">
            <img alt="Organization Logo" className="w-8 h-8 rounded-full border border-secondary/20" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDKK4QidNb2g4tcNPEVpe85lSQnFYazc4cGFSykw9OtrrV767lMfzBHyLwdTyrnLlZdBvun1Mc7Kmp2kEw7rEDJNxGBQYquV8KNs-FMQsCrYSV5Fcb9ooVxSbuTOXkig-4OxFDQjXj3eyCyloIkdjQAKIxlQCj5PJsZzGLiDMzBPUz8rxDs1xjTiEdU3BH2QOvIp16DiKLIVmNQtfSMw7kcF3OPzs4Ii9O4bSzsYC5B95HfADyHKXDq81GrPdX1MIvq1HZYpK_hpeY"/>
            <div className="overflow-hidden">
              <p className="font-label-caps text-[11px] font-bold text-on-surface truncate">Investigations Dept</p>
              <p className="text-[9px] text-secondary uppercase tracking-tighter">Internal Access</p>
            </div>
          </div>
        </div>
      </aside>
      
      {/* Top App Bar */}
      <header className="fixed top-0 right-0 left-64 h-16 bg-surface border-b border-outline-variant/10 flex items-center justify-between px-6 z-40">
        <div className="flex items-center gap-6">
          <h2 className="font-headline-sm text-headline-sm font-bold text-secondary">AWA Analytics</h2>
          <div className="h-6 w-px bg-outline-variant/20"></div>
          <div className="flex items-center gap-3 px-4 py-2 bg-surface-container-low rounded-xl border border-outline-variant/20 focus-within:ring-1 focus-within:ring-secondary transition-all">
            <span className="material-symbols-outlined text-on-surface-variant text-[20px]">search</span>
            <input className="bg-transparent border-none focus:ring-0 text-body-md text-on-surface placeholder:text-on-surface-variant/50 w-72 outline-none" placeholder="Global identification search..." type="text"/>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button className="material-symbols-outlined text-on-surface-variant hover:text-secondary transition-all p-2 rounded-full hover:bg-surface-variant/20">filter_list</button>
            <button className="material-symbols-outlined text-on-surface-variant hover:text-secondary transition-all p-2 rounded-full hover:bg-surface-variant/20 relative">
              notifications
              <span className="absolute top-2 right-2 w-2 h-2 bg-secondary rounded-full border border-surface"></span>
            </button>
            <button className="material-symbols-outlined text-on-surface-variant hover:text-secondary transition-all p-2 rounded-full hover:bg-surface-variant/20">help</button>
          </div>
          <div className="h-8 w-px bg-outline-variant/20"></div>
          <button className="flex items-center gap-2 text-on-surface-variant hover:text-secondary transition-all">
            <span className="material-symbols-outlined text-[32px]">account_circle</span>
          </button>
        </div>
      </header>
      
      {/* Main Content Canvas */}
      <main className="pl-64 pt-16 min-h-screen relative overflow-hidden">
        {children}
      </main>
    </div>
  );
}
