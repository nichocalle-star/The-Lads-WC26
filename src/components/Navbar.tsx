"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/predictions", label: "Picks" },
  { href: "/schedule", label: "Schedule" },
  { href: "/rules", label: "Rules" },
];

export default function Navbar() {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();

  return (
    <nav className="bg-[#07140c] border-b border-[#16301f]">
      {/* Host-nation tri-stripe: Mexico green / USA red / Canada blue */}
      <div className="flex h-1">
        <div className="flex-1 bg-[#0a7a3d]" />
        <div className="flex-1 bg-[#c8102e]" />
        <div className="flex-1 bg-[#0a3161]" />
      </div>

      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-5">
          <Link href="/" className="flex items-center gap-2.5 group">
            <span className="w-8 h-8 rounded-full bg-[#0a7a3d] flex items-center justify-center text-base">⚽</span>
            <span className="leading-tight">
              <span className="block text-[15px] font-bold tracking-wide text-white group-hover:text-[#2bd97a] transition-colors">THE LADS</span>
              <span className="block text-[9px] uppercase tracking-[0.2em] text-[#7fd4a3]">World Cup 2026</span>
            </span>
          </Link>
          {user && (
            <div className="flex items-center gap-1 ml-2">
              {LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
                    pathname === l.href
                      ? "text-white bg-[#10301c] font-medium"
                      : "text-[#9ec9ad] hover:text-white hover:bg-[#0b1d12]"
                  }`}
                >
                  {l.label}
                </Link>
              ))}
              {user.isAdmin && (
                <Link href="/admin" className="text-sm px-3 py-1.5 rounded-lg text-yellow-400 hover:text-yellow-300 transition-colors">
                  Admin
                </Link>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {loading ? (
            <div className="w-8 h-8 rounded-full bg-[#10301c] animate-pulse" />
          ) : user ? (
            <>
              <div className="flex items-center gap-2">
                {user.photoURL && (
                  <Image src={user.photoURL} alt={user.displayName} width={28} height={28} className="rounded-full" />
                )}
                <span className="text-sm text-[#9ec9ad] hidden sm:block">{user.username ?? user.displayName}</span>
              </div>
              <button onClick={logout} className="text-xs text-[#6fae87] hover:text-white transition-colors border border-[#1d3a28] rounded-lg px-3 py-1.5">
                Sign out
              </button>
            </>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
