"use client";

import { useAuth } from "./AuthProvider";
import { getSupabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function Navbar() {
  const { user } = useAuth();
  const router = useRouter();

  async function handleSignOut() {
    const supabase = getSupabase();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (!user) return null;

  return (
    <nav className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold tracking-tight text-accent">
            CryptoTracker
          </span>
          <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent">
            Live
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-muted">
            {user.email}
          </span>
          <button
            onClick={handleSignOut}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-muted hover:text-foreground"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
