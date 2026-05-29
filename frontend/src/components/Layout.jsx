import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Layout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, user } = useAuth();

  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [globalQuery, setGlobalQuery] = useState("");

  const handleGlobalSearch = (e) => {
    if (e.key === "Enter") {
      if (globalQuery.trim()) {
        navigate(`/?name=${encodeURIComponent(globalQuery.trim())}`);
      }
      setGlobalQuery("");
    }
  };

  return (
    <div className="font-body-md text-body-md antialiased custom-scrollbar dark min-h-screen text-on-surface">
      {/* Top Persistent Navigation Bar */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-surface-container-lowest border-b border-outline-variant/10 flex items-center justify-between px-6 z-50">
        
        {/* Left Side: Logo, Product Name & Global Search */}
        <div className="flex items-center gap-6 flex-1 md:flex-initial">
          {/* Mobile menu trigger */}
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden material-symbols-outlined text-on-surface-variant hover:text-secondary p-2 rounded-full hover:bg-surface-variant/20 border-none bg-transparent cursor-pointer flex items-center justify-center transition-colors"
          >
            {mobileMenuOpen ? 'close' : 'menu'}
          </button>

          <Link to="/" className="flex items-center gap-3 no-underline">
            <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center text-on-secondary shadow-lg">
              <span className="material-symbols-outlined text-[22px]">shield_with_house</span>
            </div>
            <div>
              <h2 className="font-headline-sm text-[16px] font-bold text-secondary leading-tight m-0">AWA Insight</h2>
              <p className="font-label-caps text-[8px] text-on-surface-variant uppercase tracking-widest leading-none m-0">Analytics Portal</p>
            </div>
          </Link>

          {/* Persistent Global Search (Desktop/Tablet) */}
          <div className="hidden sm:flex items-center gap-3 px-3 py-1.5 bg-surface-container-low rounded-xl border border-outline-variant/20 focus-within:ring-1 focus-within:ring-secondary transition-all w-64 md:w-72">
            <span className="material-symbols-outlined text-on-surface-variant text-[18px]">search</span>
            <input 
              value={globalQuery}
              onChange={e => setGlobalQuery(e.target.value)}
              onKeyDown={handleGlobalSearch}
              className="bg-transparent border-none focus:ring-0 text-body-md text-[13px] text-on-surface placeholder:text-on-surface-variant/40 w-full outline-none" 
              placeholder="Search facility name globally..." 
              type="text"
            />
          </div>
        </div>

        {/* Center: Main Navigation Links (Desktop) */}
        <nav className="hidden md:flex items-center gap-1">
          <Link 
            to="/" 
            className={`px-4 py-2 rounded-lg font-label-caps text-[11px] font-bold uppercase tracking-wider transition-all no-underline ${
              location.pathname === '/' ? 'text-secondary bg-secondary/10' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/20'
            }`}
          >
            Facilities
          </Link>
          <Link 
            to="/inspectors" 
            className={`px-4 py-2 rounded-lg font-label-caps text-[11px] font-bold uppercase tracking-wider transition-all no-underline ${
              location.pathname.startsWith('/inspector') || location.pathname.startsWith('/inspectors') ? 'text-secondary bg-secondary/10' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/20'
            }`}
          >
            Inspectors
          </Link>
          <Link 
            to="/search" 
            className={`px-4 py-2 rounded-lg font-label-caps text-[11px] font-bold uppercase tracking-wider transition-all no-underline ${
              location.pathname.startsWith('/search') || location.pathname.startsWith('/facility') ? 'text-secondary bg-secondary/10' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/20'
            }`}
          >
            Cases
          </Link>
          <Link 
            to="/document-review" 
            className={`px-4 py-2 rounded-lg font-label-caps text-[11px] font-bold uppercase tracking-wider transition-all no-underline ${
              location.pathname.startsWith('/document-review') ? 'text-secondary bg-secondary/10' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/20'
            }`}
          >
            Archive
          </Link>
        </nav>

        {/* Right Side: Notifications, Settings, Profile */}
        <div className="flex items-center gap-3">
          <button className="material-symbols-outlined text-on-surface-variant hover:text-secondary transition-all p-2 rounded-full hover:bg-surface-variant/20 relative border-none bg-transparent cursor-pointer flex items-center justify-center" title="Notifications">
            notifications
            <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-secondary rounded-full"></span>
          </button>
          <button className="material-symbols-outlined text-on-surface-variant hover:text-secondary transition-all p-2 rounded-full hover:bg-surface-variant/20 border-none bg-transparent cursor-pointer flex items-center justify-center" title="Settings">
            settings
          </button>
          
          <div className="h-6 w-px bg-outline-variant/20 hidden md:block"></div>
          
          {/* User Profile Dropdown */}
          <div className="relative">
            <button 
              onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
              className="flex items-center gap-2 text-on-surface-variant hover:text-secondary transition-all p-1 rounded-full hover:bg-surface-variant/20 border-none bg-transparent cursor-pointer"
              title="User Profile"
            >
              <span className="material-symbols-outlined text-[30px]">account_circle</span>
            </button>
            
            {profileDropdownOpen && (
              <>
                {/* Click outside backdrop close handler */}
                <div className="fixed inset-0 z-40" onClick={() => setProfileDropdownOpen(false)}></div>
                
                <div className="absolute right-0 mt-2 w-64 bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-4 shadow-2xl z-50 animate-fade-in">
                  <div className="flex items-center gap-3 pb-3 border-b border-outline-variant/10 mb-3">
                    <div className="w-9 h-9 rounded-full bg-secondary/10 flex items-center justify-center text-secondary">
                      <span className="material-symbols-outlined text-[20px]">person</span>
                    </div>
                    <div className="overflow-hidden">
                      <p className="font-label-caps text-[11px] font-bold text-on-surface truncate">{user?.user_metadata?.full_name || "Investigations Dept"}</p>
                      <p className="text-[9px] text-secondary uppercase tracking-tighter truncate">{user?.email || "Internal Access"}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      setProfileDropdownOpen(false);
                      logout();
                    }}
                    className="flex items-center gap-3 text-on-surface-variant hover:text-error hover:bg-error/10 rounded-xl px-4 py-2.5 transition-all active:scale-95 w-full text-left border-none bg-transparent cursor-pointer font-label-caps text-[11px] tracking-wider font-bold"
                  >
                    <span className="material-symbols-outlined text-[18px]">logout</span>
                    LOGOUT
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Mobile/Tablet Menu Overlay */}
      {mobileMenuOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={() => setMobileMenuOpen(false)}></div>
          <div className="md:hidden fixed top-16 left-0 right-0 bg-surface-container-lowest border-b border-outline-variant/10 p-6 flex flex-col gap-4 z-40 animate-fade-in shadow-2xl">
            {/* Global Search inside mobile menu */}
            <div className="flex sm:hidden items-center gap-3 px-3 py-2 bg-surface-container-low rounded-xl border border-outline-variant/20 focus-within:ring-1 focus-within:ring-secondary transition-all w-full">
              <span className="material-symbols-outlined text-on-surface-variant text-[18px]">search</span>
              <input 
                value={globalQuery}
                onChange={e => setGlobalQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setMobileMenuOpen(false);
                    handleGlobalSearch(e);
                  }
                }}
                className="bg-transparent border-none focus:ring-0 text-body-md text-[13px] text-on-surface placeholder:text-on-surface-variant/40 w-full outline-none" 
                placeholder="Search facility name globally..." 
                type="text"
              />
            </div>
            
            <Link 
              to="/" 
              onClick={() => setMobileMenuOpen(false)}
              className={`px-4 py-3 rounded-lg font-label-caps text-[11px] font-bold uppercase tracking-wider transition-all no-underline ${
                location.pathname === '/' ? 'text-secondary bg-secondary/10' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/10'
              }`}
            >
              Facilities
            </Link>
            <Link 
              to="/inspectors" 
              onClick={() => setMobileMenuOpen(false)}
              className={`px-4 py-3 rounded-lg font-label-caps text-[11px] font-bold uppercase tracking-wider transition-all no-underline ${
                location.pathname.startsWith('/inspector') || location.pathname.startsWith('/inspectors') ? 'text-secondary bg-secondary/10' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/10'
              }`}
            >
              Inspectors
            </Link>
            <Link 
              to="/search" 
              onClick={() => setMobileMenuOpen(false)}
              className={`px-4 py-3 rounded-lg font-label-caps text-[11px] font-bold uppercase tracking-wider transition-all no-underline ${
                location.pathname.startsWith('/search') || location.pathname.startsWith('/facility') ? 'text-secondary bg-secondary/10' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/10'
              }`}
            >
              Cases
            </Link>
            <Link 
              to="/document-review" 
              onClick={() => setMobileMenuOpen(false)}
              className={`px-4 py-3 rounded-lg font-label-caps text-[11px] font-bold uppercase tracking-wider transition-all no-underline ${
                location.pathname.startsWith('/document-review') ? 'text-secondary bg-secondary/10' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/10'
              }`}
            >
              Archive
            </Link>
          </div>
        </>
      )}
      
      {/* Main Content Canvas (No side bar indentation, expanded full-width) */}
      <main className="pt-16 min-h-screen relative overflow-hidden">
        {children}
      </main>
    </div>
  );
}
