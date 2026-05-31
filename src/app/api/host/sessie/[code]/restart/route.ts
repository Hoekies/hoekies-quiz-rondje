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

function shuffle(ids: string[]): string[] {
  const arr = [...ids];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const isAdmin = await verifyAdmin(req);
  if (!isAdmin) return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });

  const { code } = await params;
  const sessionRef = adminDb.collection("sessions").doc(code);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) return NextResponse.json({ error: "Sessie niet gevonden" }, { status: 404 });

  const { quiz_id } = sessionSnap.data() as { quiz_id: string };

  // Nieuwe willekeurige volgorde genereren
  const questionsSnap = await adminDb.collection("quizzes").doc(quiz_id).collection("questions").get();
  const questionIds = shuffle(questionsSnap.docs.map((d) => d.id));

  // Terug naar lobby — spelers en scores blijven behouden
  await sessionRef.update({
    state: "lobby",
    status: "lobby",
    current_question_id: null,
    question_index: 0,
    question_order: questionIds,
    started_at: null,
    reset_at: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true });
}
