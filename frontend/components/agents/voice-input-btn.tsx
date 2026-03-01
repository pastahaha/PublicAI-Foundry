"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, Loader2, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Augment Window for the vendor-prefixed SpeechRecognition API       */
/* ------------------------------------------------------------------ */
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */
interface VoiceInputBtnProps {
  /** Called with the final transcript text. */
  onTranscript: (text: string) => void;
  /** Called with live interim text while the user is still speaking. */
  onInterim?: (text: string) => void;
  className?: string;
  disabled?: boolean;
}

/**
 * Continuous voice input button — click to start, click again to stop.
 *
 * **Primary mode (Chrome, Edge, Safari):**
 *   Uses the Web Speech API with `continuous=true` and `interimResults=true`
 *   for real-time streaming transcription. The user can speak freely and
 *   see words appear live in the input field via the `onInterim` callback.
 *   Final results are committed via `onTranscript`.
 *
 * **Fallback mode (Firefox, or when Web Speech API is unavailable):**
 *   Records audio via MediaRecorder and sends it to ElevenLabs Scribe STT
 *   through `/api/voice/stt`.
 */
export function VoiceInputBtn({
  onTranscript,
  onInterim,
  className,
  disabled,
}: VoiceInputBtnProps) {
  const [state, setState] = useState<"idle" | "listening" | "processing">("idle");

  // Web Speech API refs
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const wantStopRef = useRef(false); // true when user clicks stop
  const listeningRef = useRef(false); // mirrors state for use in callbacks

  // Fallback MediaRecorder refs
  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const hasWebSpeech = useRef<boolean>(!!getSpeechRecognition());

  /* ---------------------------------------------------------------- */
  /*  Cleanup on unmount                                               */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  /* ---------------------------------------------------------------- */
  /*  ElevenLabs fallback transcription                                */
  /* ---------------------------------------------------------------- */
  const transcribeFallback = useCallback(
    async (audioBlob: Blob) => {
      setState("processing");
      const formData = new FormData();
      formData.append("audio", audioBlob, "audio.webm");

      try {
        const res = await fetch("/api/voice/stt", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "STT failed");
        if (data.text?.trim()) {
          onTranscript(data.text.trim());
          toast.success("Voice transcribed!");
        } else {
          toast.error("No speech detected — try again");
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Voice recognition failed";
        toast.error(
          msg.includes("API key")
            ? "Add your ElevenLabs key in Settings to use voice"
            : msg,
        );
      } finally {
        setState("idle");
      }
    },
    [onTranscript],
  );

  /* ---------------------------------------------------------------- */
  /*  Web Speech API — start                                           */
  /* ---------------------------------------------------------------- */
  const startWebSpeech = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-AU"; // NSW context — Australian English

    wantStopRef.current = false;

    recognition.onresult = (ev: SpeechRecognitionEvent) => {
      let interim = "";
      let final_ = "";

      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const transcript = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) {
          final_ += transcript;
        } else {
          interim += transcript;
        }
      }

      // Commit final results immediately
      if (final_.trim()) {
        onTranscript(final_.trim());
      }
      // Stream interim text for live preview
      if (interim && onInterim) {
        onInterim(interim);
      }
    };

    recognition.onerror = (ev: SpeechRecognitionErrorEvent) => {
      // "no-speech" and "aborted" are benign — just restart unless user stopped
      if (ev.error === "no-speech" || ev.error === "aborted") return;
      toast.error(`Speech recognition error: ${ev.error}`);
      setState("idle");
    };

    recognition.onend = () => {
      // Chrome auto-stops after ~60s silence — restart unless user clicked stop
      if (!wantStopRef.current && listeningRef.current) {
        try {
          recognition.start();
        } catch {
          // Already running or disposed — ignore
        }
        return;
      }
      recognitionRef.current = null;
      listeningRef.current = false;
      onInterim?.(""); // Clear interim preview
      setState("idle");
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      listeningRef.current = true;
      setState("listening");
    } catch {
      toast.error("Could not start speech recognition");
    }
  }, [onTranscript, onInterim]);

  /* ---------------------------------------------------------------- */
  /*  Web Speech API — stop                                            */
  /* ---------------------------------------------------------------- */
  const stopWebSpeech = useCallback(() => {
    wantStopRef.current = true;
    listeningRef.current = false;
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  /* ---------------------------------------------------------------- */
  /*  MediaRecorder fallback — start                                   */
  /* ---------------------------------------------------------------- */
  const startFallbackRecording = useCallback(async () => {
    try {
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4";

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
      });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        if (chunksRef.current.length === 0) {
          toast.error("No audio captured — check your microphone");
          setState("idle");
          return;
        }

        const audioBlob = new Blob(chunksRef.current, { type: mimeType });
        if (audioBlob.size < 1000) {
          toast.error("Recording too short — speak for at least a second");
          setState("idle");
          return;
        }
        transcribeFallback(audioBlob);
      };

      recorder.start(1000);
      mediaRef.current = recorder;
      setState("listening");
    } catch {
      toast.error("Microphone access denied — check browser permissions");
      setState("idle");
    }
  }, [transcribeFallback]);

  /* ---------------------------------------------------------------- */
  /*  MediaRecorder fallback — stop                                    */
  /* ---------------------------------------------------------------- */
  const stopFallbackRecording = useCallback(() => {
    if (mediaRef.current && mediaRef.current.state !== "inactive") {
      mediaRef.current.stop();
      mediaRef.current = null;
    }
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Toggle                                                           */
  /* ---------------------------------------------------------------- */
  const handleClick = useCallback(() => {
    if (disabled || state === "processing") return;

    if (state === "idle") {
      if (hasWebSpeech.current) {
        startWebSpeech();
      } else {
        startFallbackRecording();
      }
    } else if (state === "listening") {
      if (hasWebSpeech.current) {
        stopWebSpeech();
      } else {
        stopFallbackRecording();
      }
    }
  }, [state, disabled, startWebSpeech, startFallbackRecording, stopWebSpeech, stopFallbackRecording]);

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        "w-9 h-9 rounded-xl transition-all duration-200",
        state === "listening" && "bg-red-500/15 text-red-400 mic-recording",
        state === "processing" && "bg-amber-500/15 text-amber-400",
        state === "idle" &&
          "text-(--muted-foreground) hover:text-indigo-400 hover:bg-indigo-500/10",
        className,
      )}
      disabled={disabled || state === "processing"}
      onClick={handleClick}
      title={
        state === "listening"
          ? "Click to stop listening"
          : state === "processing"
            ? "Transcribing..."
            : "Click to start voice input"
      }
    >
      {state === "processing" ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : state === "listening" ? (
        <div className="flex items-center gap-1">
          <MicOff className="w-3 h-3" />
          <div className="flex items-center gap-0.5">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="waveform-bar w-0.5 bg-red-400 rounded-full"
                style={{ minHeight: "4px" }}
              />
            ))}
          </div>
        </div>
      ) : (
        <Mic className="w-4 h-4" />
      )}
    </Button>
  );
}
