"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import AdminLayout from "../AdminLayout";

interface Section { title: string; steps: { icon: string; title: string; body: string }[] }

const SECTIES: Section[] = [
  {
    title: "1. Quiz voorbereiden",
    steps: [
      { icon: "📝", title: "Vragen aanmaken of importeren", body: "Ga naar 'Vragen beheren'. Maak vragen via '+&nbsp;Nieuwe vraag' (14 vraagtypen, zie onder). Onderaan kun je de standaard quizzen laden: 5 rondes (Sport, Muziek, Algemeen, Weer, TV) met 5 vragen elk en antwoorden in willekeurige volgorde. CSV-import (⬆️) en -export (⬇️) zijn ook beschikbaar." },
      { icon: "🖼️", title: "Afbeeldingen & test", body: "Elke afbeelding kun je uploaden of als URL plakken, en daarna vierkant bijsnijden/inzoomen met ✂️. Een geplakte Wikipedia 'File:'-pagina wordt automatisch een directe afbeelding. Met '🧪 Test deze vraag' speel je de vraag interactief na — inclusief goed/fout en punten — zonder sessie." },
      { icon: "🗂️", title: "Rondes beheren", body: "In 'Vragen beheren' kies je een ronde-tab. Daar hernoem je de ronde of verwijder je de hele ronde (🗑️ Ronde verwijderen)." },
      { icon: "🎨", title: "Thema instellen", body: "Ga naar 'Thema quiz'. Upload een vierkant logo (met zoom + crop) en een achtergrondfoto voor het leaderboard en de inlogpagina." },
      { icon: "➕", title: "Sessie aanmaken", body: "Klik op '+ Nieuwe sessie' op het dashboard. De sessie staat op Inactief. Zet de toggle op Actief zodra spelers mogen joinen." },
    ],
  },
  {
    title: "2. Sessie starten",
    steps: [
      { icon: "🔛", title: "Sessie activeren", body: "Zet de toggle 'Actief' aan. Bij de sessie staan de links QR ↗, Presentatie ↗ en een WhatsApp-deelknop. Spelers joinen via de QR of via hoekies-quiz-rondje.vercel.app/speel/CODE." },
      { icon: "📺", title: "Presentatiescherm", body: "Open 'Presentatie ↗' op een beamer of groot scherm. Daar zien de gasten de vragen, media (video met geluid!), antwoorden en de tussenstand." },
      { icon: "🚀", title: "Quiz starten", body: "Wacht tot alle spelers ingelogd zijn (je ziet het aantal live) en klik op '🚀 Start quiz'." },
    ],
  },
  {
    title: "3. Tijdens de quiz",
    steps: [
      { icon: "❓", title: "Vragen doorlopen", body: "Eén knop beweegt mee: Start quiz → 🔒 Sluit antwoorden → 📊 Leaderboard → ➡ Volgende vraag. Bij sluiten zien speler en presentatie het juiste antwoord en de antwoordverdeling. De vraag sluit ook automatisch op tijd of als iedereen geantwoord heeft." },
      { icon: "🍺", title: "Pauzeren", body: "Pauzeer tussen vragen met '🍺 Pauzeer'. Bij hervatten volgt een aftelling van 10 seconden." },
      { icon: "🏁", title: "Eerder stoppen", body: "'⏸ Stop na deze vraag' beëindigt de quiz na het eerstvolgende leaderboard. '🏁 Beëindig spel' toont direct de eindstand zonder de sessie te sluiten." },
    ],
  },
  {
    title: "4. Afsluiten",
    steps: [
      { icon: "🏆", title: "Eindscherm", body: "Het eindscherm verschijnt bij alle spelers met de winnaar en top 3. De sessie blijft open — sluit hem zelf via de toggle of verwijder hem." },
      { icon: "🔄", title: "Sessie resetten", body: "'🗑 Resetten' zet alle scores op 0, wist alle antwoorden en logt alle spelers uit. Ze moeten opnieuw joinen." },
      { icon: "🗑️", title: "Sessie verwijderen", body: "Verwijder een sessie via het ✕ icoontje op het dashboard. Dit kan niet ongedaan worden gemaakt." },
    ],
  },
];

