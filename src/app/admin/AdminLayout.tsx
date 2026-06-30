"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

interface Props { children: React.ReactNode; title: string; }

export default function AdminLayout({ children, title }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    await signOut(auth);
    router.push("/admin/login");
  }

  const navItems = [
    { href: "/admin",            label: "Dashboard",      icon: "⚡" },
    { href: "/admin/quiz",       label: "Vragen",         icon: "📝" },
    { href: "/admin/thema",      label: "Thema",          icon: "🎨" },
    { href: "/admin/instellingen", label: "WhatsApp",     icon: "💬" },
    { href: "/admin/handleiding",  label: "Hulp",         icon: "📖" },
  ];

  return (
    <div className="admin-shell">
      {/* Mobile topbar */}
      <div className="admin-mobile-topbar">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-vierkant.png" alt="logo" style={{ height: "32px", width: "32px", objectFit: "contain", borderRadius: "6px" }} />
          <span style={{ fontWeight: 800, fontSize: "0.9rem", color: "#fff" }}>Quiz Rondje</span>
        </div>
        <button className="admin-hamburger" onClick={() => setSidebarOpen(true)} aria-label="Menu">
          <span /><span /><span />
        </button>
      </div>

      {/* Sidebar overlay op mobile */}
      {sidebarOpen && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 140 }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`admin-sidebar${sidebarOpen ? " admin-sidebar--open" : ""}`}>
        <div className="admin-sidebar-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-vierkant.png" alt="Hoekies Quiz" />
        </div>

        <nav className="admin-nav">
          <span className="admin-nav-section">Beheer</span>
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`admin-nav-link${pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href)) ? " actief" : ""}`}
              onClick={() => setSidebarOpen(false)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </a>
          ))}
        </nav>

        <div className="admin-sidebar-bottom">
          <button className="admin-signout" onClick={handleSignOut}>
            <span className="nav-icon">↩</span>
            <span>Uitloggen</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="admin-main">
        <div className="admin-topbar">
          <span className="admin-topbar-titel">{title}</span>
        </div>
        <div className="admin-content">
          {children}
        </div>
      </div>
    </div>
  );
}
