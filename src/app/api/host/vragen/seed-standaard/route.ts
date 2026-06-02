export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

async function verifyAdmin(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    return decoded.rol === "admin";
  } catch { return false; }
}

interface SeedQuestion {
  question_text: string;
  options: string[];   // eerste optie = het juiste antwoord (wordt bij opslaan geschud)
  correct_answer: string;
}

// Fisher-Yates: schud de opties zodat het juiste antwoord niet altijd op A staat.
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const SPORT: SeedQuestion[] = [
  { question_text: "Welk land won het WK voetbal in 2014?", options: ["Duitsland", "Argentinië", "Brazilië", "Nederland"], correct_answer: "Duitsland" },
  { question_text: "Hoeveel spelers heeft één voetbalteam op het veld?", options: ["11", "10", "9", "12"], correct_answer: "11" },
  { question_text: "In welke sport is de Tour de France de bekendste wedstrijd?", options: ["Wielrennen", "Hardlopen", "Schaatsen", "Autosport"], correct_answer: "Wielrennen" },
  { question_text: "In welke sport werd Max Verstappen in 2021 wereldkampioen?", options: ["Formule 1", "MotoGP", "Rally", "Wielrennen"], correct_answer: "Formule 1" },
  { question_text: "Hoeveel ringen heeft het olympische symbool?", options: ["5", "4", "6", "3"], correct_answer: "5" },
];

const MUZIEK: SeedQuestion[] = [
  { question_text: "Welke band zong 'Bohemian Rhapsody'?", options: ["Queen", "The Beatles", "ABBA", "The Rolling Stones"], correct_answer: "Queen" },
  { question_text: "Welk instrument heeft 88 toetsen?", options: ["Piano", "Gitaar", "Drums", "Viool"], correct_answer: "Piano" },
  { question_text: "Wie staat bekend als de 'Queen of Pop'?", options: ["Madonna", "Beyoncé", "Lady Gaga", "Rihanna"], correct_answer: "Madonna" },
  { question_text: "Uit welk land komt de popgroep ABBA?", options: ["Zweden", "Noorwegen", "Denemarken", "Finland"], correct_answer: "Zweden" },
  { question_text: "In welke taal is de wereldhit 'Despacito' gezongen?", options: ["Spaans", "Portugees", "Italiaans", "Engels"], correct_answer: "Spaans" },
];

const ALGEMEEN: SeedQuestion[] = [
  { question_text: "Wat is de hoofdstad van Frankrijk?", options: ["Parijs", "Lyon", "Marseille", "Nice"], correct_answer: "Parijs" },
  { question_text: "Hoeveel kleuren heeft een regenboog traditioneel?", options: ["7", "6", "5", "8"], correct_answer: "7" },
  { question_text: "Welke planeet staat het dichtst bij de zon?", options: ["Mercurius", "Venus", "Aarde", "Mars"], correct_answer: "Mercurius" },
  { question_text: "Hoeveel minuten zitten er in een uur?", options: ["60", "100", "50", "90"], correct_answer: "60" },
  { question_text: "Wat is het grootste landdier ter wereld?", options: ["Afrikaanse olifant", "Neushoorn", "Nijlpaard", "Giraffe"], correct_answer: "Afrikaanse olifant" },
];

const WEER: SeedQuestion[] = [
  { question_text: "Welk instrument meet de temperatuur?", options: ["Thermometer", "Barometer", "Hygrometer", "Anemometer"], correct_answer: "Thermometer" },
  { question_text: "Hoe heet neerslag die als witte vlokken naar beneden valt?", options: ["Sneeuw", "Hagel", "IJzel", "Mist"], correct_answer: "Sneeuw" },
  { question_text: "Wat meet een anemometer?", options: ["Windsnelheid", "Luchtdruk", "Luchtvochtigheid", "Temperatuur"], correct_answer: "Windsnelheid" },
  { question_text: "Hoe heet een hevige, draaiende windhoos boven land?", options: ["Tornado", "Orkaan", "Moesson", "Passaat"], correct_answer: "Tornado" },
  { question_text: "Welke wolkensoort brengt vaak onweer?", options: ["Cumulonimbus", "Cirrus", "Stratus", "Nimbostratus"], correct_answer: "Cumulonimbus" },
];

