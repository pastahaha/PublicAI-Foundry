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
    const audio = formData.get("audio") as Blob | null;
    if (!audio || audio.size === 0) {
      return NextResponse.json({ error: "No audio provided" }, { status: 400 });
    }

    // Convert the incoming Blob to a proper buffer for the upstream call
    const audioBuffer = Buffer.from(await audio.arrayBuffer());

    // Determine the file extension from the mime type
    const mimeType = audio.type || "audio/webm";
    const ext = mimeType.includes("mp4") ? "mp4" : "webm";

    const elevenFormData = new FormData();
    elevenFormData.append(
      "file",
      new Blob([audioBuffer], { type: mimeType }),
      `audio.${ext}`
    );
    elevenFormData.append("model_id", "scribe_v1");
    // Language hint for better accuracy
    elevenFormData.append("language_code", "en");

    const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: elevenFormData,
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("ElevenLabs STT error:", res.status, err);
      // Provide more specific error messages
      if (res.status === 401) {
        return NextResponse.json({ error: "Invalid ElevenLabs API key. Check your key in Settings." }, { status: 401 });
      }
      if (res.status === 429) {
        return NextResponse.json({ error: "Rate limit reached. Try again in a moment." }, { status: 429 });
      }
      return NextResponse.json({ error: "Speech recognition failed — try speaking more clearly" }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json({ text: data.text || "" });
  } catch (err) {
    console.error("STT route error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
