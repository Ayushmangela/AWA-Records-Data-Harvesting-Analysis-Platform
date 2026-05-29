import React, { useEffect, useRef, useCallback, useState } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function LandingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user, login, signup, loading } = useAuth();

  const containerRef = useRef(null);
  const coreRef = useRef(null);
  const svgRef = useRef(null);
  const lineRefs = useRef([]);
  const cardRefs = useRef([]);
  const rafRef = useRef(null);
  const isVisibleRef = useRef(false);
  const sectionRefs = useRef([]);

  const [showLogin, setShowLogin] = useState(false);
  const [activeTab, setActiveTab] = useState("login"); // "login" or "signup"

  // Form states
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  // Auto-redirect if already logged in
  useEffect(() => {
    if (!loading && user) {
      navigate("/", { replace: true });
    }
  }, [user, loading, navigate]);

  // Sync state with URL pathname/params
  useEffect(() => {
    const isLoginPath = location.pathname === "/login";
    setShowLogin(isLoginPath);
    if (isLoginPath) {
      const tab = searchParams.get("tab") === "signup" ? "signup" : "login";
      setActiveTab(tab);
    }
  }, [location, searchParams]);

  const openLogin = useCallback((tab = "login") => {
    navigate(`/login?tab=${tab}`);
  }, [navigate]);

  const closeLogin = useCallback(() => {
    navigate("/landing");
  }, [navigate]);

  // Prevent background scrolling when login overlay is open
  useEffect(() => {
    if (showLogin) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [showLogin]);

  // Client-side validation
  const validateForm = () => {
    const errors = {};

    if (activeTab === "signup") {
      if (!fullName || fullName.trim().length < 2) {
        errors.fullName = "Full name must be at least 2 characters.";
      }
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      errors.email = "Please enter a valid email address.";
    }

    if (!password || password.length < 8) {
      errors.password = "Password must be at least 8 characters.";
    } else if (activeTab === "signup" && !/\d/.test(password)) {
      errors.password = "Password must contain at least one number.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      if (activeTab === "login") {
        await login(email, password);
        navigate("/");
      } else {
        await signup(email, password, fullName);
        setFullName("");
        setEmail("");
        setPassword("");
        navigate("/");
      }
    } catch (err) {
      console.error("Authentication error:", err);
      setFormError(err.message || "An authentication error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };


  // Connector lines — only run RAF when the architecture section is in view
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function updateLines() {
      if (!isVisibleRef.current) return;

      const core = coreRef.current;
      const svg = svgRef.current;
      if (!core || !svg) {
        rafRef.current = requestAnimationFrame(updateLines);
        return;
      }

      const containerRect = container.getBoundingClientRect();

      // Make SVG viewBox match actual pixel dimensions — no coordinate distortion
      svg.setAttribute("viewBox", `0 0 ${containerRect.width} ${containerRect.height}`);

      const coreRect = core.getBoundingClientRect();
      const coreX = (coreRect.left + coreRect.right) / 2 - containerRect.left;
      const coreY = (coreRect.top + coreRect.bottom) / 2 - containerRect.top;
      // The inner circle is w-72 (288px), so radius = 144px. Add 4px gap.
      const coreRadius = (coreRect.width / 2) + 4;

      for (let i = 0; i < 5; i++) {
        const card = cardRefs.current[i];
        const line = lineRefs.current[i];
        if (!card || !line) continue;

        const cardRect = card.getBoundingClientRect();
        const cardX = (cardRect.left + cardRect.right) / 2 - containerRect.left;
        const cardY = (cardRect.top + cardRect.bottom) / 2 - containerRect.top;

        // Calculate direction from card to core center
        const dx = coreX - cardX;
        const dy = coreY - cardY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 1) continue;

        // Stop line at the circle border, not at center
        const borderX = coreX - (dx / dist) * coreRadius;
        const borderY = coreY - (dy / dist) * coreRadius;

        line.setAttribute("d", `M ${cardX},${cardY} L ${borderX},${borderY}`);
      }

      rafRef.current = requestAnimationFrame(updateLines);
    }

    // Only animate when visible
    const visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        isVisibleRef.current = entry.isIntersecting;
        if (entry.isIntersecting) {
          rafRef.current = requestAnimationFrame(updateLines);
        } else if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
      },
      { threshold: 0.05 }
    );

    visibilityObserver.observe(container);

    return () => {
      visibilityObserver.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Scroll-triggered section fade-in using refs instead of querySelectorAll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.style.opacity = "1";
            entry.target.style.transform = "translateY(0)";
            observer.unobserve(entry.target); // once visible, stop watching
          }
        });
      },
      { threshold: 0.1 }
    );

    const refs = sectionRefs.current;
    refs.forEach((el) => {
      if (el) {
        el.style.opacity = "0";
        el.style.transform = "translateY(40px)";
        observer.observe(el);
      }
    });

    return () => observer.disconnect();
  }, []);

  const addSectionRef = useCallback((el) => {
    if (el && !sectionRefs.current.includes(el)) {
      sectionRefs.current.push(el);
    }
  }, []);

  return (
    <div className="landing-page dark bg-background text-on-surface font-body-md antialiased overflow-x-hidden">
      {/* Persistent Background System */}
      <div className="landing-vault-mesh"></div>
      <div className="landing-fog-layer">
        <div className="landing-fog-blob" style={{ top: "10%", left: "10%" }}></div>
        <div className="landing-fog-blob" style={{ top: "50%", right: "10%", animationDelay: "-20s" }}></div>
        <div className="landing-fog-blob" style={{ bottom: "10%", left: "30%", animationDelay: "-40s" }}></div>
      </div>

      {/* Header */}
      <header className="fixed top-8 left-1/2 -translate-x-1/2 w-[calc(100%-2*64px)] max-w-[1440px] z-50 flex justify-between items-center px-8 py-3 bg-black/30 backdrop-blur-xl border border-white/10 rounded-full shadow-2xl transition-all duration-500 hover:border-white/20">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3 group cursor-pointer">
            <div className="relative flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-tr from-secondary/20 to-secondary/10 border border-secondary/30 group-hover:border-secondary/60 transition-all duration-500">
              <span className="material-symbols-outlined text-secondary text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>analytics</span>
              <div className="absolute inset-0 rounded-full bg-secondary/20 blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-headline-sm text-base font-bold text-on-surface tracking-tight leading-none">AWA Insight</span>
                <div className="px-1.5 py-0.5 rounded-full bg-secondary/10 border border-secondary/20">
                  <span className="font-code-data text-[8px] text-secondary uppercase tracking-widest">Vault v4.2</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-1">
          <a className="px-5 py-1.5 text-secondary font-bold text-body-sm rounded-full bg-secondary/10 transition-all" href="#features">Features</a>
          <a className="px-5 py-1.5 text-on-surface-variant font-medium hover:text-secondary transition-all text-body-sm" href="#workflow">Workflow</a>
          <a className="px-5 py-1.5 text-on-surface-variant font-medium hover:text-secondary transition-all text-body-sm" href="#analytics">Analytics</a>
          <a className="px-5 py-1.5 text-on-surface-variant font-medium hover:text-secondary transition-all text-body-sm" href="#evidence-architecture">Documentation</a>
        </nav>

        <div className="flex items-center gap-4">
          <button onClick={() => openLogin("login")} className="text-on-surface-variant font-medium text-body-sm px-4 py-2 hover:text-secondary transition-all">Login</button>
          <button onClick={() => openLogin("login")} className="relative group px-7 py-2.5 rounded-full overflow-hidden transition-all duration-300 bg-secondary text-on-secondary-fixed font-bold text-body-sm shadow-[0_4px_20px_rgba(233,195,73,0.3)] hover:shadow-[0_4px_30px_rgba(233,195,73,0.5)] hover:scale-[1.03]">
            <span className="relative z-10">Access Vault</span>
          </button>
        </div>
      </header>

      <main className="relative z-10">
        {/* Hero Section */}
        <section ref={addSectionRef} id="features" className="landing-section-fade min-h-screen pt-48 pb-32 px-4 md:px-[64px] relative overflow-hidden">
          <div className="landing-spotlight" style={{ top: "10%", left: "10%", opacity: 0.15 }}></div>
          <div className="max-w-[1440px] mx-auto w-full flex flex-col gap-24 px-4 md:px-[64px]">
            {/* Top Part (Centered) */}
            <div className="space-y-12 text-center relative z-10 max-w-4xl mx-auto">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-secondary/5 border border-secondary/20 rounded-full animate-pulse">
                <span className="material-symbols-outlined text-secondary text-[16px]">verified</span>
                <span className="font-code-data text-xs text-secondary uppercase tracking-[0.3em]">Deep Intelligence Protocol Active</span>
              </div>
              <h1 className="font-headline-lg text-5xl md:text-7xl text-on-surface leading-[1.1] tracking-tight">
                Elite Intelligence for <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-secondary to-tertiary">Animal Welfare Enforcement.</span>
              </h1>
              <p className="font-body-lg text-xl text-on-surface-variant max-w-3xl mx-auto leading-relaxed">
                AI-powered data harvesting and analytics for comprehensive AWA record investigation and evidence traceability. Built for precision in oversight.
              </p>
              <div className="flex flex-wrap justify-center gap-6 pt-4">
                  <button onClick={() => openLogin("login")} className="bg-secondary text-on-secondary px-8 py-4 rounded-xl font-bold flex items-center gap-3 hover:scale-105 transition-all shadow-[0_20px_40px_-10px_rgba(233,195,73,0.4)]">
                    Initialize System <span className="material-symbols-outlined">bolt</span>
                  </button>
                <button className="bg-surface-container-high/50 border border-outline-variant/30 backdrop-blur-md px-8 py-4 rounded-xl font-bold hover:bg-surface-container-high transition-all">
                  Documentation
                </button>
              </div>
            </div>

            {/* Bottom Part (Split Layout) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              {/* Left Column: System Advantages */}
              <div className="space-y-8">
                <div className="flex gap-6 items-start group">
                  <div className="p-4 rounded-2xl bg-secondary/10 border border-secondary/20 text-secondary group-hover:bg-secondary/20 transition-all duration-300 shadow-[0_8px_16px_rgba(233,195,73,0.1)]">
                    <span className="material-symbols-outlined text-3xl">policy</span>
                  </div>
                  <div>
                    <h4 className="font-headline-sm text-xl text-on-surface mb-2">Forensic Precision</h4>
                    <p className="text-body-md text-on-surface-variant">Absolute data integrity for legal-grade reporting and immutable evidence chains.</p>
                  </div>
                </div>
                <div className="flex gap-6 items-start group">
                  <div className="p-4 rounded-2xl bg-secondary/10 border border-secondary/20 text-secondary group-hover:bg-secondary/20 transition-all duration-300 shadow-[0_8px_16px_rgba(233,195,73,0.1)]">
                    <span className="material-symbols-outlined text-3xl">hub</span>
                  </div>
                  <div>
                    <h4 className="font-headline-sm text-xl text-on-surface mb-2">Neural Synthesis</h4>
                    <p className="text-body-md text-on-surface-variant">Automated mapping of disparate record sets through advanced entity recognition.</p>
                  </div>
                </div>
                <div className="flex gap-6 items-start group">
                  <div className="p-4 rounded-2xl bg-secondary/10 border border-secondary/20 text-secondary group-hover:bg-secondary/20 transition-all duration-300 shadow-[0_8px_16px_rgba(233,195,73,0.1)]">
                    <span className="material-symbols-outlined text-3xl">monitoring</span>
                  </div>
                  <div>
                    <h4 className="font-headline-sm text-xl text-on-surface mb-2">Tactical Oversight</h4>
                    <p className="text-body-md text-on-surface-variant">Real-time monitoring of facility compliance and inspector performance trends.</p>
                  </div>
                </div>
              </div>

              {/* Right Column: Dashboard Image */}
              <div className="relative flex items-center justify-center group">
                {/* Glow Background (Static, same for both states) */}
                <div className="absolute -inset-10 bg-secondary/10 rounded-[3rem] blur-[80px] pointer-events-none"></div>

                {/* Rotating Wrapper */}
                <div className="rotating-dashboard relative w-full">
                  {/* Dashboard Card */}
                  <div className="rounded-2xl border border-white/10 overflow-hidden shadow-[0_50px_100px_-20px_rgba(0,0,0,0.8)] landing-glass-panel p-2">
                    <img
                      alt="AWA Analytics Dashboard"
                      className="w-full h-auto rounded-xl opacity-95 group-hover:opacity-100 transition-opacity shadow-2xl"
                      loading="lazy"
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuBi3lGRlI-_KaFdy-htYXERWW0flyhCjLBmiZN3pAFnF8_qa3iwixPJ5Iq1Sb-XcZz4JDiUfjRS3_yFnvERIXkdz2Hx8IpQe6Hu5vk0-i5GqwRX36AyL4JBmKFzMZpIgqZ5rfSt8xV71zvzz9vXx2ghqDLZbx4oR8T7ckggpGHN723agTBPB5x7sViCtatKFfY4Zgm2JjgzghtZzOuW1Z0yrhTkY09yud7kxf5qI2tXCecZjUrTspRxXhcHn18pgo7MC0lSlNlrxx1o"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Challenge vs Solution Section */}
        <section ref={addSectionRef} id="workflow" className="landing-section-fade py-48 px-4 md:px-[64px] relative">
          <div className="landing-spotlight" style={{ bottom: "0%", right: "5%", opacity: 0.1 }}></div>
          <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-24 items-start">
            <div className="space-y-8">
              <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-[0.2em]">The Challenge</span>
              <h2 className="font-headline-md text-4xl leading-tight">Manual <br />Fragmentation</h2>
              <p className="text-on-surface-variant text-lg leading-relaxed">Investigators currently lose thousands of hours navigating fractured USDA databases and manually scanning illegible PDF inspection reports.</p>
              <div className="p-8 bg-error-container/5 border border-error/20 rounded-2xl">
                <ul className="space-y-4">
                  <li className="flex gap-4 items-start text-error/80">
                    <span className="material-symbols-outlined">error</span>
                    <span>Inconsistent naming conventions cross-records</span>
                  </li>
                  <li className="flex gap-4 items-start text-error/80">
                    <span className="material-symbols-outlined">error</span>
                    <span>Non-searchable legacy PDF documents</span>
                  </li>
                </ul>
              </div>
            </div>
            <div className="space-y-8 md:pt-24">
              <span className="font-label-caps text-label-caps text-secondary uppercase tracking-[0.2em]">The Solution</span>
              <h2 className="font-headline-md text-4xl text-secondary leading-tight">AWA Insight <br />Engine</h2>
              <p className="text-on-surface-variant text-lg leading-relaxed">We centralize and digitize the entire USDA AWA ecosystem using advanced OCR and LLM-based entity extraction.</p>
              <div className="p-8 bg-primary-container/5 border border-tertiary/20 rounded-2xl">
                <ul className="space-y-4">
                  <li className="flex gap-4 items-start text-tertiary/80">
                    <span className="material-symbols-outlined">check_circle</span>
                    <span>Centralized evidence-backed investigative workflows</span>
                  </li>
                  <li className="flex gap-4 items-start text-tertiary/80">
                    <span className="material-symbols-outlined">check_circle</span>
                    <span>AI-summarized violation histories and trends</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Features Bento Grid */}
        <section ref={addSectionRef} id="analytics" className="landing-section-fade py-48 px-4 md:px-[64px]">
          <div className="max-w-[1440px] mx-auto space-y-24">
            <div className="max-w-2xl mx-auto text-center space-y-6">
              <h2 className="font-headline-lg text-5xl">Investigative Suite</h2>
              <p className="text-on-surface-variant text-lg">Engineered for legal rigor and deep analytical insight, our feature set transforms investigative capability.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {[
                { icon: "auto_awesome", title: "AI Summaries", desc: "Instant narrative summaries of complex multi-year violation histories." },
                { icon: "link", title: "Linked Citations", desc: "Every AI claim is hyperlinked directly to the source inspection paragraph." },
                { icon: "domain", title: "Facility Profiles", desc: "Aggregated views of ownership, license history, and site locations." },
                { icon: "query_stats", title: "Inspector Analytics", desc: "Analyze leniency or stringency patterns across different inspectors." },
              ].map((f) => (
                <div key={f.title} className="p-10 landing-glass-panel border border-white/5 rounded-[2rem] hover:border-secondary/30 transition-all group relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-secondary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <span className="material-symbols-outlined text-secondary text-4xl mb-8 block">{f.icon}</span>
                  <h3 className="font-headline-sm text-2xl mb-4">{f.title}</h3>
                  <p className="text-on-surface-variant leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Evidence Architecture - Command Center Style */}
        <section ref={addSectionRef} className="landing-section-fade py-48 relative overflow-hidden" id="evidence-architecture">
          <div className="landing-spotlight" style={{ top: "20%", left: "40%", opacity: 0.15, width: "80vw", height: "80vw" }}></div>
          <div className="max-w-[1440px] mx-auto px-4 md:px-[64px] text-center space-y-32">
            <div className="max-w-3xl mx-auto space-y-6">
              <span className="font-code-data text-xs text-secondary tracking-[0.5em] uppercase">Investigative Architecture</span>
              <h2 className="font-headline-lg text-5xl">Evidence Intelligence Core</h2>
            </div>
            <div ref={containerRef} className="relative min-h-[850px] flex items-center justify-center">
              {/* Central Core */}
              <div ref={coreRef} className="relative z-20 landing-animate-float-core">
                <div className="absolute -inset-24 bg-secondary/10 rounded-full blur-[60px]" style={{ animation: "pulse 3s ease-in-out infinite" }}></div>
                <div className="w-72 h-72 rounded-full border border-secondary/30 flex flex-col items-center justify-center bg-black/40 backdrop-blur-xl relative overflow-hidden shadow-[0_0_60px_rgba(233,195,73,0.12)]">
                  <div className="absolute top-0 left-0 w-full h-[1px] bg-secondary/40 shadow-[0_0_10px_#e9c349] landing-animate-scan"></div>
                  <span className="material-symbols-outlined text-secondary text-7xl mb-4" style={{ fontVariationSettings: "'FILL' 1" }}>hub</span>
                  <div className="text-center space-y-1">
                    <span className="block font-code-data text-xs text-secondary tracking-widest">VAULT CORE</span>
                    <span className="block font-code-data text-[10px] text-on-surface-variant/50 uppercase">v4.2.0-ENCRYPTED</span>
                  </div>
                </div>
              </div>

              {/* SVG Lines */}
              <svg ref={svgRef} className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" preserveAspectRatio="none" viewBox="0 0 1000 850">
                <defs>
                  <linearGradient id="line-grad" x1="0%" x2="100%" y1="0%" y2="0%">
                    <stop offset="0%" stopColor="#b0efd5" stopOpacity="0.1" />
                    <stop offset="50%" stopColor="#e9c349" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#b0efd5" stopOpacity="0.1" />
                  </linearGradient>
                </defs>
                <g>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <path key={i} ref={(el) => (lineRefs.current[i] = el)} className="landing-line-connector" fill="none" stroke="url(#line-grad)" strokeWidth="1.5" />
                  ))}
                </g>
              </svg>

              {/* Operational Nodes */}
              <div className="absolute inset-0 z-30 pointer-events-none">
                {[
                  { idx: 0, pos: "top-[5%] left-1/2 -translate-x-1/2", code: "01 INGESTION", icon: "cloud_download", title: "USDA Records Harvesting", desc: "Inspection reports, Enforcement records, Source preservation", delay: "" },
                  { idx: 1, pos: "top-[35%] left-[5%]", code: "02 VISION", icon: "document_scanner", title: "OCR Document Processing", desc: "PDF text extraction, Entity recognition, Structured parsing", delay: "-3s" },
                  { idx: 2, pos: "top-[35%] right-[5%]", code: "03 ANALYTICS", icon: "query_stats", title: "Facility Insights", desc: "Historical comparisons, Violation tracking, Inspection patterns", delay: "-6s" },
                  { idx: 3, pos: "bottom-[10%] left-[10%]", code: "04 REASONING", icon: "psychology", title: "AI-Assisted Forensics", desc: "Evidence-linked summaries, Citation generation, Review workflows", delay: "-9s" },
                  { idx: 4, pos: "bottom-[10%] right-[10%]", code: "05 CUSTODY", icon: "verified", title: "Immutable Traceability", desc: "Source-linked findings, Citation navigation, Original references", delay: "-12s" },
                ].map((node) => (
                  <div
                    key={node.idx}
                    ref={(el) => (cardRefs.current[node.idx] = el)}
                    className={`absolute ${node.pos} w-80 landing-glass-panel border border-white/10 p-6 rounded-[1.5rem] hover:border-secondary/50 transition-colors pointer-events-auto landing-animate-float-slow`}
                    style={node.delay ? { animationDelay: node.delay } : undefined}
                  >
                    <div className="flex justify-between items-center mb-4">
                      <span className="font-code-data text-[10px] text-secondary tracking-widest">{node.code}</span>
                      <span className="material-symbols-outlined text-secondary text-xl">{node.icon}</span>
                    </div>
                    <h4 className="font-headline-sm text-lg mb-2">{node.title}</h4>
                    <p className="text-xs text-on-surface-variant leading-relaxed">{node.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Evidence Traceability Showcase */}
        <section ref={addSectionRef} className="landing-section-fade py-64 relative">
          <div className="landing-spotlight" style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)", opacity: 0.2, width: "80vw", height: "80vw", background: "radial-gradient(circle, rgba(176,239,213,0.06) 0%, transparent 60%)" }}></div>
          <div className="max-w-[1440px] mx-auto px-4 md:px-[64px] grid grid-cols-1 lg:grid-cols-2 gap-32 items-center relative z-10">
            <div className="space-y-12">
              <div className="space-y-6">
                <span className="font-label-caps text-secondary tracking-[0.4em] uppercase">Premium Protocol</span>
                <h2 className="font-headline-lg text-6xl leading-tight">Ironclad Traceability</h2>
                <p className="text-xl text-on-surface-variant leading-relaxed">Our "Source-to-Insight" engine ensures that every analytical claim is legally defensible. No hallucination, just high-fidelity cross-referencing.</p>
              </div>
              <div className="grid grid-cols-1 gap-6">
                <div className="flex gap-6 p-8 landing-glass-panel border border-white/5 rounded-3xl hover:border-secondary/20 transition-colors group">
                  <span className="material-symbols-outlined text-secondary text-3xl">fact_check</span>
                  <div>
                    <h4 className="font-bold text-lg text-on-surface mb-2">Verified Citations</h4>
                    <p className="text-on-surface-variant">One-click jump from analysis to PDF source coordinates with sub-pixel precision.</p>
                  </div>
                </div>
                <div className="flex gap-6 p-8 landing-glass-panel border border-white/5 rounded-3xl hover:border-secondary/20 transition-colors group">
                  <span className="material-symbols-outlined text-secondary text-3xl">security</span>
                  <div>
                    <h4 className="font-bold text-lg text-on-surface mb-2">Source Preservation</h4>
                    <p className="text-on-surface-variant">Original documents are cryptographically hashed for legal chain of custody and provenance.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="relative">
              <div className="absolute -inset-16 bg-secondary/10 rounded-full blur-[60px]"></div>
              <div className="landing-glass-panel p-10 border border-white/20 rounded-[3rem] shadow-[0_50px_100px_rgba(0,0,0,0.6)] space-y-10 relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="font-code-data text-xs text-secondary tracking-widest">AI_INSIGHT_DECRYPTED</span>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-tertiary rounded-full animate-pulse"></span>
                    <span className="px-3 py-1 bg-tertiary/10 text-tertiary text-[10px] font-bold rounded-full border border-tertiary/20">HIGH CONFIDENCE</span>
                  </div>
                </div>
                <p className="font-headline-sm text-2xl leading-relaxed text-on-surface">"The facility shows a 23% increase in veterinary care violations (Section 2.40) over the last 18 months..."</p>
                <div className="bg-black/40 p-8 rounded-2xl border border-secondary/10 relative overflow-hidden group">
                  <div className="absolute top-0 left-0 w-1 h-full bg-secondary"></div>
                  <div className="font-code-data text-[10px] text-secondary mb-4 tracking-widest uppercase">Linked Source Document</div>
                  <p className="text-sm font-code-data text-on-surface-variant leading-relaxed">
                    [PDF: 2024-03-22_INSP_9122] ...Inspector noted <span className="text-secondary bg-secondary/10 px-1 rounded">significant accumulation of biological waste</span> in the surgical preparation room...
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Designed For Section */}
        <section ref={addSectionRef} className="landing-section-fade py-32 px-4 md:px-[64px] relative overflow-hidden">
          <div className="max-w-[1440px] mx-auto space-y-20">
            <div className="text-center">
              <h2 className="font-headline-lg text-4xl md:text-5xl tracking-tight">Designed For the Frontlines of Oversight</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
              {[
                { icon: "gavel", label: "Legal Teams" },
                { icon: "search", label: "Investigators" },
                { icon: "groups", label: "Advocacy Org" },
                { icon: "terminal", label: "Research Staff" },
                { icon: "security", label: "Policy Analysts" },
              ].map((item) => (
                <div key={item.label} className="p-8 landing-glass-panel border border-white/5 rounded-2xl flex flex-col items-center text-center gap-6 hover:border-secondary/30 transition-colors group">
                  <div className="w-16 h-16 rounded-xl bg-secondary/10 flex items-center justify-center text-secondary group-hover:scale-110 transition-transform">
                    <span className="material-symbols-outlined text-3xl">{item.icon}</span>
                  </div>
                  <h4 className="font-bold text-lg">{item.label}</h4>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section ref={addSectionRef} className="landing-section-fade py-64 relative text-center">
          <div className="landing-spotlight" style={{ bottom: 0, left: "50%", transform: "translateX(-50%)", opacity: 0.2, width: "100vw", height: "80vw", background: "radial-gradient(circle, rgba(233,195,73,0.04) 0%, transparent 50%)" }}></div>
          <div className="max-w-4xl mx-auto px-4 md:px-[64px] space-y-16 relative z-10">
            <div className="space-y-6">
              <h2 className="font-headline-lg text-6xl tracking-tight">Secure the Future <br />of Accountability.</h2>
              <p className="text-xl text-on-surface-variant">Join the next generation of investigative intelligence.</p>
            </div>
            <div className="flex flex-col md:flex-row justify-center items-center gap-8">
              <button onClick={() => openLogin("signup")} className="bg-secondary text-on-secondary px-14 py-6 rounded-2xl font-bold text-xl hover:scale-105 transition-all shadow-[0_25px_50px_-12px_rgba(233,195,73,0.5)]">
                Launch Platform
              </button>
              <button onClick={() => openLogin("login")} className="landing-glass-panel border border-white/10 px-14 py-6 rounded-2xl font-bold text-xl hover:bg-white/10 transition-all">
                View Dashboard
              </button>
            </div>
            <div className="pt-12">
              <a className="inline-flex items-center gap-3 text-on-surface-variant/60 hover:text-secondary transition-colors font-code-data text-xs tracking-widest" href="#">
                <span className="material-symbols-outlined">terminal</span> GITHUB REPOSITORY / OPEN SOURCE CORE
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full py-24 px-4 md:px-[64px] bg-black/40 backdrop-blur-xl border-t border-white/5 relative z-20">
        <div className="max-w-[1440px] mx-auto grid grid-cols-1 md:grid-cols-2 gap-24 items-start">
          <div className="space-y-8">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-secondary text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>analytics</span>
              <span className="font-headline-sm text-2xl font-bold text-on-surface">AWA Insight</span>
            </div>
            <p className="font-body-sm text-on-surface-variant max-w-sm leading-relaxed">
              © 2024 AWA Records. All rights reserved. <br /><br />
              <span className="opacity-50">Investigative data derived from public records. We provide the tools to navigate; the evidence remains the source of truth.</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-24 md:justify-end">
            <div className="space-y-6">
              <h5 className="font-label-caps text-secondary uppercase tracking-[0.3em]">Navigation</h5>
              <ul className="space-y-3">
                <li><a className="text-on-surface-variant hover:text-secondary transition-all" href="#">Documentation</a></li>
                <li><a className="text-on-surface-variant hover:text-secondary transition-all" href="#">Research Hub</a></li>
                <li><a className="text-on-surface-variant hover:text-secondary transition-all" href="#">Developer API</a></li>
              </ul>
            </div>
            <div className="space-y-6">
              <h5 className="font-label-caps text-secondary uppercase tracking-[0.3em]">Legal</h5>
              <ul className="space-y-3">
                <li><a className="text-on-surface-variant hover:text-secondary transition-all" href="#">Privacy Policy</a></li>
                <li><a className="text-on-surface-variant hover:text-secondary transition-all" href="#">Data Handling</a></li>
                <li><a className="text-on-surface-variant hover:text-secondary transition-all" href="#">Security Core</a></li>
              </ul>
            </div>
          </div>
        </div>
      </footer>

      {/* Login/Signup Drawer Overlay */}
      <div 
        className={`landing-drawer-backdrop ${showLogin ? "active" : ""}`}
        onClick={closeLogin}
      >
        <div 
          className="landing-drawer-container"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Left Pane (Platform Status) */}
          <div className="landing-drawer-info-pane hidden md:flex flex-col justify-between p-12 text-left h-full">
            <div className="space-y-12">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-secondary text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>analytics</span>
                <span className="font-headline-sm text-xl font-bold text-on-surface">AWA Insight</span>
              </div>

              <div className="space-y-10 pt-8">
                <div className="space-y-2">
                  <span className="block font-code-data text-[10px] text-on-surface-variant/40 tracking-[0.2em] uppercase">Platform Status</span>
                  <span className="block font-code-data text-xs text-secondary font-bold tracking-widest">OPERATIONAL</span>
                </div>

                <div className="space-y-2">
                  <span className="block font-code-data text-[10px] text-on-surface-variant/40 tracking-[0.2em] uppercase">Data Sources</span>
                  <span className="block font-code-data text-xs text-secondary font-bold tracking-widest">USDA inspection archives<br />synchronized</span>
                </div>

                <div className="space-y-2">
                  <span className="block font-code-data text-[10px] text-on-surface-variant/40 tracking-[0.2em] uppercase">Analytics Engine</span>
                  <span className="block font-code-data text-xs text-secondary font-bold tracking-widest">AI-assisted summaries and<br />citation workflows active</span>
                </div>
              </div>
            </div>

            <div className="font-code-data text-[9px] text-on-surface-variant/30 leading-relaxed tracking-wider uppercase">
              © 2024 AWA Intelligence.<br />
              Investigative data derived from<br />
              public USDA records.
            </div>
          </div>

          {/* Right Pane (Auth Form) */}
          <div className="landing-drawer-form-pane landing-auth-scan-lines flex flex-col justify-between p-8 md:p-12 text-left h-full overflow-y-auto">
            {/* Close button */}
            <button 
              onClick={closeLogin} 
              className="absolute top-6 right-6 text-on-surface-variant/60 hover:text-on-surface transition-colors focus:outline-none"
            >
              <span className="material-symbols-outlined text-2xl">close</span>
            </button>

            <div className="space-y-8 my-auto max-w-md w-full mx-auto">
              {/* Header */}
              <div className="space-y-4">
                <h2 className="font-headline-sm text-3xl md:text-4xl text-on-surface tracking-tight font-bold">
                  AWA Intelligence Platform
                </h2>
                <p className="text-sm text-on-surface-variant/80 leading-relaxed">
                  Access USDA inspection records, facility reports, enforcement history, AI-generated summaries, and investigative analytics through a unified intelligence dashboard.
                </p>
              </div>

              {/* Tabs */}
              <div className="flex gap-8 border-b border-white/5 pb-2 text-xs font-bold tracking-widest">
                <button 
                  type="button"
                  onClick={() => {
                    setFormError("");
                    setFieldErrors({});
                    setActiveTab("login");
                  }}
                  className={`pb-2 transition-all relative ${activeTab === "login" ? "text-secondary" : "text-on-surface-variant/60 hover:text-on-surface"}`}
                >
                  LOGIN
                  {activeTab === "login" && (
                    <span className="absolute bottom-[-9px] left-0 right-0 h-[2px] bg-secondary"></span>
                  )}
                </button>
                <button 
                  type="button"
                  onClick={() => {
                    setFormError("");
                    setFieldErrors({});
                    setActiveTab("signup");
                  }}
                  className={`pb-2 transition-all relative ${activeTab === "signup" ? "text-secondary" : "text-on-surface-variant/60 hover:text-on-surface"}`}
                >
                  CREATE IDENTITY
                  {activeTab === "signup" && (
                    <span className="absolute bottom-[-9px] left-0 right-0 h-[2px] bg-secondary"></span>
                  )}
                </button>
              </div>

              {/* Error messages */}
              {formError && (
                <div className="p-3.5 bg-error-container/10 border border-error/30 text-error text-xs rounded-xl flex items-start gap-2.5">
                  <span className="material-symbols-outlined text-base">error</span>
                  <span>{formError}</span>
                </div>
              )}

              {/* Forms */}
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <h4 className="font-code-data text-[10px] text-secondary/80 tracking-widest mb-3 uppercase">
                    {activeTab === "login" ? "Sign in to continue" : "Create new identity"}
                  </h4>
                  <p className="text-xs text-on-surface-variant/50 leading-relaxed">
                    {activeTab === "login" 
                      ? "Enter your authorized credentials to access the investigative portal." 
                      : "Register your email address to initialize your enforcement workspace."
                    }
                  </p>
                </div>

                {activeTab === "signup" && (
                  <div className="space-y-2">
                    <label className="block font-code-data text-[10px] text-on-surface-variant/60 tracking-wider uppercase">Full Name</label>
                    <input 
                      type="text" 
                      placeholder="Enter full name" 
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className={`w-full bg-black/40 border ${fieldErrors.fullName ? "border-error/50" : "border-white/10"} rounded-xl px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/30 focus:border-secondary/50 focus:outline-none transition-colors`}
                    />
                    {fieldErrors.fullName && (
                      <p className="text-[10px] text-error mt-0.5">{fieldErrors.fullName}</p>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="block font-code-data text-[10px] text-on-surface-variant/60 tracking-wider uppercase">Work Email</label>
                  <input 
                    type="email" 
                    placeholder="Enter platform credentials" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`w-full bg-black/40 border ${fieldErrors.email ? "border-error/50" : "border-white/10"} rounded-xl px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/30 focus:border-secondary/50 focus:outline-none transition-colors`}
                  />
                  {fieldErrors.email && (
                    <p className="text-[10px] text-error mt-0.5">{fieldErrors.email}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="block font-code-data text-[10px] text-on-surface-variant/60 tracking-wider uppercase">Password</label>
                  <input 
                    type="password" 
                    placeholder="Secure verification required" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`w-full bg-black/40 border ${fieldErrors.password ? "border-error/50" : "border-white/10"} rounded-xl px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/30 focus:border-secondary/50 focus:outline-none transition-colors`}
                  />
                  {fieldErrors.password && (
                    <p className="text-[10px] text-error mt-0.5">{fieldErrors.password}</p>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs text-on-surface-variant/80">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" className="rounded bg-black/40 border-white/10 text-secondary focus:ring-0 focus:ring-offset-0" />
                    <span>Keep session active on this device</span>
                  </label>
                  <a href="#" onClick={(e) => { e.preventDefault(); alert("Verification link sent."); }} className="text-secondary hover:underline">Reset Credentials</a>
                </div>

                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="w-full bg-[#a8e6cf] hover:bg-[#9fe2bf] disabled:bg-slate-700 disabled:text-slate-400 text-black font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99] transition-all shadow-[0_4px_20px_rgba(168,230,207,0.2)]"
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <span className="uppercase tracking-widest text-xs">
                        {activeTab === "login" ? "Access Platform" : "Create Account"}
                      </span>
                      <span className="material-symbols-outlined text-base">arrow_forward</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            <div className="text-[10px] text-on-surface-variant/40 leading-relaxed text-center max-w-md w-full mx-auto pt-6 border-t border-white/5">
              AWA Intelligence aggregates and analyzes publicly available USDA inspection and enforcement records through AI-powered investigative workflows.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
