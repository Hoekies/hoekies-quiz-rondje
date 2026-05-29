export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

async function verifyAdmin(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    console.log("[auth] decoded claims:", JSON.stringify(decoded));
    return decoded.rol === "admin";
  } catch (err) {
    console.error("[auth] verifyIdToken failed:", err);
    return false;
  }
}

export async function POST(req: NextRequest) {
  const isAdmin = await verifyAdmin(req);
  if (!isAdmin) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { quiz_id } = body as { quiz_id?: string };

  // Generate unique 6-char code [A-Z0-9]
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  let attempts = 0;

  while (attempts < 10) {
    let candidate = "";
    for (let i = 0; i < 6; i++) {
      candidate += chars[Math.floor(Math.random() * chars.length)];
    }
    // Check uniqueness
    const snap = await adminDb.collection("sessions").doc(candidate).get();
    if (!snap.exists) {
      code = candidate;
      break;
    }
    attempts++;
  }

  if (!code) {
    return NextResponse.json(
      { error: "Kon geen unieke code genereren" },
      { status: 500 }
    );
  }

  // Resolve quiz_id: use provided or pick first available quiz
  let resolvedQuizId = quiz_id;
  if (!resolvedQuizId) {
    const quizzesSnap = await adminDb.collection("quizzes").limit(1).get();
    if (quizzesSnap.empty) {
      return NextResponse.json(
        { error: "Geen quizzen beschikbaar" },
        { status: 400 }
      );
    }
    resolvedQuizId = quizzesSnap.docs[0].id;
  }

  // Shuffle question IDs (Fisher-Yates)
  const questionsSnap = await adminDb
    .collection("quizzes")
    .doc(resolvedQuizId)
    .collection("questions")
    .get();
  const questionIds = questionsSnap.docs.map((d) => d.id);
  for (let i = questionIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [questionIds[i], questionIds[j]] = [questionIds[j], questionIds[i]];
  }

  await adminDb.collection("sessions").doc(code).set({
    quiz_id: resolvedQuizId,
    code,
    status: "lobby",
    state: "lobby",
    current_question_id: null,
    question_index: 0,
    question_order: questionIds,
    started_at: null,
    created_at: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ code });
}