const VRAAGTYPES = [
  { type: "Afbeelding als vraag", icon: "🖼️", uitleg: "Toon een foto. Antwoordtype: 4 keuzes, waar/onjuist of open." },
  { type: "Audio / raad het lied", icon: "🎵", uitleg: "Upload MP3, kies startpunt + duur (5/10s). Speelt dat segment." },
  { type: "Vervagend beeld", icon: "🌫️", uitleg: "Begint wazig en wordt scherper tijdens het aftellen." },
  { type: "Inzoomende afbeelding", icon: "🔍", uitleg: "Begint sterk ingezoomd en zoomt langzaam uit." },
  { type: "Puzzelafbeelding", icon: "🧩", uitleg: "Beeld wordt tegel voor tegel zichtbaar." },
  { type: "Video als vraag", icon: "🎬", uitleg: "YouTube of MP4. Geluid aan/uit instelbaar; speelt op het presentatiescherm." },
  { type: "Afbeelding als antwoord", icon: "🖼️🖼️", uitleg: "4 afbeeldingen als antwoordopties (2×2)." },
  { type: "Vier foto's, één antwoord", icon: "🖼️🔤", uitleg: "4 foto's; speler typt het verbindende woord." },
  { type: "Anagram", icon: "🔀", uitleg: "Geschudde letters; speler typt het woord." },
  { type: "Gatentekst", icon: "✏️", uitleg: "Zin met ___; speler typt het ontbrekende woord." },
  { type: "Wie ben ik? (hints)", icon: "🕵️", uitleg: "Hints verschijnen één voor één; sneller = meer punten." },
  { type: "Schatting (slider)", icon: "🎚️", uitleg: "Getal raden; punten op basis van nabijheid." },
  { type: "Meerdere juiste antwoorden", icon: "✅", uitleg: "Speler kiest álle juiste opties. Hele set goed = punten." },
  { type: "Koppelen (match)", icon: "🔗", uitleg: "3 items links koppelen aan 3 rechts. Optioneel met afbeelding." },
];

export default function HandleidingPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => { if (!u) router.push("/admin/login"); else setAuthChecked(true); });
    return unsub;
  }, [router]);
  if (!authChecked) return null;

  const card = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: "12px", padding: "16px 20px" };
  const L = { color: "var(--muted)", fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.02em" };

  return (
    <AdminLayout title="Hulp">
      <div style={{ display: "flex", flexDirection: "column", gap: "32px", maxWidth: "680px" }}>

        <p style={{ color: "var(--text)", fontSize: "1rem", lineHeight: 1.6 }}>
          Welkom bij de admin-handleiding van Hoekies Quiz Rondje. Hieronder vind je stap-voor-stap uitleg over het voorbereiden, starten en leiden van een quiz.
        </p>

        {SECTIES.map((sectie) => (
          <div key={sectie.title} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <p style={L}>{sectie.title}</p>
            {sectie.steps.map((stap) => (
              <div key={stap.title} style={{ ...card, display: "flex", gap: "14px" }}>
                <span style={{ fontSize: "1.4rem", flexShrink: 0 }}>{stap.icon}</span>
                <div>
                  <p style={{ color: "#fff", fontWeight: 700, fontSize: "0.95rem", marginBottom: "4px" }}>{stap.title}</p>
                  <p style={{ color: "var(--text)", fontSize: "0.875rem", lineHeight: 1.55 }} dangerouslySetInnerHTML={{ __html: stap.body }} />
                </div>
              </div>
            ))}
          </div>
        ))}

        {/* Vraagtypen overzicht */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <p style={L}>Beschikbare vraagtypen</p>
          <div style={{ ...card, borderColor: "rgba(13,180,171,0.25)", background: "rgba(13,180,171,0.05)" }}>
            <p style={{ color: "var(--text)", fontSize: "0.82rem", lineHeight: 1.55 }}>
              Bij media-vragen (afbeelding, audio, vervagend beeld, video, inzoomende afbeelding, puzzelafbeelding) kies je het <strong style={{ color: "#fff" }}>antwoordtype</strong>: 4&nbsp;keuzes, Waar/Onjuist of Open vraag (vrij typen). Het juiste antwoord markeer je met het groene vinkje naast de optie.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "10px" }}>
            {VRAAGTYPES.map((vt) => (
              <div key={vt.type} style={{ ...card }}>
                <p style={{ color: "#fff", fontWeight: 700, fontSize: "0.88rem" }}>{vt.icon} {vt.type}</p>
                <p style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: "4px", lineHeight: 1.5 }}>{vt.uitleg}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Punten systeem */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <p style={L}>Puntensysteem</p>
          <div style={card}>
            <p style={{ color: "var(--text)", fontSize: "0.875rem", lineHeight: 1.7 }}>
              <strong style={{ color: "#fff" }}>Basis:</strong> Goed antwoord = base_points ÷ 10 punten (standaard 100 punten).<br />
              <strong style={{ color: "#fff" }}>Snelheidsbonus:</strong> Tot 50 extra punten als je snel antwoordt (hoe sneller, hoe meer).<br />
              <strong style={{ color: "#fff" }}>Bonus (2×):</strong> Zet de Bonus-knop aan bij het maken van de vraag voor dubbele punten.<br />
              <strong style={{ color: "#fff" }}>Schatting:</strong> Punten op basis van hoe dicht bij het correcte getal (max bij exact goed, 0 bij grote afwijking).<br />
              <strong style={{ color: "#fff" }}>Waar/Onjuist:</strong> Geen snelheidsbonus.<br />
              <strong style={{ color: "#fff" }}>Meerdere juiste antwoorden:</strong> De hele juiste set goed = punten, anders 0.<br />
              <strong style={{ color: "#fff" }}>Open vragen:</strong> Hoofdletters en spaties tellen niet mee.
            </p>
          </div>
        </div>

      </div>
    </AdminLayout>
  );
}
