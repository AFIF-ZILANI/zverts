import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type TranscriptStatus = "queued" | "processing" | "ready" | "failed";
export type Segment = { start: number; end: number; text: string };
export type Transcript = {
  module_id: string;
  status: TranscriptStatus;
  text: string | null;
  segments: Segment[] | null;
  model: string | null;
  error: string | null;
};

export function useTranscript(moduleId: string | null) {
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [loading, setLoading] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const load = useCallback(async () => {
    if (!moduleId) { setTranscript(null); return; }
    setLoading(true);
    const { data } = await supabase
      .from("transcripts")
      .select("module_id,status,text,segments,model,error")
      .eq("module_id", moduleId)
      .maybeSingle();
    setTranscript((data as unknown as Transcript) ?? null);
    setLoading(false);
  }, [moduleId]);

  useEffect(() => { load(); }, [load]);

  // Realtime updates so the panel flips to "ready" when phase-2 worker finishes
  useEffect(() => {
    if (!moduleId) return;
    const ch = supabase.channel(`transcript:${moduleId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "transcripts", filter: `module_id=eq.${moduleId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [moduleId, load]);

  const requestTranscription = useCallback(async () => {
    if (!moduleId) return;
    setRequesting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const url = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/transcribe-module`;
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ module_id: moduleId }),
      });
      await load();
    } finally {
      setRequesting(false);
    }
  }, [moduleId, load]);

  return { transcript, loading, requesting, refresh: load, requestTranscription };
}
