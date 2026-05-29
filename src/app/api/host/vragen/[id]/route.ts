export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";

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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [isAdmin, { id }, body] = await Promise.all([
    verifyAdmin(req),
    params,
    req.json(),
  ]);
  if (!isAdmin) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  const { quiz_id, ...fields } = body;
  if (!quiz_id) {
    return NextResponse.json({ error: "quiz_id vereist" }, { status: 400 });
  }

  const ref = adminDb.collection("quizzes").doc(quiz_id).collection("questions").doc(id);
  try {
    await ref.update(fields);
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 5) {
      return NextResponse.json({ error: "Vraag niet gevonden" }, { status: 404 });
    }
    throw err;
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const quizId = req.nextUrl.searchParams.get("quiz_id");
  const [isAdmin, { id }] = await Promise.all([verifyAdmin(req), params]);
  if (!isAdmin) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }
  if (!quizId) {
    return NextResponse.json({ error: "quiz_id vereist" }, { status: 400 });
  }

  await adminDb
    .collection("quizzes")
    .doc(quizId)
    .collection("questions")
    .doc(id)
    .delete();

  return NextResponse.json({ ok: true });
}
