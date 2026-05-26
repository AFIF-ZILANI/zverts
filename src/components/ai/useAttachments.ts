import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type AttachmentDraft = {
  id: string;
  name: string;
  mime: string;
  size: number;
  path: string; // storage path in ai-uploads bucket
  previewUrl?: string; // local object URL for images
  uploading: boolean;
};

const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export function useAttachments(userId: string, isPaid: boolean) {
  const [items, setItems] = useState<AttachmentDraft[]>([]);

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!isPaid) {
        toast.error("File uploads are for paid users only.");
        return;
      }
      const incoming = Array.from(files);
      if (items.length + incoming.length > MAX_FILES) {
        toast.error(`Up to ${MAX_FILES} files per message.`);
        return;
      }
      for (const file of incoming) {
        if (!ALLOWED.includes(file.type)) {
          toast.error(`Unsupported type: ${file.name}`);
          continue;
        }
        if (file.size > MAX_BYTES) {
          toast.error(`${file.name} exceeds 10MB.`);
          continue;
        }
        const id = crypto.randomUUID();
        const ext = file.name.split(".").pop() || "bin";
        const path = `${userId}/${id}.${ext}`;
        const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
        setItems((prev) => [
          ...prev,
          { id, name: file.name, mime: file.type, size: file.size, path, previewUrl, uploading: true },
        ]);
        const { error } = await supabase.storage.from("ai-uploads").upload(path, file, {
          contentType: file.type,
          upsert: false,
        });
        if (error) {
          toast.error(`Upload failed: ${file.name}`);
          setItems((prev) => prev.filter((x) => x.id !== id));
        } else {
          setItems((prev) => prev.map((x) => (x.id === id ? { ...x, uploading: false } : x)));
        }
      }
    },
    [items.length, userId, isPaid],
  );

  const remove = useCallback(async (id: string) => {
    const target = items.find((x) => x.id === id);
    setItems((prev) => prev.filter((x) => x.id !== id));
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
    if (target) await supabase.storage.from("ai-uploads").remove([target.path]);
  }, [items]);

  const clear = useCallback(() => {
    items.forEach((x) => x.previewUrl && URL.revokeObjectURL(x.previewUrl));
    setItems([]);
  }, [items]);

  return { items, addFiles, remove, clear };
}
