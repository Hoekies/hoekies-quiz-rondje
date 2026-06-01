import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hoe doe je mee? — Hoekies Quiz Rondje",
  description: "Uitleg voor spelers: zo doe je mee aan de Hoekies Quiz Rondje",
};

const STAPPEN = [
  {
    nr: "1",
    titel: "Open de link of scan de QR-code",
    tekst: "De host stuurt je een link via WhatsApp, of je scant de QR-code die op het scherm staat. Je opent de pagina in je telefoonbrowser — geen app nodig.",
  },
  {
    nr: "2",
    titel: "Voer je naam in",
    tekst: "Kies een naam (maximaal 24 tekens). De naam mag maar één keer voorkomen per quiz. Klik op 'Meedoen' en wacht tot de quiz begint.",
  },
  {
    nr: "3",
    titel: "Beantwoord de vragen",
    tekst: "Als een vraag verschijnt, tik je zo snel mogelijk op het juiste antwoord. Hoe sneller je antwoordt, hoe meer punten je krijgt. Sommige vragen zijn anders — lees de instructie op je scherm.",
  },
  {
    nr: "4",
    titel: "Bekijk de tussenstand",
    tekst: "Na elke vraag zie je of je goed zat en hoeveel punten je hebt verdiend. Via de tussenstand-scherm zie je wie er op dat moment aan de leiding staat.",
  },
  {
    nr: "5",
    titel: "Strijden om de winst!",
    tekst: "Vlak voor de laatste vraag verschijnt een motivatiescherm met jouw huidige positie. Geef alles! Na de laatste vraag verschijnt de eindstand met de winnaar.",
  },
];

const VRAAGTYPES = [
  { icon: "🔤", naam: "Meerkeuze", uitleg: "Tik op de juiste optie (A, B, C of D)." },
  { icon: "✔️", naam: "Waar/Niet waar", uitleg: "Kies Waar of Niet waar." },
  { icon: "🖼️", naam: "Afbeelding als vraag", uitleg: "Bekijk de foto en kies het juiste tekstantwoord." },
  { icon: "🎵", naam: "Audio als vraag", uitleg: "Luister naar het geluidsfragment en kies het juiste antwoord." },
  { icon: "🎶", naam: "Raad het lied", uitleg: "De muziek speelt automatisch een paar seconden. Raad welk nummer of artiest het is!" },
  { icon: "🎬", naam: "Video als vraag", uitleg: "Bekijk de videoclip en beantwoord de vraag." },
  { icon: "🌫️", naam: "Vervagend beeld", uitleg: "Een afbeelding wordt steeds scherper. Raad het zo vroeg mogelijk — hoe eerder hoe meer punten!" },
  { icon: "🖼️🖼️", naam: "Afbeelding als antwoord", uitleg: "Kies één van vier afbeeldingen als antwoord." },
  { icon: "🎚️", naam: "Schatting", uitleg: "Schuif de slider naar jouw schatting. Hoe dichter bij het goede antwoord, hoe meer punten." },
  { icon: "🔗", naam: "Koppelen", uitleg: "Koppel drie items links (A, B, C) aan drie items rechts. Tik eerst een item links aan, dan het bijpassende item rechts. Bevestig als alle koppelingen gemaakt zijn." },
];

export default function InstructiesPage() {
  return (
    <main style={{ minHeight: "100dvh", background: "var(--game-gradient)", padding: "clamp(24px, 5vw, 48px) clamp(16px, 4vw, 32px)" }}>
      <div style={{ maxWidth: "600px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "32px" }}>

        {/* Header */}
        <div style={{ textAlign: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-vierkant.png" alt="Hoekies Quiz Rondje" style={{ width: "100px", height: "100px", objectFit: "contain", marginBottom: "16px" }} />
          <h1 style={{ color: "#fff", fontWeight: 900, fontSize: "clamp(1.4rem, 5vw, 2rem)", marginBottom: "8px" }}>Hoe doe je mee?</h1>
          <p style={{ color: "var(--muted)", fontSize: "0.95rem" }}>Alles wat je moet weten als speler</p>
        </div>

        {/* Stappen */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <p style={{ color: "var(--muted)", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Stap voor stap</p>
          {STAPPEN.map((stap) => (
            <div key={stap.nr} style={{ display: "flex", gap: "16px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: "14px", padding: "16px 18px" }}>
              <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "var(--cyan)", color: "#000", fontWeight: 900, fontSize: "0.95rem", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {stap.nr}
              </div>
              <div>
                <p style={{ color: "#fff", fontWeight: 700, fontSize: "0.95rem", marginBottom: "4px" }}>{stap.titel}</p>
                <p style={{ color: "var(--text)", fontSize: "0.875rem", lineHeight: 1.55 }}>{stap.tekst}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Puntensysteem */}
        <div style={{ background: "rgba(13,180,171,0.07)", border: "1px solid rgba(13,180,171,0.2)", borderRadius: "14px", padding: "20px" }}>
          <p style={{ color: "var(--cyan)", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px" }}>Puntensysteem</p>
          <p style={{ color: "var(--text)", fontSize: "0.875rem", lineHeight: 1.7 }}>
            Goed antwoord = <strong style={{ color: "#fff" }}>100 punten</strong> + snelheidsbonus tot <strong style={{ color: "#fff" }}>50 extra punten</strong>.<br />
            Hoe sneller je antwoordt, hoe meer punten je krijgt.<br />
            Sommige vragen zijn <strong style={{ color: "var(--gold)" }}>dubbele punten</strong> waard — de host kondigt dit aan.
          </p>
        </div>

        {/* Vraagtypen */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <p style={{ color: "var(--muted)", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Soorten vragen</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "8px" }}>
            {VRAAGTYPES.map((vt) => (
              <div key={vt.naam} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "10px", padding: "12px 14px" }}>
                <p style={{ color: "#fff", fontWeight: 700, fontSize: "0.88rem" }}>{vt.icon} {vt.naam}</p>
                <p style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: "3px", lineHeight: 1.45 }}>{vt.uitleg}</p>
              </div>
            ))}
          </div>
        </div>

        <p style={{ color: "var(--muted)", fontSize: "0.8rem", textAlign: "center" }}>Veel plezier en succes! 🍻</p>
      </div>
    </main>
  );
}
