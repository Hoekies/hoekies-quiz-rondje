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

  // Check session state
  const sessionSnap = await adminDb.collection("sessions").doc(session_id).get();
  if (!sessionSnap.exists) {
    return NextResponse.json({ error: "Sessie niet gevonden" }, { status: 404 });
  }
  const sessionData = sessionSnap.data() as { state: string; quiz_id: string };

  if (sessionData.state !== "question_open") {
    return NextResponse.json({ error: "Vraag staat niet open" }, { status: 409 });
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
    return NextResponse.json(
      { error: "Al een antwoord ingediend" },
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
  };

  // Calculate points
  const isCorrect = answer === question.correct_answer;
  let points = 0;

  if (isCorrect) {
    const ratio = Math.max(
      0,
      1 - response_time_ms / (question.time_limit_seconds * 1000)
    );
    const speedBonus =
      question.type === "true_false" ? 0 : Math.floor(500 * ratio);
    points = question.base_points + speedBonus;
    if (question.is_double_points) points *= 2;
  }

  // Write answer doc
  await adminDb
    .collection("sessions")
    .doc(session_id)
    .collection("answers")
    .doc(answerId)
    .set({
      player_id,
      question_id,
      answer,
      is_correct: isCorrect,
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

  return NextResponse.json({ is_correct: isCorrect, points_awarded: points });
}

