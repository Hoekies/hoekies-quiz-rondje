import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local manually
const envPath = join(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf8");
const env = {};
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim().replace(/^"|"$/g, "");
}

const app = initializeApp({
  credential: cert({
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});

const db = getFirestore(app);
const auth = getAuth(app);

// ─── QUIZ DATA ────────────────────────────────────────────────────────────────

const quiz = {
  title: "RetroQuiz 90/00",
  description: "De nostalgische borrelquiz over de jaren 90 en 00.",
};

const questions = [
  // ── Ronde 1: Opwarmer (8 meerkeuze) ─────────────────────────────────────
  {
    round: 1, order: 1, type: "multiple_choice",
    question_text: "Welke telefoon werd beroemd door Snake en zijn onverwoestbare reputatie?",
    options: ["Nokia 3310", "Motorola Razr", "iPhone 3G", "Sony Ericsson Walkman"],
    correct_answer: "Nokia 3310",
    explanation: "De Nokia 3310 uit 2000 was legendarisch onverwoestbaar en had Snake voorgeïnstalleerd.",
    time_limit_seconds: 20, base_points: 500, is_double_points: false, media_url: null,
  },
  {
    round: 1, order: 2, type: "multiple_choice",
    question_text: "Welke Nederlandse site stond bekend om 'krabbels'?",
    options: ["Hyves", "MSN", "CU2", "Startpagina"],
    correct_answer: "Hyves",
    explanation: "Hyves was het Nederlandse sociale netwerk waar je 'krabbels' op iemands profiel kon achterlaten.",
    time_limit_seconds: 20, base_points: 500, is_double_points: false, media_url: null,
  },
  {
    round: 1, order: 3, type: "multiple_choice",
    question_text: "Welke game draaide om pretparken bouwen?",
    options: ["The Sims", "RollerCoaster Tycoon", "Theme Hospital", "SimCity 3000"],
    correct_answer: "RollerCoaster Tycoon",
    explanation: "RollerCoaster Tycoon (1999) was dé game voor pretparkbouwers in de jaren 90.",
    time_limit_seconds: 20, base_points: 500, is_double_points: false, media_url: null,
  },
  {
    round: 1, order: 4, type: "multiple_choice",
    question_text: "Welke zender hoorde sterk bij muziekvideo's in Nederland?",
    options: ["TMF", "Discovery Channel", "Eurosport", "Net5"],
    correct_answer: "TMF",
    explanation: "TMF (The Music Factory) was dé Nederlandse muziekzender voor videoclips.",
    time_limit_seconds: 20, base_points: 500, is_double_points: false, media_url: null,
  },
  {
    round: 1, order: 5, type: "true_false",
    question_text: "MSN Messenger had een functie waarmee je iemand kon laten trillen: de 'Nudge'.",
    options: ["Juist", "Onjuist"],
    correct_answer: "Juist",
    explanation: "De Nudge (of 'schudden') was een van de meest irritante én leukste MSN-functies.",
    time_limit_seconds: 15, base_points: 750, is_double_points: false, media_url: null,
  },
  {
    round: 1, order: 6, type: "true_false",
    question_text: "De eerste Shrek-film kwam uit in 1998.",
    options: ["Juist", "Onjuist"],
    correct_answer: "Onjuist",
    explanation: "Shrek verscheen in 2001, niet in 1998.",
    time_limit_seconds: 15, base_points: 750, is_double_points: false, media_url: null,
  },
  {
    round: 1, order: 7, type: "multiple_choice",
    question_text: "Wat spaarde je vroeger in zakjes Lay's chips?",
    options: ["Flippo's", "Pokémonkaarten", "Voetbalplaatjes", "Diddl-kaartjes"],
    correct_answer: "Flippo's",
    explanation: "Flippo's waren ronde schijfjes met Looney Tunes-figuren, te vinden in Lay's chips.",
    time_limit_seconds: 20, base_points: 500, is_double_points: false, media_url: null,
  },
  {
    round: 1, order: 8, type: "multiple_choice",
    question_text: "Welk programma zorgde voor de beroemde 'Bassie & Adriaan'-serie?",
    options: ["VARA", "KRO", "AVRO", "NCRV"],
    correct_answer: "KRO",
    explanation: "Bassie & Adriaan was een KRO-productie die generaties kinderen heeft begeesterd.",
    time_limit_seconds: 20, base_points: 500, is_double_points: false, media_url: null,
  },

  // ── Ronde 2: Beeldherkenning (8 vragen) ──────────────────────────────────
  {
    round: 2, order: 1, type: "multiple_choice",
    question_text: "Op welke console zit dit logo? 🎮 [Nintendo 64 logo]",
    options: ["Nintendo 64", "PlayStation 1", "Sega Saturn", "Atari Jaguar"],
    correct_answer: "Nintendo 64",
    explanation: "De Nintendo 64 (1996) bracht ons Mario 64, Zelda: Ocarina of Time en GoldenEye 007.",
    time_limit_seconds: 20, base_points: 500, is_double_points: false, media_url: null,
  },
  {
    round: 2, order: 2, type: "multiple_choice",
    question_text: "Welk virtueel huisdier leefde in dit eitje?",
    options: ["Tamagotchi", "Furby", "Nano Pet", "Giga Pet"],
    correct_answer: "Tamagotchi",
    explanation: "De Tamagotchi (1996, Bandai) was het Japanse sleutelhanger-huisdier dat constant aandacht vroeg.",
    time_limit_seconds: 20, base_points: 500, is_double_points: false, media_url: null,
  },
  {
    round: 2, order: 3, type: "multiple_choice",
    question_text: "Welke drankjes kwamen in deze flesjes met frisse fruitsmaak? 🍹",
    options: ["Breezer", "Bacardi", "Smirnoff Ice", "Wicky"],
    correct_answer: "Breezer",
    explanation: "Bacardi Breezer was dé teensmaak van de vroege jaren 00, populair bij jongeren.",
    time_limit_seconds: 20, base_points: 500, is_double_points: false, media_url: null,
  },
  {
    round: 2, order: 4, type: "multiple_choice",
    question_text: "Van welk merk is dit silhouet met witte oortjes? 🎵",
    options: ["iPod", "Walkman", "Discman", "MiniDisc"],
    correct_answer: "iPod",
    explanation: "De iconische Apple iPod-reclames met silhouetten en witte oortjes veranderden de muziekwereld.",
    time_limit_seconds: 20, base_points: 500, is_double_points: false, media_url: null,
  },
  {
    round: 2, order: 5, type: "multiple_choice",
    question_text: "Welk computerspel had dit gele pionnetje dat rondjes rende? 👾",
    options: ["Pac-Man", "Space Invaders", "Tetris", "Frogger"],
    correct_answer: "Pac-Man",
    explanation: "Pac-Man (1980, Namco) bleef populair tot ver in de jaren 90 en 00.",
    time_limit_seconds: 20, base_points: 500, is_double_points: false, media_url: null,
  },
  {
    round: 2, order: 6, type: "multiple_choice",
    question_text: "Welk speelgoed had een eigen taal en praatte terug? 🤖",
    options: ["Furby", "Tamagotchi", "Robosapien", "Bop It"],
    correct_answer: "Furby",
    explanation: "Furby (1998, Tiger Electronics) sprak Furbish en leerde langzaam meer Nederlands.",
    time_limit_seconds: 20, base_points: 500, is_double_points: false, media_url: null,
  },
  {
    round: 2, order: 7, type: "multiple_choice",
    question_text: "Op welke handheld speelde je Game Boy-games in kleur?",
    options: ["Game Boy Color", "Game Boy Pocket", "Game Boy Advance", "Game Boy Light"],
    correct_answer: "Game Boy Color",
    explanation: "De Game Boy Color (1998) was Nintendo's eerste kleurenhandheld.",
    time_limit_seconds: 20, base_points: 500, is_double_points: false, media_url: null,
  },
  {
    round: 2, order: 8, type: "multiple_choice",
    question_text: "Welk merk maakte deze vouwtelefoon met razendscherp design? 📱",
    options: ["Motorola Razr", "Samsung Flip", "Nokia 7280", "Siemens Xelibri"],
    correct_answer: "Motorola Razr",
    explanation: "De Motorola RAZR V3 (2004) was een statussymbool — ultradun en iconisch.",
    time_limit_seconds: 20, base_points: 500, is_double_points: false, media_url: null,
  },

  // ── Ronde 3: Geluid uit het verleden (8 vragen, type audio) ──────────────
  {
    round: 3, order: 1, type: "audio",
    question_text: "Van welke artiest is dit nummer? 🎵",
    options: ["Vengaboys", "Aqua", "Scooter", "2 Unlimited"],
    correct_answer: "Vengaboys",
    explanation: "We Like to Party! — de Vengaboys uit 1998 waren niet te missen.",
    time_limit_seconds: 25, base_points: 500, is_double_points: false, media_url: null,
  },
  {
    round: 3, order: 2, type: "audio",
    question_text: "Welke serie-intro hoor je? 📺",
    options: ["Pokemon", "Dragon Ball Z", "Digimon", "Totally Spies"],
    correct_answer: "Pokemon",
    explanation: "Gotta catch 'em all! — de Pokemon-intro is waarschijnlijk de bekendste tekenfilmintro ooit.",
    time_limit_seconds: 25, base_points: 500, is_double_points: false, media_url: null,
  },
  {
    round: 3, order: 3, type: "audio",
    question_text: "Welke MSN-melding hoor je? 💬",
    options: ["Nieuw bericht", "Contact online", "Bestand ontvangen", "Nudge"],
    correct_answer: "Nieuw bericht",
    explanation: "Het zachte 'pling' van een nieuwe MSN-melding — wie hoort het niet meteen?",
    time_limit_seconds: 20, base_points: 500, is_double_points: false, media_url: null,
  },
  {
    round: 3, order: 4, type: "multiple_choice",
    question_text: "Welke band zong 'Barbie Girl' (1997)?",
    options: ["Aqua", "Ace of Base", "Spice Girls", "Vengaboys"],
    correct_answer: "Aqua",
    explanation: "Aqua, het Deense synth-popkwartet, bracht Barbie Girl uit in 1997.",
    time_limit_seconds: 20, base_points: 500, is_double_points: false, media_url: null,
  },
  {
    round: 3, order: 5, type: "multiple_choice",
    question_text: "Welke ringtone werd beroemd op de Nokia 3310?",
    options: ["Grande Valse", "Tetris-thema", "Fur Elise", "Nokia Tune"],
    correct_answer: "Grande Valse",
    explanation: "De standaard Nokia-ringtone is gebaseerd op 'Gran Vals' van Francisco Tárrega.",
    time_limit_seconds: 20, base_points: 500, is_double_points: false, media_url: null,
  },
  {
    round: 3, order: 6, type: "multiple_choice",
    question_text: "Bij welke reclame hoorde 'Even Apeldoorn bellen'?",
    options: ["Centraal Beheer", "ANWB", "ING Bank", "Aegon"],
    correct_answer: "Centraal Beheer",
    explanation: "Centraal Beheer verzekeringen maakte legendarische humor-reclames met die slogan.",
    time_limit_seconds: 20, base_points: 500, is_double_points: false, media_url: null,
  },
  {
    round: 3, order: 7, type: "multiple_choice",
    question_text: "Welke spelshow had het thema 'lekker fout'?",
    options: ["Foute vrienden", "De Gouden Kooi", "Big Brother", "Expeditie Robinson"],
    correct_answer: "Big Brother",
    explanation: "Big Brother (1999, Endemol) was wereldwijd het eerste grote reality-programma.",
    time_limit_seconds: 20, base_points: 500, is_double_points: false, media_url: null,
  },
  {
    round: 3, order: 8, type: "multiple_choice",
    question_text: "Welk Spice Girl had de bijnaam 'Scary Spice'?",
    options: ["Mel B", "Mel C", "Victoria Beckham", "Emma Bunton"],
    correct_answer: "Mel B",
    explanation: "Melanie Brown (Mel B) was Scary Spice — ze viel op door haar wilde persoonlijkheid.",
    time_limit_seconds: 20, base_points: 500, is_double_points: false, media_url: null,
  },

  // ── Ronde 4: Internettrauma's (8 vragen) ─────────────────────────────────
  {
    round: 4, order: 1, type: "multiple_choice",
    question_text: "Via welk programma downloadde iedereen (illegaal) muziek in de jaren 00?",
    options: ["LimeWire", "Napster", "Kazaa", "BitTorrent"],
    correct_answer: "LimeWire",
    explanation: "LimeWire was na Napster de populairste peer-to-peer muziekdownloader.",
    time_limit_seconds: 20, base_points: 500, is_double_points: false, media_url: null,
  },
  {
    round: 4, order: 2, type: "true_false",
    question_text: "Hyves was oorspronkelijk een Nederlands bedrijf.",
    options: ["Juist", "Onjuist"],
    correct_answer: "Juist",
    explanation: "Hyves werd in 2004 opgericht door Nederlanders en was lange tijd het grootste NL sociale netwerk.",
    time_limit_seconds: 15, base_points: 750, is_double_points: false, media_url: null,
  },
  {
    round: 4, order: 3, type: "multiple_choice",
    question_text: "Wat was een 'Habbo Hotel'?",
    options: ["Online chatwereld met pixelkarakters", "Online game", "Datingsite", "E-mailprovider"],
    correct_answer: "Online chatwereld met pixelkarakters",
    explanation: "Habbo Hotel (2000) was een virtuele chatwereld met retro pixel-avatars.",
    time_limit_seconds: 20, base_points: 500, is_double_points: false, media_url: null,
  },
  {
    round: 4, order: 4, type: "multiple_choice",
    question_text: "Wat was de standaard Nederlandse zoekhomepage in de jaren 00?",
    options: ["Startpagina.nl", "Google.nl", "Altavista.nl", "Yahoo.nl"],
    correct_answer: "Startpagina.nl",
    explanation: "Startpagina.nl was jarenlang de meest bezochte website van Nederland.",
    time_limit_seconds: 20, base_points: 500, is_double_points: false, media_url: null,
  },
  {
    round: 4, order: 5, type: "true_false",
    question_text: "ICQ was een chatprogramma dat ouder was dan MSN Messenger.",
    options: ["Juist", "Onjuist"],
    correct_answer: "Juist",
    explanation: "ICQ (1996) was het eerste grote internet-chatprogramma, MSN Messenger volgde in 1999.",
    time_limit_seconds: 15, base_points: 750, is_double_points: false, media_url: null,
  },
  {
    round: 4, order: 6, type: "multiple_choice",
    question_text: "Wat betekende 'AFK' in MSN- en chatjargon?",
    options: ["Away From Keyboard", "Always For Keeps", "About For Kicking", "Actually Fairly Known"],
    correct_answer: "Away From Keyboard",
    explanation: "AFK = Away From Keyboard — je was even niet bij je computer.",
    time_limit_seconds: 20, base_points: 500, is_double_points: false, media_url: null,
  },
  {
    round: 4, order: 7, type: "multiple_choice",
    question_text: "Welke e-mailprovider gaf als eerste gratis webmail?",
    options: ["Hotmail", "Gmail", "Yahoo Mail", "Lycos Mail"],
    correct_answer: "Hotmail",
    explanation: "Hotmail (1996) was de eerste gratis webmail-service — later overgenomen door Microsoft.",
    time_limit_seconds: 20, base_points: 500, is_double_points: false, media_url: null,
  },
  {
    round: 4, order: 8, type: "true_false",
    question_text: "De PlayStation 2 was de bestverkochte spelcomputer ooit.",
    options: ["Juist", "Onjuist"],
    correct_answer: "Juist",
    explanation: "De PS2 verkocht meer dan 155 miljoen exemplaren — nog steeds het record.",
    time_limit_seconds: 15, base_points: 750, is_double_points: false, media_url: null,
  },

  // ── Ronde 5: Tijdmachine (6 vragen) ──────────────────────────────────────
  {
    round: 5, order: 1, type: "multiple_choice",
    question_text: "In welk jaar brak de Nokia 3310 de markt? 📅",
    options: ["2000", "1998", "2002", "1996"],
    correct_answer: "2000",
    explanation: "De Nokia 3310 werd gelanceerd in september 2000.",
    time_limit_seconds: 20, base_points: 500, is_double_points: false, media_url: null,
  },
  {
    round: 5, order: 2, type: "multiple_choice",
    question_text: "Welke console verscheen het EERST?",
    options: ["Nintendo 64", "PlayStation 2", "Xbox", "GameCube"],
    correct_answer: "Nintendo 64",
    explanation: "Nintendo 64 (1996) → PlayStation 2 (2000) → Xbox (2001) → GameCube (2001).",
    time_limit_seconds: 25, base_points: 500, is_double_points: false, media_url: null,
  },
  {
    round: 5, order: 3, type: "multiple_choice",
    question_text: "Wat was het maximale aantal tekens in een standaard SMS?",
    options: ["160", "140", "120", "200"],
    correct_answer: "160",
    explanation: "Een SMS bevatte maximaal 160 tekens — elke letter telde!",
    time_limit_seconds: 20, base_points: 500, is_double_points: false, media_url: null,
  },
  {
    round: 5, order: 4, type: "multiple_choice",
    question_text: "Wat verscheen eerder?",
    options: ["MSN Messenger (1999)", "Hyves (2004)", "Facebook (2004)", "WhatsApp (2009)"],
    correct_answer: "MSN Messenger (1999)",
    explanation: "MSN Messenger (1999) → Hyves/Facebook (2004) → WhatsApp (2009).",
    time_limit_seconds: 25, base_points: 500, is_double_points: false, media_url: null,
  },
  {
    round: 5, order: 5, type: "multiple_choice",
    question_text: "Hoeveel MB had een standaard PlayStation 2 memory card?",
    options: ["8 MB", "4 MB", "16 MB", "32 MB"],
    correct_answer: "8 MB",
    explanation: "De officiële Sony PS2 memory card had een capaciteit van 8 MB.",
    time_limit_seconds: 20, base_points: 500, is_double_points: false, media_url: null,
  },
  {
    round: 5, order: 6, type: "multiple_choice",
    question_text: "Welke Pokémon had nummer 1 in de Pokédex?",
    options: ["Bulbasaur", "Charmander", "Pikachu", "Squirtle"],
    correct_answer: "Bulbasaur",
    explanation: "Bulbasaur is #001 in de Nationale Pokédex — het eerste Pokémon ooit.",
    time_limit_seconds: 20, base_points: 500, is_double_points: false, media_url: null,
  },

  // ── Ronde 6: Finale (5 vragen, dubbele punten) ────────────────────────────
  {
    round: 6, order: 1, type: "multiple_choice",
    question_text: "🔥 FINALE: Welk duo zong 'Summer of '69'?",
    options: ["Bryan Adams", "Bon Jovi", "U2", "Bruce Springsteen"],
    correct_answer: "Bryan Adams",
    explanation: "Bryan Adams' 'Summer of '69' (1985) bleef populair in de jaren 90.",
    time_limit_seconds: 20, base_points: 500, is_double_points: true, media_url: null,
  },
  {
    round: 6, order: 2, type: "true_false",
    question_text: "🔥 FINALE: Er bestond een officiële Pokémon Mini-console van Nintendo.",
    options: ["Juist", "Onjuist"],
    correct_answer: "Juist",
    explanation: "De Pokémon Mini (2001) was Nintendo's kleinste console ooit, met 9 games.",
    time_limit_seconds: 15, base_points: 750, is_double_points: true, media_url: null,
  },
  {
    round: 6, order: 3, type: "multiple_choice",
    question_text: "🔥 FINALE: Welke film bracht de zin 'You had me at hello'?",
    options: ["Jerry Maguire", "Notting Hill", "Titanic", "Pretty Woman"],
    correct_answer: "Jerry Maguire",
    explanation: "Jerry Maguire (1996) met Tom Cruise en Renée Zellweger: 'You had me at hello.'",
    time_limit_seconds: 20, base_points: 500, is_double_points: true, media_url: null,
  },
  {
    round: 6, order: 4, type: "multiple_choice",
    question_text: "🔥 FINALE: Welke boyband had hits als 'Bye Bye Bye' en 'It's Gonna Be Me'?",
    options: ["*NSYNC", "Backstreet Boys", "Westlife", "Blue"],
    correct_answer: "*NSYNC",
    explanation: "*NSYNC met Justin Timberlake scoorde 'Bye Bye Bye' en 'It's Gonna Be Me' (2000).",
    time_limit_seconds: 20, base_points: 500, is_double_points: true, media_url: null,
  },
  {
    round: 6, order: 5, type: "multiple_choice",
    question_text: "🔥 FINALE: Wat was de codenaam van Windows XP tijdens ontwikkeling?",
    options: ["Whistler", "Neptune", "Odyssey", "Vienna"],
    correct_answer: "Whistler",
    explanation: "Windows XP had de codenaam 'Whistler', vernoemd naar de skistad in Canada.",
    time_limit_seconds: 25, base_points: 500, is_double_points: true, media_url: null,
  },
];

// ─── SEED FUNCTIE ─────────────────────────────────────────────────────────────

async function seed() {
  console.log("🌱 Seeding Firestore...");

  // Quiz aanmaken
  const quizRef = await db.collection("quizzes").add(quiz);
  console.log(`✅ Quiz aangemaakt: ${quizRef.id}`);

  // Vragen toevoegen
  const batch = db.batch();
  for (const q of questions) {
    const qRef = quizRef.collection("questions").doc();
    batch.set(qRef, q);
  }
  await batch.commit();
  console.log(`✅ ${questions.length} vragen toegevoegd`);

  // Admin gebruiker aanmaken
  const adminEmail = "admin@hoekies.nl";
  const adminPassword = "Hoekies2026!";

  try {
    const existingUser = await auth.getUserByEmail(adminEmail);
    await auth.setCustomUserClaims(existingUser.uid, { rol: "admin" });
    console.log(`✅ Admin claim gezet op bestaande gebruiker: ${adminEmail}`);
  } catch {
    const newUser = await auth.createUser({ email: adminEmail, password: adminPassword });
    await auth.setCustomUserClaims(newUser.uid, { rol: "admin" });
    console.log(`✅ Admin aangemaakt: ${adminEmail} / ${adminPassword}`);
  }

  console.log("\n🎉 Klaar! De quiz staat in Firestore.");
  process.exit(0);
}

seed().catch(err => { console.error("❌ Fout:", err); process.exit(1); });
