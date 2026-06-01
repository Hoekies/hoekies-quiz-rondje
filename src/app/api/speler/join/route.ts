export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { code, name, avatar } = body as { code: string; name: string; avatar?: string };
  const safeAvatar = typeof avatar === "string" && avatar.length <= 8 ? avatar : "🙂";

  if (!code || !name || name.trim().length === 0) {
    return NextResponse.json({ error: "Code en naam zijn verplicht" }, { status: 400 });
  }
  if (typeof code !== "string" || typeof name !== "string") {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }
  if (name.trim().length > 24) {
    return NextResponse.json({ error: "Naam mag maximaal 24 tekens zijn" }, { status: 400 });
  }

  const sessionRef = adminDb.collection("sessions").doc(code.toUpperCase());
  const sessionSnap = await sessionRef.get();

  if (!sessionSnap.exists) {
    return NextResponse.json({ error: "Sessie niet gevonden" }, { status: 404 });
  }

  const sessionData = sessionSnap.data() as { status: string; state: string; is_active?: boolean };

  if (sessionData.is_active === false) {
    return NextResponse.json(
      { error: "Sessie is momenteel niet actief. Wacht op de host." },
      { status: 409 }
    );
  }

  // Invallen mag tijdens een lopende sessie; alleen een afgeronde sessie weigeren.
  if (sessionData.status === "finished") {
    return NextResponse.json(
      { error: "Deze sessie is al afgelopen" },
      { status: 409 }
    );
  }

  const existingSnap = await sessionRef
    .collection("players")
    .where("name", "==", name.trim())
    .limit(1)
    .get();

  if (!existingSnap.empty) {
    return NextResponse.json(
      { error: "Deze naam is al bezet, kies een andere" },
      { status: 409 }
    );
  }

  const playerRef = await sessionRef.collection("players").add({
    name: name.trim(),
    avatar: safeAvatar,
    score: 0,
    joined_at: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({
    player_id: playerRef.id,
    session_id: code.toUpperCase(),
  });
}

