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
  options: string[];
  correct_answer: string;
  round: number;
  order: number;
}

const SPORT: SeedQuestion[] = [
  { question_text: "Welk land won het WK voetbal in 1998 in eigen land?", options: ["Frankrijk", "Brazilië", "Nederland", "Italië"], correct_answer: "Frankrijk", round: 1, order: 1 },
  { question_text: "Welk team won de Champions League in 1999 in de allerlaatste minuut?", options: ["Manchester United", "Bayern München", "Juventus", "Arsenal"], correct_answer: "Manchester United", round: 1, order: 2 },
  { question_text: "Wie was de bondscoach die Nederland naar de halve finale van WK 1998 leidde?", options: ["Guus Hiddink", "Louis van Gaal", "Dick Advocaat", "Johan Cruijff"], correct_answer: "Guus Hiddink", round: 1, order: 3 },
  { question_text: "Welke Nederlandse zwemster won drie gouden medailles op de Spelen in Sydney 2000?", options: ["Inge de Bruijn", "Marianne Timmer", "Leontien van Moorsel", "Sjoukje Dijkstra"], correct_answer: "Inge de Bruijn", round: 1, order: 4 },
  { question_text: "Welk land won het EK voetbal 2000 in Nederland en België?", options: ["Frankrijk", "Nederland", "Portugal", "Italië"], correct_answer: "Frankrijk", round: 1, order: 5 },
  { question_text: "Ajax won de Champions League door Juventus te verslaan in welk jaar?", options: ["1995", "1993", "1997", "1999"], correct_answer: "1995", round: 1, order: 6 },
  { question_text: "Wie was topscorer op het WK voetbal 1998 met 6 goals?", options: ["Davor Šuker", "Ronaldo", "Thierry Henry", "Dennis Bergkamp"], correct_answer: "Davor Šuker", round: 1, order: 7 },
  { question_text: "Wie won Wimbledon heren in 2001 als wildcard op 125e plaats?", options: ["Goran Ivanišević", "Pete Sampras", "André Agassi", "Lleyton Hewitt"], correct_answer: "Goran Ivanišević", round: 1, order: 8 },
  { question_text: "Welk land werd verrassend kampioen op het EK voetbal 1992 na uitval van Joegoslavië?", options: ["Denemarken", "Duitsland", "Nederland", "Zweden"], correct_answer: "Denemarken", round: 1, order: 9 },
  { question_text: "Hoeveel WK-titels won Michael Schumacher aaneengesloten van 2000 tot en met 2004?", options: ["5", "4", "3", "6"], correct_answer: "5", round: 2, order: 10 },
  { question_text: "Welke Nederlandse schaatsster won goud op de 1000m én 1500m in Nagano 1998?", options: ["Marianne Timmer", "Tonny de Jong", "Yvonne van Gennip", "Claudia Pechstein"], correct_answer: "Marianne Timmer", round: 2, order: 11 },
  { question_text: "Welk land won het WK vrouwenvoetbal in 1999?", options: ["VS", "China", "Noorwegen", "Brazilië"], correct_answer: "VS", round: 2, order: 12 },
  { question_text: "Welk land won het WK voetbal in 2002 in Japan en Zuid-Korea?", options: ["Brazilië", "Duitsland", "Turkije", "Zuid-Korea"], correct_answer: "Brazilië", round: 2, order: 13 },
  { question_text: "Hoeveel goals scoorde Ronaldo (Brazilië) als topscorer op het WK 2002?", options: ["8", "6", "7", "5"], correct_answer: "8", round: 2, order: 14 },
  { question_text: "Welke stad organiseerde de Olympische Zomerspelen in 2000?", options: ["Sydney", "Atlanta", "Barcelona", "Athene"], correct_answer: "Sydney", round: 2, order: 15 },
  { question_text: "Tiger Woods won de Masters in 1997 als jongste ooit. Hoe oud was hij?", options: ["21", "19", "23", "25"], correct_answer: "21", round: 2, order: 16 },
  { question_text: "Pete Sampras won Wimbledon (heren) hoe vaak in totaal gedurende zijn carrière?", options: ["7", "5", "6", "8"], correct_answer: "7", round: 2, order: 17 },
  { question_text: "Welke NBA-ster van de Utah Jazz stond bekend als 'The Mailman'?", options: ["Karl Malone", "John Stockton", "Charles Barkley", "Patrick Ewing"], correct_answer: "Karl Malone", round: 2, order: 18 },
  { question_text: "Welke Italiaanse speler miste de beslissende strafschop in de WK finale 1994 zodat Brazilië won?", options: ["Roberto Baggio", "Franco Baresi", "Demetrio Albertini", "Roberto Donadoni"], correct_answer: "Roberto Baggio", round: 2, order: 19 },
  { question_text: "Op welke Olympische Spelen werd Beach Volleyball voor het eerst een officieel onderdeel?", options: ["Atlanta 1996", "Barcelona 1992", "Sydney 2000", "Seoel 1988"], correct_answer: "Atlanta 1996", round: 2, order: 20 },
];

