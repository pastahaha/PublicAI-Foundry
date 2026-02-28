import Link from "next/link";
import { Logo } from "@/components/Logo";

export function Footer() {
  return (
    <footer className="bg-[var(--l-bg)] border-t border-[var(--border)] py-12">
      <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-2 font-bold text-[var(--foreground)]">
          <Logo width={72} height={72} />
          PublicAI Foundry
        </Link>
        <p className="text-[var(--muted-foreground)] text-sm">
          © {new Date().getFullYear()} PublicAI Foundry · Built for public good
        </p>
        <div className="flex gap-6 text-sm text-[var(--muted-foreground)]">
          <Link href="/login" className="hover:text-[var(--foreground)] transition-colors">Sign In</Link>
          <Link href="/signup" className="hover:text-[var(--foreground)] transition-colors">Sign Up</Link>
        </div>
      </div>
    </footer>
  );
}
