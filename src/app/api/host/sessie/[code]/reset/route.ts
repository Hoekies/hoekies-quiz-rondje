export const dynamic = "force-dynamic";
export const preferredRegion = ["ams1", "fra1", "cdg1"];
import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

async function verifyAdmin(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return decoded.rol === "admin";
  } catch {
    return false;
  }
}

function shuffle(ids: string[]): string[] {
  const arr = [...ids];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const [isAdmin, { code }] = await Promise.all([verifyAdmin(req), params]);
  if (!isAdmin) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  const sessionRef = adminDb.collection("sessions").doc(code);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) {
    return NextResponse.json({ error: "Sessie niet gevonden" }, { status: 404 });
  }

  const sessionData = sessionSnap.data()!;
  const quizId: string = sessionData.quiz_id;

  // Fetch players, answers en questions parallel
  const [playersSnap, answersSnap, questionsSnap] = await Promise.all([
    adminDb.collection("sessions").doc(code).collection("players").get(),
    adminDb.collection("sessions").doc(code).collection("answers").get(),
    adminDb.collection("quizzes").doc(quizId).collection("questions").get(),
  ]);

  const newQuestionOrder = shuffle(questionsSnap.docs.map((d) => d.id));

  // Batch: reset scores + delete answers + update session
  const BATCH_LIMIT = 490;
  let batch = adminDb.batch();
  let opCount = 0;

  const flush = async () => {
    await batch.commit();
    batch = adminDb.batch();
    opCount = 0;
  };

  for (const player of playersSnap.docs) {
    batch.delete(player.ref);
    opCount++;
    if (opCount >= BATCH_LIMIT) await flush();
  }

  for (const answer of answersSnap.docs) {
    batch.delete(answer.ref);
    opCount++;
    if (opCount >= BATCH_LIMIT) await flush();
  }

  batch.update(sessionRef, {
    state: "lobby",
    status: "lobby",
    current_question_id: null,
    question_index: 0,
    question_order: newQuestionOrder,
    started_at: null,
    reset_at: FieldValue.serverTimestamp(),
  });

  await batch.commit();

  return NextResponse.json({ ok: true });
}
