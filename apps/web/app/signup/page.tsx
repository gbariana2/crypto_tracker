"use client";

import { useState } from "react";
import { getSupabase } from "@/lib/supabase";
import Link from "next/link";

export default function SignUpPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = getSupabase();
    const { error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <div className="rounded-lg border border-up/30 bg-up/10 px-4 py-6">
            <h2 className="text-lg font-semibold text-up">Check your email</h2>
            <p className="mt-2 text-sm text-up/80">
              We sent a confirmation link to <strong>{email}</strong>.
              Click it to activate your account.
            </p>
          </div>
          <Link href="/login" className="inline-block text-sm font-medium text-accent hover:text-accent/80">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-accent">CryptoTracker</h1>
          <p className="mt-1 text-sm text-muted">Create your account</p>
        </div>

        <form onSubmit={handleSignUp} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-down/30 bg-down/10 px-4 py-3 text-sm text-down">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-muted">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-foreground placeholder-muted/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider text-muted">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-foreground placeholder-muted/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              placeholder="Min. 6 characters"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-background transition-colors hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50"
          >
            {loading ? "Creating account..." : "Sign up"}
          </button>
        </form>

        <p className="text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-accent hover:text-accent/80">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
