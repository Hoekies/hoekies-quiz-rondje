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
    { href: "/admin", label: "Dashboard", icon: "🎮" },
    { href: "/admin/quiz", label: "Vragen beheren", icon: "📝" },
    { href: "/admin/thema", label: "Thema quiz", icon: "🎨" },
    { href: "/admin/instellingen", label: "WhatsApp", icon: "💬" },
    { href: "/admin/handleiding", label: "Hulp", icon: "📖" },
  ];

  return (
    <div className="admin-shell">
      {/* Mobile topbar */}
      <div className="admin-mobile-topbar">
        <img src="/logo.png" alt="logo" style={{ height: "36px", objectFit: "contain" }} />
        <button className="admin-hamburger" onClick={() => setSidebarOpen(true)} aria-label="Menu">
          <span /><span /><span />
        </button>
      </div>

      {/* Sidebar overlay op mobile */}
      {sidebarOpen && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 140 }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`admin-sidebar${sidebarOpen ? " admin-sidebar--open" : ""}`}>
        <div className="admin-sidebar-logo">
          <img src="/logo-vierkant.png" alt="Hoekies Quiz" style={{ width: "80%", objectFit: "contain", display: "block" }} />
        </div>
        <nav className="admin-nav">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`admin-nav-link${pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href)) ? " actief" : ""}`}
              onClick={() => setSidebarOpen(false)}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </a>
          ))}
        </nav>
        <div style={{ padding: "0 10px 20px" }}>
          <button className="sidebar-actie-knop sidebar-actie-knop--gevaar sidebar-actie-knop--groot" onClick={handleSignOut}>
            → Uitloggen
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
