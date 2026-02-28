"use client";

import { Sun, Moon, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/providers/theme-provider";
import { motion } from "framer-motion";

interface TopbarProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function Topbar({ title, subtitle, actions }: TopbarProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="relative flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--card)]/50 backdrop-blur-sm flex-shrink-0">
      {/* Gradient accent line at bottom */}
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent" />

      <div>
        <motion.h1
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-lg font-semibold text-[var(--foreground)] tracking-tight"
        >
          {title}
        </motion.h1>
        {subtitle && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.05 }}
            className="text-sm text-[var(--muted-foreground)]"
          >
            {subtitle}
          </motion.p>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        {actions}

        <Button
          variant="ghost"
          size="icon"
          className="relative w-8 h-8 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)]"
          title="Notifications (coming soon)"
          disabled
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="w-8 h-8 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-all"
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          <motion.div
            key={theme}
            initial={{ rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </motion.div>
        </Button>
      </div>
    </div>
  );
}
