"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function QRPage() {
  const { code } = useParams<{ code: string }>();
  const [qrUrl, setQrUrl] = useState("");

  useEffect(() => {
    const joinUrl = `${window.location.origin}/speel/${code}`;
    QRCode.toDataURL(joinUrl, { width: 400, margin: 2 }).then(setQrUrl);
  }, [code]);

  const joinUrl = typeof window !== "undefined" ? `${window.location.origin}/speel/${code}` : "";

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center gap-6 p-8 scanlines"
      style={{ background: "var(--game-gradient)" }}
    >
      <h1
        className="text-white font-black text-center"
        style={{ fontSize: "clamp(1.5rem, 5vw, 3rem)", textShadow: "0 0 20px rgba(13,180,171,0.6)" }}
      >
        Scan om mee te doen
      </h1>

      {qrUrl && (
        <div className="bg-white p-4 rounded-2xl shadow-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrUrl} alt="QR code" width={300} height={300} />
        </div>
      )}

      <div className="flex flex-col items-center gap-2">
        <p className="text-white/60 text-lg">of ga naar</p>
        <p
          className="text-white font-black tracking-wide"
          style={{ fontSize: "clamp(1rem, 3vw, 1.5rem)" }}
        >
          {joinUrl}
        </p>
      </div>

      <div
        className="px-8 py-3 rounded-full font-black text-3xl tracking-widest"
        style={{
          background: "rgba(13,180,171,0.2)",
          border: "2px solid rgba(13,180,171,0.5)",
          color: "var(--cyan)",
          textShadow: "0 0 20px rgba(13,180,171,0.6)",
        }}
      >
        {code}
      </div>

      <button
        onClick={() => window.close()}
        className="text-white/30 text-sm hover:text-white/60 transition-colors mt-4"
      >
        Sluiten ✕
      </button>
    </main>
  );
}
