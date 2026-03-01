"use client";

import { OrchestratorChat } from "@/components/agents/orchestrator-chat";

export function CreateAgentClient() {
  return (
    <div className="flex flex-col h-full">
      <OrchestratorChat />
    </div>
  );
}
