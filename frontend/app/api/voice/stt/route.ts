import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await db.user.findUnique({ where: { id: session.userId } });
  const apiKey = user?.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ElevenLabs API key not configured. Add it in Settings." }, { status: 400 });
  }

  try {
    const formData = await req.formData();
    const audio = formData.get("audio") as Blob;
    if (!audio) return NextResponse.json({ error: "No audio provided" }, { status: 400 });

    const elevenFormData = new FormData();
    elevenFormData.append("file", audio, "audio.webm");
    elevenFormData.append("model_id", "scribe_v1");

    const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: elevenFormData,
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("ElevenLabs STT error:", err);
      return NextResponse.json({ error: "Speech recognition failed" }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json({ text: data.text || "" });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
