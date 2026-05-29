import { Link, useLocation } from "react-router-dom";

export default function Navbar() {
  const location = useLocation();

  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: "56px",
        backgroundColor: "#1a4731",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 2rem",
        zIndex: 1000,
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
      }}
    >
      {/* Left side */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <span style={{ fontSize: "1.5rem" }}>🛡️</span>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <span style={{ color: "white", fontWeight: "bold", fontSize: "1.1rem", lineHeight: "1.2" }}>
            AWA Records Platform
          </span>
          <span style={{ color: "#a7f3d0", fontSize: "0.75rem", lineHeight: "1.2" }}>
            Animal Welfare Investigation Tool
          </span>
        </div>
      </div>

      {/* Right side */}
      <div style={{ display: "flex", gap: "1.5rem" }}>
        <Link
          to="/"
          style={{
            color: location.pathname === "/" ? "white" : "#a7f3d0",
            textDecoration: location.pathname === "/" ? "underline" : "none",
            fontWeight: "500",
            fontSize: "0.95rem",
          }}
        >
          Search
        </Link>
        <Link
          to="/dashboard"
          style={{
            color: location.pathname === "/dashboard" ? "white" : "#a7f3d0",
            textDecoration: location.pathname === "/dashboard" ? "underline" : "none",
            fontWeight: "500",
            fontSize: "0.95rem",
          }}
        >
          Dashboard
        </Link>
        <Link
          to="/enforcement"
          style={{
            color: location.pathname === "/enforcement" ? "white" : "#a7f3d0",
            textDecoration: location.pathname === "/enforcement" ? "underline" : "none",
            fontWeight: "500",
            fontSize: "0.95rem",
          }}
        >
          Enforcement
        </Link>
      </div>
    </nav>
  );
}