const KENNIS: SeedQuestion[] = [
  { question_text: "In welk jaar werd de euro als chartaal geld (biljetten en munten) ingevoerd?", options: ["2002", "1999", "2001", "2000"], correct_answer: "2002", round: 1, order: 1 },
  { question_text: "Welke prinses overleed op 31 augustus 1997 bij een auto-ongeluk in Parijs?", options: ["Diana", "Caroline van Monaco", "Beatrix", "Máxima"], correct_answer: "Diana", round: 1, order: 2 },
  { question_text: "Hoe heette het eerste gekloonde zoogdier (een schaap) uit 1996?", options: ["Dolly", "Daisy", "Molly", "Polly"], correct_answer: "Dolly", round: 1, order: 3 },
  { question_text: "In welk jaar vonden de terroristische aanslagen van 11 september in de VS plaats?", options: ["2001", "2000", "2002", "1999"], correct_answer: "2001", round: 1, order: 4 },
  { question_text: "Welk realityshow begon in 1999 in Nederland waarbij deelnemers in een huis werden opgesloten?", options: ["Big Brother", "Survivor", "The Voice", "Idols"], correct_answer: "Big Brother", round: 1, order: 5 },
  { question_text: "Wie was de president van de VS van 2001 tot 2009?", options: ["George W. Bush", "Bill Clinton", "Barack Obama", "Al Gore"], correct_answer: "George W. Bush", round: 1, order: 6 },
  { question_text: "Welk socialemediaplatform richtte Mark Zuckerberg op in 2004?", options: ["Facebook", "Twitter", "YouTube", "Instagram"], correct_answer: "Facebook", round: 1, order: 7 },
  { question_text: "In welk jaar werd de zoekmachine Google opgericht?", options: ["1998", "1996", "2000", "2001"], correct_answer: "1998", round: 1, order: 8 },
  { question_text: "Welk Windows-besturingssysteem bracht Microsoft in augustus 1995 uit?", options: ["Windows 95", "Windows XP", "Windows 98", "Windows NT"], correct_answer: "Windows 95", round: 1, order: 9 },
  { question_text: "Welk Russisch onderzeeboot zonk in augustus 2000 in de Barentszzee met 118 man aan boord?", options: ["Kursk", "Belgorod", "Moskwa", "Akula"], correct_answer: "Kursk", round: 2, order: 10 },
  { question_text: "Hoeveel Oscars won de film Titanic van James Cameron bij de uitreiking in 1998?", options: ["11", "7", "9", "14"], correct_answer: "11", round: 2, order: 11 },
  { question_text: "Apple lanceerde de MP3-speler iPod voor het eerst in welk jaar?", options: ["2001", "2003", "1999", "2005"], correct_answer: "2001", round: 2, order: 12 },
  { question_text: "Kurt Cobain was de frontman van welke invloedrijke grunge-band?", options: ["Nirvana", "Pearl Jam", "Soundgarden", "Alice in Chains"], correct_answer: "Nirvana", round: 2, order: 13 },
  { question_text: "Welk chatprogramma lanceerde Microsoft in 1999 en werd populair in Nederland?", options: ["MSN Messenger", "ICQ", "Yahoo Messenger", "AIM"], correct_answer: "MSN Messenger", round: 2, order: 14 },
  { question_text: "Sony bracht de PlayStation 2 in Europa uit in welk jaar?", options: ["2000", "1998", "2001", "1999"], correct_answer: "2000", round: 2, order: 15 },
  { question_text: "De Nokia 3310, een van de populairste mobieltjes ooit, werd uitgebracht in welk jaar?", options: ["2000", "1998", "1999", "2001"], correct_answer: "2000", round: 2, order: 16 },
  { question_text: "In welk jaar verscheen het eerste Harry Potter boek van J.K. Rowling in het Verenigd Koninkrijk?", options: ["1997", "1999", "1995", "2000"], correct_answer: "1997", round: 2, order: 17 },
  { question_text: "Welk eerste spelconsole bracht Microsoft uit in 2001?", options: ["Xbox", "Xbox 360", "Xbox One", "Game Boy"], correct_answer: "Xbox", round: 2, order: 18 },
  { question_text: "De film The Matrix met Keanu Reeves verscheen in welk jaar?", options: ["1999", "2000", "1998", "2001"], correct_answer: "1999", round: 2, order: 19 },
  { question_text: "Welk Nederlandse popster brak in 2003 internationaal door na deelname aan Idols?", options: ["David Achter de Dijk", "Jim Bakkum", "Noor", "Thomas Berge"], correct_answer: "David Achter de Dijk", round: 2, order: 20 },
];

