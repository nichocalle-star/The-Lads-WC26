"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc, setDoc, collection, query, where, getDocs } from "firebase/firestore";
import { auth, db, googleProvider } from "./firebase";
import { User } from "./types";

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  authError: string | null;
  needsUsername: boolean;
  signInWithGoogle: () => Promise<void>;
  signUpWithPassword: (username: string, password: string) => Promise<{ error?: string }>;
  signInWithPassword: (username: string, password: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  saveUsername: (username: string) => Promise<{ error?: string }>;
}

const AuthContext = createContext<AuthContextType | null>(null);

async function upsertUser(fbUser: FirebaseUser): Promise<User> {
  const userRef = doc(db, "users", fbUser.uid);
  const userSnap = await getDoc(userRef);
  if (userSnap.exists()) {
    return userSnap.data() as User;
  }
  const newUser: User = {
    uid: fbUser.uid,
    email: fbUser.email ?? "",
    displayName: fbUser.displayName ?? "Player",
    ...(fbUser.photoURL ? { photoURL: fbUser.photoURL } : {}),
    isAdmin: false,
    createdAt: new Date().toISOString(),
  };
  await setDoc(userRef, newUser);
  return newUser;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [needsUsername, setNeedsUsername] = useState(false);

  useEffect(() => {
    // Handle redirect result on page load
    getRedirectResult(auth)
      .then(async (result) => {
        if (result?.user) {
          const u = await upsertUser(result.user);
          setUser(u);
        }
      })
      .catch((err) => {
        console.error("Redirect sign-in error:", err);
        setAuthError(err.message);
      });

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        try {
          const u = await upsertUser(fbUser);
          setUser(u);
          setNeedsUsername(!u.username);
        } catch (err) {
          console.error("Firestore user error:", err);
        }
      } else {
        setUser(null);
        setNeedsUsername(false);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signInWithGoogle = async () => {
    setAuthError(null);
    try {
      // Try popup first; fall back to redirect if blocked
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "auth/popup-blocked" || code === "auth/popup-closed-by-user") {
        await signInWithRedirect(auth, googleProvider);
      } else {
        const message = err instanceof Error ? err.message : "Sign-in failed";
        setAuthError(message);
        console.error("Sign-in error:", err);
      }
    }
  };

  const signUpWithPassword = async (username: string, password: string): Promise<{ error?: string }> => {
    const clean = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(clean)) {
      return { error: "3–20 chars, letters/numbers/underscores only" };
    }
    try {
      // Check uniqueness before creating auth user. May throw permission-denied
      // if Firestore rules require auth — in that case we skip and let auth handle it.
      const taken = await getDocs(query(collection(db, "users"), where("username", "==", clean)));
      if (!taken.empty) return { error: "Username already taken" };
    } catch {
      // Firestore rules may block unauthenticated reads — proceed anyway
    }
    try {
      const cred = await createUserWithEmailAndPassword(auth, `${clean}@thelads.wc26`, password);
      await updateProfile(cred.user, { displayName: clean });
      const newUser: User = {
        uid: cred.user.uid,
        email: `${clean}@thelads.wc26`,
        displayName: clean,
        username: clean,
        isAdmin: false,
        createdAt: new Date().toISOString(),
      };
      await setDoc(doc(db, "users", cred.user.uid), newUser);
      setUser(newUser);
      setNeedsUsername(false);
      return {};
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "auth/email-already-in-use") return { error: "Username already taken" };
      const message = err instanceof Error ? err.message : "Sign-up failed";
      return { error: message };
    }
  };

  const signInWithPassword = async (username: string, password: string): Promise<{ error?: string }> => {
    const clean = username.trim().toLowerCase();
    try {
      await signInWithEmailAndPassword(auth, `${clean}@thelads.wc26`, password);
      return {};
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "auth/user-not-found" || code === "auth/wrong-password" || code === "auth/invalid-credential") {
        return { error: "Wrong username or password" };
      }
      return { error: err instanceof Error ? err.message : "Sign-in failed" };
    }
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    setNeedsUsername(false);
  };

  const saveUsername = async (username: string): Promise<{ error?: string }> => {
    if (!user) return { error: "Not signed in" };
    const clean = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(clean)) {
      return { error: "3–20 chars, letters/numbers/underscores only" };
    }
    // Check uniqueness
    const taken = await getDocs(query(collection(db, "users"), where("username", "==", clean)));
    if (!taken.empty) return { error: "Username already taken" };
    const updated = { ...user, username: clean };
    await setDoc(doc(db, "users", user.uid), updated);
    setUser(updated);
    setNeedsUsername(false);
    return {};
  };

  return (
    <AuthContext.Provider value={{ user, firebaseUser, loading, authError, needsUsername, signInWithGoogle, signUpWithPassword, signInWithPassword, logout, saveUsername }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
