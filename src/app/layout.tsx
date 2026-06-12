import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import Navbar from "@/components/Navbar";
import UsernameModal from "@/components/UsernameModal";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "The Lads – World Cup 2026",
  description: "FIFA World Cup 2026 prediction game",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#050f09] text-white" suppressHydrationWarning>
        {/* Fixed pitch background */}
        <div aria-hidden="true" className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
          <svg
            viewBox="0 0 1050 680"
            preserveAspectRatio="xMidYMid slice"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full"
            style={{ opacity: 0.07 }}
          >
            {/* Pitch outline */}
            <rect x="20" y="20" width="1010" height="640" fill="none" stroke="#22c55e" strokeWidth="3" />
            {/* Halfway line */}
            <line x1="525" y1="20" x2="525" y2="660" stroke="#22c55e" strokeWidth="3" />
            {/* Center circle */}
            <circle cx="525" cy="340" r="91.5" fill="none" stroke="#22c55e" strokeWidth="3" />
            {/* Center spot */}
            <circle cx="525" cy="340" r="4" fill="#22c55e" />
            {/* Left penalty area */}
            <rect x="20" y="178" width="165" height="324" fill="none" stroke="#22c55e" strokeWidth="3" />
            {/* Left goal area (6-yard box) */}
            <rect x="20" y="258" width="55" height="164" fill="none" stroke="#22c55e" strokeWidth="3" />
            {/* Left penalty spot */}
            <circle cx="131" cy="340" r="4" fill="#22c55e" />
            {/* Left penalty arc */}
            <path d="M 185 265 A 91.5 91.5 0 0 1 185 415" fill="none" stroke="#22c55e" strokeWidth="3" />
            {/* Right penalty area */}
            <rect x="865" y="178" width="165" height="324" fill="none" stroke="#22c55e" strokeWidth="3" />
            {/* Right goal area (6-yard box) */}
            <rect x="975" y="258" width="55" height="164" fill="none" stroke="#22c55e" strokeWidth="3" />
            {/* Right penalty spot */}
            <circle cx="919" cy="340" r="4" fill="#22c55e" />
            {/* Right penalty arc */}
            <path d="M 865 265 A 91.5 91.5 0 0 0 865 415" fill="none" stroke="#22c55e" strokeWidth="3" />
            {/* Corner arcs */}
            <path d="M 20 40 A 20 20 0 0 1 40 20" fill="none" stroke="#22c55e" strokeWidth="3" />
            <path d="M 1010 40 A 20 20 0 0 0 990 20" fill="none" stroke="#22c55e" strokeWidth="3" />
            <path d="M 20 640 A 20 20 0 0 0 40 660" fill="none" stroke="#22c55e" strokeWidth="3" />
            <path d="M 1010 640 A 20 20 0 0 1 990 660" fill="none" stroke="#22c55e" strokeWidth="3" />
          </svg>
        </div>
        <AuthProvider>
          <div className="relative flex flex-col min-h-screen" style={{ zIndex: 1 }}>
            <Navbar />
            <main className="max-w-6xl mx-auto px-4 py-8 w-full flex-1">{children}</main>
          </div>
          <UsernameModal />
        </AuthProvider>
      </body>
    </html>
  );
}
