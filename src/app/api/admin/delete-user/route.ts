import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

export const runtime = "nodejs";

function getAdmin() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  }
  return { db: getFirestore(), auth: getAuth() };
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { username } = await req.json();
  if (!username) return NextResponse.json({ error: "username required" }, { status: 400 });

  const { db, auth } = getAdmin();

  // Find the user by username
  const userSnap = await db.collection("users").where("username", "==", username).limit(1).get();
  if (userSnap.empty) {
    return NextResponse.json({ error: `No user found with username: ${username}` }, { status: 404 });
  }

  const userDoc = userSnap.docs[0];
  const uid = userDoc.id;

  // Delete all their predictions
  const predsSnap = await db.collection("predictions").where("userId", "==", uid).get();
  const batch = db.batch();
  for (const d of predsSnap.docs) batch.delete(d.ref);

  // Delete userMetrics doc
  batch.delete(db.collection("userMetrics").doc(uid));

  // Delete users doc
  batch.delete(userDoc.ref);
  await batch.commit();

  // Delete Firebase Auth account
  try {
    await auth.deleteUser(uid);
  } catch {
    // Auth account may not exist — not fatal
  }

  return NextResponse.json({ ok: true, deleted: username, uid, predictionsRemoved: predsSnap.size });
}