const MUZIEK: SeedQuestion[] = [
  { question_text: "'...Baby One More Time' was de debuutsingle van welke popster in 1998?", options: ["Britney Spears", "Christina Aguilera", "Jessica Simpson", "Beyoncé"], correct_answer: "Britney Spears", round: 1, order: 1 },
  { question_text: "Met welk nummer maakte Cher in 1998 een comeback waarbij autotune voor het eerst massaal werd gebruikt?", options: ["Believe", "If I Could Turn Back Time", "Strong Enough", "Just Like Jesse James"], correct_answer: "Believe", round: 1, order: 2 },
  { question_text: "Welk nummer van Oasis uit 1995 is een van de populairste Britpop-songs ooit?", options: ["Wonderwall", "Don't Look Back in Anger", "Champagne Supernova", "Roll With It"], correct_answer: "Wonderwall", round: 1, order: 3 },
  { question_text: "Wie bracht in 1999 het beroemde debuutalbum 'The Slim Shady LP' uit?", options: ["Eminem", "Jay-Z", "DMX", "Nas"], correct_answer: "Eminem", round: 1, order: 4 },
  { question_text: "Robbie Williams scoorde zijn grootste internationale hit in 1997 met welk nummer?", options: ["Angels", "Feel", "Rock DJ", "Let Me Entertain You"], correct_answer: "Angels", round: 1, order: 5 },
  { question_text: "Het zomerhit 'Barbie Girl' was in 1997 een nummer van welke Deense groep?", options: ["Aqua", "Vengaboys", "2 Unlimited", "Eiffel 65"], correct_answer: "Aqua", round: 1, order: 6 },
  { question_text: "Welke boyband had hits als 'I Want It That Way' en 'Everybody (Backstreet's Back)'?", options: ["Backstreet Boys", "NSYNC", "Take That", "Boyzone"], correct_answer: "Backstreet Boys", round: 1, order: 7 },
  { question_text: "Spice Girls scoorden in 1996 met hun debuutsingle direct nummer 1 wereldwijd. Hoe heette dit nummer?", options: ["Wannabe", "Say You'll Be There", "2 Become 1", "Who Do You Think You Are"], correct_answer: "Wannabe", round: 1, order: 8 },
  { question_text: "'Blue (Da Ba Dee)' was in 1998 een wereldhit van welke Italiaanse groep?", options: ["Eiffel 65", "Aqua", "Army of Lovers", "La Bouche"], correct_answer: "Eiffel 65", round: 1, order: 9 },
  { question_text: "Destiny's Child scoorde in 1999 een grote hit met welk nummer?", options: ["Say My Name", "Crazy in Love", "Bootylicious", "Survivor"], correct_answer: "Say My Name", round: 2, order: 10 },
  { question_text: "'You're Still The One' en 'Man! I Feel Like a Woman' zijn hits van welke artiest?", options: ["Shania Twain", "Celine Dion", "Faith Hill", "LeAnn Rimes"], correct_answer: "Shania Twain", round: 2, order: 11 },
  { question_text: "Eminem's album 'The Marshall Mathers LP' uit 2000 verkocht in de eerste week een record. Hoe heette zijn grote hit van de film 8 Mile in 2002?", options: ["Lose Yourself", "Stan", "The Real Slim Shady", "Without Me"], correct_answer: "Lose Yourself", round: 2, order: 12 },
  { question_text: "De Macarena was een wereldhit in 1996 van welke Spaanse groep?", options: ["Los del Río", "Ricky Martin", "Gloria Estefan", "Enrique Iglesias"], correct_answer: "Los del Río", round: 2, order: 13 },
  { question_text: "Sean Combs, ook bekend als Puff Daddy, had een emotionele hit met 'I'll Be Missing You' ter nagedachtenis aan welke rapper?", options: ["The Notorious B.I.G.", "Tupac Shakur", "Big L", "Eazy-E"], correct_answer: "The Notorious B.I.G.", round: 2, order: 14 },
  { question_text: "Pulp had in 1995 de Britpop-hit 'Common People'. Wie is de frontman van Pulp?", options: ["Jarvis Cocker", "Damon Albarn", "Liam Gallagher", "Thom Yorke"], correct_answer: "Jarvis Cocker", round: 2, order: 15 },
  { question_text: "De Vengaboys, bekend van 'Boom, Boom, Boom, Boom!!', kwamen uit welk land?", options: ["Nederland", "Spanje", "Duitsland", "België"], correct_answer: "Nederland", round: 2, order: 16 },
  { question_text: "Michael Jackson bracht in 2001 zijn laatste studioalbum uit. Hoe heette dit album?", options: ["Invincible", "HIStory", "Off the Wall", "Dangerous"], correct_answer: "Invincible", round: 2, order: 17 },
  { question_text: "'Livin' la Vida Loca' was in 1999 de internationale doorbraak van welke zanger?", options: ["Ricky Martin", "Marc Anthony", "Enrique Iglesias", "Jon Secada"], correct_answer: "Ricky Martin", round: 2, order: 18 },
  { question_text: "Welk Nederlandse duo bracht in de jaren 90 danshits uit als 'Get Ready for This' en 'Twilight Zone'?", options: ["2 Unlimited", "Vengaboys", "Alex Party", "Snap!"], correct_answer: "2 Unlimited", round: 2, order: 19 },
  { question_text: "Het album 'Millennium' van de Backstreet Boys verscheen in welk jaar en werd een van de bestverkochte albums ooit?", options: ["1999", "1997", "2001", "1995"], correct_answer: "1999", round: 2, order: 20 },
];

