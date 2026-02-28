"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Sun, Moon } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useTheme } from "@/components/providers/theme-provider";

export function LandingNav() {
  const { theme, toggleTheme } = useTheme();

  const bgGradient =
    theme === "dark"
      ? "linear-gradient(to bottom, rgba(10,10,16,0.92) 0%, transparent 100%)"
      : "linear-gradient(to bottom, rgba(255,255,255,0.94) 0%, transparent 100%)";

  return (
    <motion.nav
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4"
      style={{ background: bgGradient, backdropFilter: "blur(8px)" }}
    >
      <Link
        href="/"
        className="flex items-center gap-2 font-bold text-[var(--foreground)] text-lg"
      >
        <Logo width={72} height={72} />
        PublicAI Foundry
      </Link>

      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="w-8 h-8 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/8"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>
        <Button
          asChild
          variant="ghost"
          className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          <Link href="/login">Sign In</Link>
        </Button>
        <Button
          asChild
          className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium"
        >
          <Link href="/signup">Get Started</Link>
        </Button>
      </div>
    </motion.nav>
  );
}
