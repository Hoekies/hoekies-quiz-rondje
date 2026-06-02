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

  // quiz_id is een routing-veld en hoort niet in het question-document.
  // Alle overige velden (incl. type-specifieke velden zoals media_url,
  // answer_mode, estimate_min/max, image_options, left_items/right_items,
  // audio_start, clip_duration, video_start, blur_steps) worden 1-op-1
  // opgeslagen, net als bij PATCH. Voorheen werden ze hier weggegooid waardoor
  // nieuw aangemaakte vragen (estimate/image_answer/match/media) kapot of fout
  // gescoord werden.
  const { quiz_id, ...fields } = body;
  const { question_text, type, correct_answer } = fields as {
    question_text?: string;
    type?: string;
    correct_answer?: string;
  };

  if (!quiz_id || !question_text || !type || !correct_answer) {
    return NextResponse.json({ error: "Verplichte velden ontbreken" }, { status: 400 });
  }

  const ref = adminDb.collection("quizzes").doc(quiz_id).collection("questions").doc();
  await ref.set({
    explanation: null,
    time_limit_seconds: 20,
    base_points: 1000,
    is_double_points: false,
    round: 1,
    order: 0,
    media_url: null,
    options: null,
    ...fields,
    created_at: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ id: ref.id });
}