const QUIZZEN = [
  { title: "Sport jaren 90/2000", description: "20 vragen over sport uit de jaren 90 en 2000", questions: SPORT },
  { title: "Algemene Kennis jaren 90/2000", description: "20 vragen over nieuws en cultuur uit de jaren 90 en 2000", questions: KENNIS },
  { title: "Muziek jaren 90/2000", description: "20 vragen over popmuziek uit de jaren 90 en 2000", questions: MUZIEK },
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

  // Elke categorie wordt een eigen ronde (1=Sport, 2=Algemene Kennis, 3=Muziek).
  const existingRoundsSnap = await quizRef.collection("questions").get();
  const usedRounds = new Set(existingRoundsSnap.docs.map((d) => d.data().round as number));
  let nextRound = Math.max(0, ...Array.from(usedRounds)) + 1;

  const roundNames: Record<string, string> = {};
  let added = 0;
  let batch = adminDb.batch();
  let ops = 0;

  for (const cat of QUIZZEN) {
    const round = nextRound++;
    roundNames[round] = cat.title.replace(/ jaren.*/i, "");
    let order = 1;
    for (const q of cat.questions) {
      const qRef = quizRef.collection("questions").doc();
      batch.set(qRef, {
        question_text: q.question_text,
        type: "multiple_choice",
        options: q.options,
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

  return NextResponse.json({ message: `${added} vragen toegevoegd in 3 rondes (Sport, Algemene Kennis, Muziek)` });
}
