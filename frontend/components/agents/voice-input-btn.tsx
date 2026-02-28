"use client";

import { useState, useRef } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface VoiceInputBtnProps {
  onTranscript: (text: string) => void;
  className?: string;
  disabled?: boolean;
}

export function VoiceInputBtn({ onTranscript, className, disabled }: VoiceInputBtnProps) {
  const [state, setState] = useState<"idle" | "recording" | "processing">("idle");
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setState("processing");

        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        const formData = new FormData();
        formData.append("audio", audioBlob, "audio.webm");

        try {
          const res = await fetch("/api/voice/stt", { method: "POST", body: formData });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "STT failed");
          if (data.text) {
            onTranscript(data.text);
            toast.success("Voice transcribed!");
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Voice recognition failed";
          toast.error(msg.includes("API key") ? "Add your ElevenLabs key in Settings to use voice" : msg);
        } finally {
          setState("idle");
        }
      };

      recorder.start();
      mediaRef.current = recorder;
      setState("recording");
    } catch {
      toast.error("Microphone access denied");
    }
  };

  const stopRecording = () => {
    if (mediaRef.current && state === "recording") {
      mediaRef.current.stop();
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        "w-9 h-9 rounded-xl transition-all duration-200",
        state === "recording" && "bg-red-500/15 text-red-400 mic-recording",
        state === "processing" && "bg-amber-500/15 text-amber-400",
        state === "idle" && "text-[var(--muted-foreground)] hover:text-indigo-400 hover:bg-indigo-500/10",
        className
      )}
      disabled={disabled || state === "processing"}
      onMouseDown={state === "idle" && !disabled ? startRecording : undefined}
      onMouseUp={state === "recording" ? stopRecording : undefined}
      onTouchStart={state === "idle" && !disabled ? startRecording : undefined}
      onTouchEnd={state === "recording" ? stopRecording : undefined}
      title={state === "recording" ? "Release to transcribe" : "Hold to speak"}
    >
      {state === "processing" ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : state === "recording" ? (
        <div className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="waveform-bar w-0.5 bg-red-400 rounded-full" style={{ minHeight: "4px" }} />
          ))}
        </div>
      ) : (
        <Mic className="w-4 h-4" />
      )}
    </Button>
  );
}
