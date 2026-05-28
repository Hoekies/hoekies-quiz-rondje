"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";

export default function CreateSessionButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleCreate() {
    setLoading(true);
    setError("");

    const user = auth.currentUser;
    if (!user) {
      router.push("/admin/login");
      return;
    }

    const token = await user.getIdToken(true); // force refresh om custom claims op te halen

    const res = await fetch("/api/host/sessie", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });

    const json = await res.json();

    if (!res.ok) {
      setError(json.error ?? "Er ging iets fout");
      setLoading(false);
      return;
    }

    router.push(`/admin/sessie/${json.code}`);
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleCreate}
        disabled={loading}
        className="w-full py-4 rounded-xl font-black text-white text-lg transition-all active:scale-95 disabled:opacity-60"
        style={{ background: "var(--cyan)", boxShadow: "var(--crt-glow)" }}
      >
        {loading ? "Aanmaken..." : "Nieuwe sessie starten"}
      </button>
      {error && <p className="text-red-400 text-sm text-center">{error}</p>}
    </div>
  );
}
