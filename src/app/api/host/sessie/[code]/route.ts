export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import type { SessionState } from "@/types/database";

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
  { params }: { params: Promise<{ code: string }> }
) {
  const [isAdmin, { code }, body] = await Promise.all([
    verifyAdmin(req),
    params,
    req.json(),
  ]);

  if (!isAdmin) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  const { state, current_question_id, question_index } = body as {
    state: SessionState;
    current_question_id?: string | null;
    question_index?: number;
  };

  let status: string;
  if (state === "lobby") status = "lobby";
  else if (state === "endscreen") status = "finished";
  else status = "active";

  const updatePayload: Record<string, unknown> = { state, status };

  if (current_question_id !== undefined) {
    updatePayload.current_question_id = current_question_id;
  }
  if (question_index !== undefined) {
    updatePayload.question_index = question_index;
  }

  try {
    await adminDb.collection("sessions").doc(code).update(updatePayload);
  } catch (err: unknown) {
    const code5 = (err as { code?: number }).code === 5;
    if (code5) {
      return NextResponse.json({ error: "Sessie niet gevonden" }, { status: 404 });
    }
    throw err;
  }

  return NextResponse.json({ ok: true });
}
