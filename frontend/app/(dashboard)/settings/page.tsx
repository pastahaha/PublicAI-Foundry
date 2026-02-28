import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { SettingsClient } from "./client";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      name: true,
      email: true,
      theme: true,
      mistralApiKey: true,
      elevenLabsApiKey: true,
      elevenLabsVoiceId: true,
    },
  });

  if (!user) redirect("/login");

  // Mask API keys — only send last 4 chars
  const maskedMistral = user.mistralApiKey
    ? `${"•".repeat(20)}${user.mistralApiKey.slice(-4)}`
    : "";
  const maskedElevenLabs = user.elevenLabsApiKey
    ? `${"•".repeat(20)}${user.elevenLabsApiKey.slice(-4)}`
    : "";

  return (
    <SettingsClient
      user={{
        ...user,
        mistralApiKey: maskedMistral,
        elevenLabsApiKey: maskedElevenLabs,
      }}
    />
  );
}
