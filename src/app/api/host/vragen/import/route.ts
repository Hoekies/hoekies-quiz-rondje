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

interface ImportRow {
  question_text: string;
  type: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  time_limit_seconds: string | number;
  base_points: string | number;
  is_double_points: string | boolean;
  round: string | number;
  order: string | number;
}

export async function POST(req: NextRequest) {
  const [isAdmin, body] = await Promise.all([verifyAdmin(req), req.json()]);
  if (!isAdmin) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  const { quiz_id, questions } = body as { quiz_id: string; questions: ImportRow[] };
  if (!quiz_id || !Array.isArray(questions)) {
    return NextResponse.json({ error: "quiz_id en questions vereist" }, { status: 400 });
  }

  const errors: string[] = [];
  let created = 0;
  const BATCH_LIMIT = 490;
  let batch = adminDb.batch();
  let opCount = 0;

  for (let i = 0; i < questions.length; i++) {
    const row = questions[i];
    if (!row.question_text?.trim() || !row.correct_answer?.trim()) {
      errors.push(`Rij ${i + 2}: question_text en correct_answer zijn verplicht`);
      continue;
    }

    const validTypes = ["multiple_choice", "true_false", "image", "audio"];
    const type = row.type?.trim() || "multiple_choice";
    if (!validTypes.includes(type)) {
      errors.push(`Rij ${i + 2}: ongeldig type "${type}"`);
      continue;
    }

    const options = [row.option_a, row.option_b, row.option_c, row.option_d]
      .map((o) => (o ?? "").trim())
      .filter(Boolean);

    const ref = adminDb.collection("quizzes").doc(quiz_id).collection("questions").doc();
    batch.set(ref, {
      question_text: row.question_text.trim(),
      type,
      options: options.length > 0 ? options : null,
      correct_answer: row.correct_answer.trim(),
      media_url: null,
      explanation: null,
      time_limit_seconds: Number(row.time_limit_seconds) || 20,
      base_points: Number(row.base_points) || 1000,
      is_double_points: row.is_double_points === true || String(row.is_double_points).toLowerCase() === "true",
      round: Number(row.round) || 1,
      order: Number(row.order) || 0,
      created_at: FieldValue.serverTimestamp(),
    });
    opCount++;
    created++;

    if (opCount >= BATCH_LIMIT) {
      await batch.commit();
      batch = adminDb.batch();
      opCount = 0;
    }
  }

  if (opCount > 0) await batch.commit();

  return NextResponse.json({ created, errors });
}
