"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useTheme } from "@/components/providers/theme-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  User,
  Lock,
  Sun,
  Moon,
  Key,
  Mic,
  AlertTriangle,
  Save,
  Eye,
  EyeOff,
} from "lucide-react";
import { Topbar } from "@/components/dashboard/topbar";

interface UserData {
  id: string;
  name: string;
  email: string;
  theme: string;
  mistralApiKey: string | null;
  elevenLabsApiKey: string | null;
  elevenLabsVoiceId: string | null;
}

const ELEVENLABS_VOICES = [
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel (Default)" },
  { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni" },
  { id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh" },
  { id: "VR6AewLTigWG4xSOukaG", name: "Arnold" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam" },
  { id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam" },
];

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden"
    >
      <div className="flex items-center gap-2.5 px-6 py-4 border-b border-[var(--border)]">
        <div className="text-indigo-400">{icon}</div>
        <h2 className="font-semibold text-[var(--foreground)]">{title}</h2>
      </div>
      <div className="p-6 space-y-4">{children}</div>
    </motion.div>
  );
}

function PasswordInput({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm text-[var(--foreground)]">{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="bg-[var(--background)] border-[var(--border)] rounded-xl pr-10"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

export function SettingsClient({ user }: { user: UserData }) {
  const { theme, toggleTheme: toggle } = useTheme();

  // Profile
  const [name, setName] = useState(user.name);

  // Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // API Keys
  const [mistralKey, setMistralKey] = useState(user.mistralApiKey || "");
  const [elevenLabsKey, setElevenLabsKey] = useState(user.elevenLabsApiKey || "");
  const [voiceId, setVoiceId] = useState(user.elevenLabsVoiceId || "21m00Tcm4TlvDq8ikWAM");

  const [saving, setSaving] = useState<string | null>(null);

  const save = async (section: string, payload: Record<string, unknown>) => {
    setSaving(section);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success("Saved!");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(null);
    }
  };

  const saveProfile = () => {
    if (!name.trim()) return toast.error("Name cannot be empty");
    save("profile", { name });
  };

  const savePassword = () => {
    if (!currentPassword || !newPassword) return toast.error("Fill in all password fields");
    if (newPassword.length < 6) return toast.error("New password must be at least 6 characters");
    if (newPassword !== confirmPassword) return toast.error("Passwords don't match");
    save("password", { currentPassword, newPassword });
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const saveApiKeys = () => {
    const payload: Record<string, string> = { elevenLabsVoiceId: voiceId };
    // Only send keys that were actually changed (not masked dots)
    if (!mistralKey.includes("•")) payload.mistralApiKey = mistralKey;
    if (!elevenLabsKey.includes("•")) payload.elevenLabsApiKey = elevenLabsKey;
    save("apikeys", payload);
  };

  const deleteAccount = async () => {
    if (!confirm("Are you sure you want to delete your account? This cannot be undone.")) return;
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      await fetch(`/api/settings`, { method: "DELETE" });
      window.location.href = "/";
    } catch {
      toast.error("Failed to delete account");
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Topbar title="Settings" subtitle="Manage your profile, API keys, and preferences" />
      <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-6 space-y-5">

      {/* Profile */}
      <Section title="Profile" icon={<User className="w-4 h-4" />}>
        <div className="space-y-1.5">
          <Label className="text-sm text-[var(--foreground)]">Display Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-[var(--background)] border-[var(--border)] rounded-xl"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm text-[var(--foreground)]">Email</Label>
          <Input
            value={user.email}
            disabled
            className="bg-[var(--background)] border-[var(--border)] rounded-xl opacity-50 cursor-not-allowed"
          />
          <p className="text-xs text-[var(--muted-foreground)]">Email cannot be changed — it&apos;s your account identifier.</p>
        </div>
        <Button
          onClick={saveProfile}
          disabled={saving === "profile"}
          className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl"
        >
          {saving === "profile" ? (
            <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />Saving...</>
          ) : (
            <><Save className="w-4 h-4 mr-2" />Save Profile</>
          )}
        </Button>
      </Section>

      {/* Password */}
      <Section title="Change Password" icon={<Lock className="w-4 h-4" />}>
        <PasswordInput id="current" label="Current Password" value={currentPassword} onChange={setCurrentPassword} />
        <PasswordInput id="new" label="New Password" value={newPassword} onChange={setNewPassword} />
        <PasswordInput id="confirm" label="Confirm New Password" value={confirmPassword} onChange={setConfirmPassword} />
        <Button
          onClick={savePassword}
          disabled={saving === "password"}
          className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl"
        >
          {saving === "password" ? (
            <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />Saving...</>
          ) : (
            <><Save className="w-4 h-4 mr-2" />Update Password</>
          )}
        </Button>
      </Section>

      {/* Appearance */}
      <Section title="Appearance" icon={theme === "dark" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--foreground)]">Theme</p>
            <p className="text-xs text-[var(--muted-foreground)]">Currently using {theme} mode</p>
          </div>
          <button
            onClick={toggle}
            className={`relative w-14 h-7 rounded-full transition-all duration-300 focus:outline-none ${
              theme === "dark" ? "bg-indigo-600" : "bg-slate-300"
            }`}
          >
            <span
              className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform duration-300 flex items-center justify-center ${
                theme === "dark" ? "translate-x-7" : "translate-x-0"
              }`}
            >
              {theme === "dark" ? <Moon className="w-2.5 h-2.5 text-indigo-600" /> : <Sun className="w-2.5 h-2.5 text-amber-500" />}
            </span>
          </button>
        </div>
      </Section>

      {/* API Keys */}
      <Section title="API Keys" icon={<Key className="w-4 h-4" />}>
        <p className="text-xs text-[var(--muted-foreground)] -mt-2">
          Keys are stored securely on your local machine. They are never shared.
        </p>
        <div className="space-y-1.5">
          <Label className="text-sm text-[var(--foreground)]">Mistral API Key</Label>
          <Input
            value={mistralKey}
            onChange={(e) => setMistralKey(e.target.value)}
            placeholder="Enter your Mistral API key"
            type="password"
            className="bg-[var(--background)] border-[var(--border)] rounded-xl font-mono text-sm"
          />
          <p className="text-xs text-[var(--muted-foreground)]">
            Required for running agents via the FastAPI backend.
          </p>
        </div>

        <div className="space-y-1.5 pt-2 border-t border-[var(--border)]">
          <div className="flex items-center gap-1.5 mb-2">
            <Mic className="w-3.5 h-3.5 text-indigo-400" />
            <Label className="text-sm text-[var(--foreground)]">ElevenLabs API Key</Label>
          </div>
          <Input
            value={elevenLabsKey}
            onChange={(e) => setElevenLabsKey(e.target.value)}
            placeholder="Enter your ElevenLabs API key"
            type="password"
            className="bg-[var(--background)] border-[var(--border)] rounded-xl font-mono text-sm"
          />
          <p className="text-xs text-[var(--muted-foreground)]">
            Required for voice input (STT) and voice output (TTS) in the playground and agent builder.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm text-[var(--foreground)]">Voice</Label>
          <select
            value={voiceId}
            onChange={(e) => setVoiceId(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm text-[var(--foreground)] focus:outline-none focus:border-indigo-500"
          >
            {ELEVENLABS_VOICES.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
          <p className="text-xs text-[var(--muted-foreground)]">The ElevenLabs voice used for agent responses.</p>
        </div>

        <Button
          onClick={saveApiKeys}
          disabled={saving === "apikeys"}
          className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl"
        >
          {saving === "apikeys" ? (
            <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />Saving...</>
          ) : (
            <><Save className="w-4 h-4 mr-2" />Save Keys</>
          )}
        </Button>
      </Section>

      {/* Danger Zone */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-red-500/5 border border-red-500/20 rounded-2xl overflow-hidden"
      >
        <div className="flex items-center gap-2.5 px-6 py-4 border-b border-red-500/20">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <h2 className="font-semibold text-red-400">Danger Zone</h2>
        </div>
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--foreground)]">Delete Account</p>
              <p className="text-xs text-[var(--muted-foreground)]">
                Permanently delete your account and all agents. This cannot be undone.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={deleteAccount}
              className="border-red-500/40 text-red-400 hover:bg-red-500/10 hover:border-red-500 rounded-xl flex-shrink-0"
            >
              Delete Account
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
    </div>
    </div>
  );
}
