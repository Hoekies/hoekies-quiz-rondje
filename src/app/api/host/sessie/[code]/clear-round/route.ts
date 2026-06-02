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

// Wist de antwoorden van een set vragen (bv. bij het opnieuw spelen van een ronde)
// en corrigeert de spelersscores met de eerder toegekende punten, zodat spelers
// opnieuw kunnen kiezen en de score niet dubbel telt.
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const [isAdmin, { code }] = await Promise.all([verifyAdmin(req), params]);
  if (!isAdmin) return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.question_ids) ? body.question_ids : [];
  if (ids.length === 0) return NextResponse.json({ ok: true, cleared: 0 });
  const idSet = new Set(ids);

  const answersRef = adminDb.collection("sessions").doc(code).collection("answers");
  const snap = await answersRef.get();

  const scoreDelta: Record<string, number> = {};
  let batch = adminDb.batch();
  let ops = 0;
  let cleared = 0;

  for (const d of snap.docs) {
    const data = d.data() as { player_id?: string; question_id?: string; points_awarded?: number };
    if (!data.question_id || !idSet.has(data.question_id)) continue;
    if (data.player_id) scoreDelta[data.player_id] = (scoreDelta[data.player_id] ?? 0) - (data.points_awarded ?? 0);
    batch.delete(d.ref);
    cleared++; ops++;
    if (ops >= 400) { await batch.commit(); batch = adminDb.batch(); ops = 0; }
  }
  if (ops > 0) await batch.commit();

  // Scores corrigeren (verlaag met de eerder toegekende punten)
  let sbatch = adminDb.batch();
  let sops = 0;
  for (const [pid, delta] of Object.entries(scoreDelta)) {
    if (delta === 0) continue;
    sbatch.update(adminDb.collection("sessions").doc(code).collection("players").doc(pid), {
      score: FieldValue.increment(delta),
    });
    if (++sops >= 400) { await sbatch.commit(); sbatch = adminDb.batch(); sops = 0; }
  }
  if (sops > 0) await sbatch.commit();

  return NextResponse.json({ ok: true, cleared });
}
