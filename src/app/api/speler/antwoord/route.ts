export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { player_id, session_id, question_id, answer, response_time_ms } =
    body as {
      player_id: string;
      session_id: string;
      question_id: string;
      answer: string;
      response_time_ms: number;
    };

  if (!player_id || !session_id || !question_id || !answer) {
    return NextResponse.json({ error: "Ontbrekende velden" }, { status: 400 });
  }

  // Validate input formats to prevent injection
  if (typeof player_id !== "string" || typeof session_id !== "string" ||
      typeof question_id !== "string" || typeof answer !== "string") {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }
  if (player_id.length > 128 || session_id.length > 20 || question_id.length > 128) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }

  // Check session state
  const sessionSnap = await adminDb.collection("sessions").doc(session_id).get();
  if (!sessionSnap.exists) {
    return NextResponse.json({ error: "Sessie niet gevonden" }, { status: 404 });
  }
  const sessionData = sessionSnap.data() as { state: string; quiz_id: string };

  if (sessionData.state !== "question_open") {
    return NextResponse.json({ error: "Vraag staat niet open" }, { status: 409 });
  }

  // Verify player exists in this session (prevents submitting answers for other players)
  const playerSnap = await adminDb
    .collection("sessions")
    .doc(session_id)
    .collection("players")
    .doc(player_id)
    .get();
  if (!playerSnap.exists) {
    return NextResponse.json({ error: "Speler niet gevonden in deze sessie" }, { status: 403 });
  }

  // Check duplicate answer: answerId = "{playerId}_{questionId}"
  const answerId = `${player_id}_${question_id}`;
  const existingSnap = await adminDb
    .collection("sessions")
    .doc(session_id)
    .collection("answers")
    .doc(answerId)
    .get();

  if (existingSnap.exists) {
    // Speler heeft al geantwoord (bv. na een reload of dubbele tik). Geef het
    // reeds opgeslagen resultaat terug i.p.v. een kale fout, zodat het
    // reveal-scherm goed/fout + punten correct kan tonen. De rules verbieden de
    // speler om de answers-collectie zelf te lezen, dus dit is de enige manier
    // waarop de telefoon na een reload zijn eigen uitkomst terugkrijgt.
    const ex = existingSnap.data() as { is_correct: boolean; points_awarded: number; answer: string };
    return NextResponse.json(
      {
        error: "Al een antwoord ingediend",
        already_answered: true,
        is_correct: ex.is_correct,
        points_awarded: ex.points_awarded,
        answer: ex.answer,
      },
      { status: 409 }
    );
  }

  // Fetch question
  const questionSnap = await adminDb
    .collection("quizzes")
    .doc(sessionData.quiz_id)
    .collection("questions")
    .doc(question_id)
    .get();

  if (!questionSnap.exists) {
    return NextResponse.json({ error: "Vraag niet gevonden" }, { status: 404 });
  }

  const question = questionSnap.data() as {
    correct_answer: string;
    base_points: number;
    time_limit_seconds: number;
    type: string;
    is_double_points: boolean;
    answer_mode?: string;
    estimate_min?: number;
    estimate_max?: number;
  };

  // Open vraag: los type "open", de tekst-types, óf media-vraag met answer_mode "open"
  const isOpen = ["open", "anagram", "gatentekst", "clues"].includes(question.type) || question.answer_mode === "open";

  // Genormaliseerde vergelijking voor open vragen
  const norm = (s: string) => s.toLowerCase().trim().replace(/[.,!?;:'"()]/g, "").replace(/\s+/g, " ");
  const openCorrect = isOpen && norm(answer) === norm(question.correct_answer);

  // Exacte vergelijking voor keuze-/media-/true_false-vragen. We trimmen beide
  // kanten zodat onbedoelde spaties in de opgeslagen optie of het correcte
  // antwoord geen vals-negatief geven (de optiestring en correct_answer komen
  // uit dezelfde bron, maar trimmen is een veilige extra zekerheid).
  const exactCorrect = (answer ?? "").trim() === (question.correct_answer ?? "").trim();

  // Calculate points
  const isCorrect = isOpen ? openCorrect : exactCorrect;
  let points = 0;

  let matchCorrect = false;
  let multiCorrect = false;
  if (question.type === "estimate") {
    const correct = parseFloat(question.correct_answer);
    const given = parseFloat(answer);
    const range = (question.estimate_max ?? 100) - (question.estimate_min ?? 0);
    const deviation = Math.abs(correct - given);
    const ratio = Math.max(0, 1 - deviation / (range / 2));
    points = Math.round(Math.floor(question.base_points / 10) * ratio);
    if (question.is_double_points) points *= 2;
  } else if (question.type === "match") {
    try {
      const userMapping = JSON.parse(answer) as Record<string, number>;
      const correctMapping = JSON.parse(question.correct_answer) as Record<string, number>;
      matchCorrect = Object.keys(correctMapping).every(
        (k) => String(userMapping[k]) === String(correctMapping[k])
      );
    } catch { matchCorrect = false; }
    if (matchCorrect) {
      const ratio = Math.max(0, 1 - response_time_ms / (question.time_limit_seconds * 1000));
      points = Math.floor(question.base_points / 10) + Math.floor(50 * ratio);
      if (question.is_double_points) points *= 2;
    }
  } else if (question.type === "multi_select") {
    try {
      const given = (JSON.parse(answer) as string[]).map((s) => String(s).trim()).sort();
      const corr = (JSON.parse(question.correct_answer) as string[]).map((s) => String(s).trim()).sort();
      multiCorrect = given.length === corr.length && given.every((v, i) => v === corr[i]);
    } catch { multiCorrect = false; }
    if (multiCorrect) {
      const ratio = Math.max(0, 1 - response_time_ms / (question.time_limit_seconds * 1000));
      points = Math.floor(question.base_points / 10) + Math.floor(50 * ratio);
      if (question.is_double_points) points *= 2;
    }
  } else if (isCorrect) {
    const ratio = Math.max(
      0,
      1 - response_time_ms / (question.time_limit_seconds * 1000)
    );
    const speedBonus =
      question.type === "true_false" ? 0 : Math.floor(50 * ratio);
    points = Math.floor(question.base_points / 10) + speedBonus;
    if (question.is_double_points) points *= 2;
  }

  // Write answer doc
  const isCorrectForRecord = question.type === "estimate" ? points > 0 : question.type === "match" ? matchCorrect : question.type === "multi_select" ? multiCorrect : isCorrect;

  await adminDb
    .collection("sessions")
    .doc(session_id)
    .collection("answers")
    .doc(answerId)
    .set({
      player_id,
      question_id,
      answer,
      is_correct: isCorrectForRecord,
      response_time_ms,
      points_awarded: points,
      submitted_at: FieldValue.serverTimestamp(),
    });

  // Update player score with FieldValue.increment
  await adminDb
    .collection("sessions")
    .doc(session_id)
    .collection("players")
    .doc(player_id)
    .update({
      score: FieldValue.increment(points),
    });

  return NextResponse.json({ is_correct: isCorrectForRecord, points_awarded: points });
}

