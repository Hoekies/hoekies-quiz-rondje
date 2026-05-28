import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envContent = readFileSync(join(__dirname, "../.env.local"), "utf8");
const env = {};
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim().replace(/^"|"$/g, "");
}

const app = initializeApp({
  credential: cert({
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});

const db = getFirestore(app);

async function cleanup() {
  const quizzes = await db.collection("quizzes").orderBy("__name__").get();
  console.log(`${quizzes.size} quizzen gevonden`);

  if (quizzes.size <= 1) { console.log("Niets te doen."); process.exit(0); }

  // Verwijder alle behalve de laatste (meest recent aangemaakt)
  const toDelete = quizzes.docs.slice(0, -1);
  for (const doc of toDelete) {
    // Verwijder subcollectie questions
    const questions = await doc.ref.collection("questions").get();
    const batch = db.batch();
    questions.docs.forEach(q => batch.delete(q.ref));
    batch.delete(doc.ref);
    await batch.commit();
    console.log(`✅ Verwijderd: ${doc.id}`);
  }
  console.log("🎉 Opgeruimd.");
  process.exit(0);
}

cleanup().catch(err => { console.error("❌", err.message); process.exit(1); });
