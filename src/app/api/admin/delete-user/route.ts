import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

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
  try {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const username = body?.username;
    if (!username) return NextResponse.json({ error: "username required" }, { status: 400 });

    const { db, auth } = getAdmin();

    const userSnap = await db.collection("users").where("username", "==", username).limit(1).get();
    if (userSnap.empty) {
      return NextResponse.json({ error: `No user found with username: ${username}` }, { status: 404 });
    }

    const userDoc = userSnap.docs[0];
    const uid = userDoc.id;

    const predsSnap = await db.collection("predictions").where("userId", "==", uid).get();
    const batch = db.batch();
    for (const d of predsSnap.docs) batch.delete(d.ref);
    batch.delete(db.collection("userMetrics").doc(uid));
    batch.delete(userDoc.ref);
    await batch.commit();

    try {
      await auth.deleteUser(uid);
    } catch (authErr) {
      console.warn("Auth delete skipped:", authErr);
    }

    return NextResponse.json({ ok: true, deleted: username, uid, predictionsRemoved: predsSnap.size });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("delete-user error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