const TV: SeedQuestion[] = [
  { question_text: "In welke serie komt het personage Walter White voor?", options: ["Breaking Bad", "The Sopranos", "The Wire", "Dexter"], correct_answer: "Breaking Bad" },
  { question_text: "Welke gele tekenfilmfamilie woont in Springfield?", options: ["The Simpsons", "Family Guy", "Futurama", "South Park"], correct_answer: "The Simpsons" },
  { question_text: "In Game of Thrones draait de strijd om welke troon?", options: ["De IJzeren Troon", "De Gouden Troon", "De Stenen Troon", "De Houten Troon"], correct_answer: "De IJzeren Troon" },
  { question_text: "Welke Nederlandse soap speelt zich af in het fictieve Meerdijk?", options: ["Goede Tijden Slechte Tijden", "Onderweg naar Morgen", "Goudkust", "Vrouwenvleugel"], correct_answer: "Goede Tijden Slechte Tijden" },
  { question_text: "In welk kookprogramma strijden amateurkoks onder een strenge jury?", options: ["MasterChef", "Heel Holland Bakt", "Komen Eten", "24 Kitchen"], correct_answer: "MasterChef" },
];

const QUIZZEN = [
  { name: "Sport", questions: SPORT },
  { name: "Muziek", questions: MUZIEK },
  { name: "Algemeen", questions: ALGEMEEN },
  { name: "Weer", questions: WEER },
  { name: "TV", questions: TV },
];

export async function POST(req: NextRequest) {
  const isAdmin = await verifyAdmin(req);
  if (!isAdmin) return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });

  // Gebruik de bestaande (eerste) quiz, of maak er één — de app speelt altijd uit één quiz.
  const quizzesSnap = await adminDb.collection("quizzes").limit(1).get();
  let quizRef;
  if (quizzesSnap.empty) {
    quizRef = await adminDb.collection("quizzes").add({
      title: "Hoekies Quiz",
      description: "Standaard quiz",
      created_at: FieldValue.serverTimestamp(),
    });
  } else {
    quizRef = quizzesSnap.docs[0].ref;
  }

  // Elke categorie wordt een eigen ronde, achter de bestaande rondes.
  const existingRoundsSnap = await quizRef.collection("questions").get();
  const usedRounds = new Set(existingRoundsSnap.docs.map((d) => d.data().round as number));
  let nextRound = Math.max(0, ...Array.from(usedRounds)) + 1;

  const roundNames: Record<string, string> = {};
  let added = 0;
  let batch = adminDb.batch();
  let ops = 0;

  for (const cat of QUIZZEN) {
    const round = nextRound++;
    roundNames[round] = cat.name;
    let order = 1;
    for (const q of cat.questions) {
      const qRef = quizRef.collection("questions").doc();
      batch.set(qRef, {
        question_text: q.question_text,
        type: "multiple_choice",
        options: shuffle(q.options), // willekeurige volgorde → juiste antwoord niet altijd A
        correct_answer: q.correct_answer,
        time_limit_seconds: 20,
        base_points: 1000,
        is_double_points: false,
        round,
        order: order++,
        media_url: null,
        explanation: null,
        created_at: FieldValue.serverTimestamp(),
      });
      added++; ops++;
      if (ops >= 400) { await batch.commit(); batch = adminDb.batch(); ops = 0; }
    }
  }
  if (ops > 0) await batch.commit();

  // Ronde-namen toevoegen aan de quiz (bestaande behouden)
  const existingNames = (quizzesSnap.empty ? {} : (quizzesSnap.docs[0].data().round_names ?? {})) as Record<string, string>;
  await quizRef.set({ round_names: { ...existingNames, ...roundNames } }, { merge: true });

  return NextResponse.json({ message: `${added} vragen toegevoegd in 5 rondes (Sport, Muziek, Algemeen, Weer, TV)` });
}
