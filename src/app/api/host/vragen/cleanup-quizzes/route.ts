export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";

async function verifyAdmin(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    return decoded.rol === "admin";
  } catch { return false; }
}

// Verwijdert alle quizzen behalve de hoofdquiz (de app speelt altijd uit één quiz).
// Inclusief hun questions-subcollectie.
export async function POST(req: NextRequest) {
  const isAdmin = await verifyAdmin(req);
  if (!isAdmin) return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });

  const quizzes = await adminDb.collection("quizzes").get();
  if (quizzes.size <= 1) return NextResponse.json({ message: "Geen extra quizzen om op te ruimen" });

  // Hoofdquiz = eerste doc (zelfde selectie als de app met limit(1), op __name__).
  const keepId = quizzes.docs[0].id;
  let removed = 0;

  for (const quizDoc of quizzes.docs) {
    if (quizDoc.id === keepId) continue;
    // Verwijder questions-subcollectie in batches
    const qs = await quizDoc.ref.collection("questions").get();
    let batch = adminDb.batch();
    let ops = 0;
    for (const q of qs.docs) {
      batch.delete(q.ref);
      if (++ops >= 400) { await batch.commit(); batch = adminDb.batch(); ops = 0; }
    }
    if (ops > 0) await batch.commit();
    await quizDoc.ref.delete();
    removed++;
  }

  return NextResponse.json({ message: `${removed} extra quiz${removed === 1 ? "" : "zen"} verwijderd` });
}
