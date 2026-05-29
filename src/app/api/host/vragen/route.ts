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
    return decoded.rol === "admin";
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const isAdmin = await verifyAdmin(req);
  if (!isAdmin) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  const quizId = req.nextUrl.searchParams.get("quiz_id");
  if (!quizId) {
    return NextResponse.json({ error: "quiz_id vereist" }, { status: 400 });
  }

  const snap = await adminDb
    .collection("quizzes")
    .doc(quizId)
    .collection("questions")
    .get();

  const questions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return NextResponse.json({ questions });
}

export async function POST(req: NextRequest) {
  const [isAdmin, body] = await Promise.all([verifyAdmin(req), req.json()]);
  if (!isAdmin) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  const { quiz_id, question_text, type, options, correct_answer,
    time_limit_seconds, base_points, is_double_points, round, order } = body;

  if (!quiz_id || !question_text || !type || !correct_answer) {
    return NextResponse.json({ error: "Verplichte velden ontbreken" }, { status: 400 });
  }

  const ref = adminDb.collection("quizzes").doc(quiz_id).collection("questions").doc();
  await ref.set({
    question_text,
    type,
    options: options ?? null,
    correct_answer,
    media_url: null,
    explanation: null,
    time_limit_seconds: time_limit_seconds ?? 20,
    base_points: base_points ?? 1000,
    is_double_points: is_double_points ?? false,
    round: round ?? 1,
    order: order ?? 0,
    created_at: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ id: ref.id });
}
