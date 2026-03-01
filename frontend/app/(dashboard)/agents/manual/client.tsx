"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { AgentForm } from "@/components/agents/agent-form";

export function ManualBuildClient() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 pt-6 pb-4">
        <Link
          href="/agents"
          className="flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Agents
        </Link>
        <span className="text-[var(--border)]">/</span>
        <span className="text-sm text-[var(--foreground)] font-medium">
          Manual Build
        </span>
      </div>
      <div className="flex-1 overflow-hidden">
        <AgentForm />
      </div>
    </div>
  );
}
