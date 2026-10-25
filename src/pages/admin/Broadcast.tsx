import { useState } from "react";
import { RequireRole } from "@/components/RequireRole";
import { AdminShell } from "@/components/admin/AdminShell";
import { Panel, Segmented } from "@/components/admin/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Bell, Loader2, Send } from "lucide-react";

type Priority = "normal" | "high" | "critical";
const PRIORITY_NOTE: Record<Priority, string> = {
    normal: "In the bell, and as a browser notification where learners allowed it.",
    high: "Same as normal, marked high priority.",
    critical: "Bypasses mute and quiet hours; the browser notification stays until dismissed.",
};

const BroadcastInner = () => {
    const [title, setTitle] = useState("");
    const [body, setBody] = useState("");
    const [link, setLink] = useState("");
    const [priority, setPriority] = useState<Priority>("high");
    const [sending, setSending] = useState(false);
    const [confirming, setConfirming] = useState(false);

    const ready = title.trim() && body.trim();
    const badLink = link.trim() !== "" && !link.trim().startsWith("/");

    const send = async () => {
        setSending(true);
        const { data, error } = await supabase.rpc("admin_broadcast_notification", {
            _title: title.trim(),
            _body: body.trim(),
            _deep_link: link.trim() || undefined,
            _priority: priority,
        });
        setSending(false);
        setConfirming(false);
        if (error) {
            toast.error(error.message);
            return;
        }
        toast.success(`Sent to ${(data as Record<string, unknown>)?.count ?? 0} learners`);
        setTitle("");
        setBody("");
        setLink("");
    };

    return (
        <AdminShell
            title="Broadcast"
            description="Send one notification to every learner. It lands in their bell right away."
        >
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] lg:items-start">
                <Panel>
                    <form
                        className="space-y-5 p-4 sm:p-6"
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (ready && !badLink) setConfirming(true);
                        }}
                    >
                        <div className="space-y-1.5">
                            <div className="flex items-baseline justify-between">
                                <Label htmlFor="title">Title</Label>
                                <span className="text-xs tabular-nums text-muted-foreground">
                                    {title.length}/120
                                </span>
                            </div>
                            <Input
                                id="title"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                maxLength={120}
                                placeholder="New feature live!"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <div className="flex items-baseline justify-between">
                                <Label htmlFor="body">Message</Label>
                                <span className="text-xs tabular-nums text-muted-foreground">
                                    {body.length}/500
                                </span>
                            </div>
                            <Textarea
                                id="body"
                                value={body}
                                onChange={(e) => setBody(e.target.value)}
                                maxLength={500}
                                rows={5}
                                placeholder="Tell learners what's new…"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="link">
                                Opens{" "}
                                <span className="font-normal text-muted-foreground">
                                    (optional)
                                </span>
                            </Label>
                            <Input
                                id="link"
                                value={link}
                                onChange={(e) => setLink(e.target.value)}
                                placeholder="/dashboard or /buy"
                                className="font-mono"
                                aria-invalid={badLink}
                            />
                            <p
                                className={
                                    badLink
                                        ? "text-xs text-destructive"
                                        : "text-xs text-muted-foreground"
                                }
                            >
                                {badLink
                                    ? "Use a page path that starts with /"
                                    : "The page learners land on when they tap it."}
                            </p>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Priority</Label>
                            <Segmented<Priority>
                                value={priority}
                                onChange={setPriority}
                                className="flex w-full"
                                options={(["normal", "high", "critical"] as const).map((p) => ({
                                    value: p,
                                    label: p,
                                }))}
                            />
                            <p className="text-xs text-muted-foreground">
                                {PRIORITY_NOTE[priority]}
                            </p>
                        </div>
                        <Button
                            type="submit"
                            disabled={!ready || badLink || sending}
                            className="w-full rounded-full"
                        >
                            <Send className="mr-2 h-4 w-4" /> Send to all learners
                        </Button>
                    </form>
                </Panel>

                {/* What learners will see, as it appears in the bell. */}
                <div className="space-y-2 lg:sticky lg:top-[calc(var(--app-header-h)+1rem)]">
                    <div className="px-1 text-sm font-medium text-muted-foreground">Preview</div>
                    <Panel>
                        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3 text-sm font-semibold">
                            <Bell className="h-4 w-4" /> Notifications
                        </div>
                        <div className="flex gap-3 bg-primary/5 px-4 py-3">
                            <div className="mt-0.5 text-xl leading-none">✅</div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                    <p className="truncate text-sm font-semibold leading-snug">
                                        {title.trim() || (
                                            <span className="text-muted-foreground">
                                                Your title
                                            </span>
                                        )}
                                    </p>
                                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                                </div>
                                <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-xs text-muted-foreground">
                                    {body.trim() || "Your message appears here."}
                                </p>
                                <p className="mt-1 text-[10px] text-muted-foreground/70">
                                    just now
                                </p>
                            </div>
                        </div>
                    </Panel>
                    <p className="px-1 text-xs text-muted-foreground">
                        The bell shows two lines of the message; learners see the rest when they
                        open it.
                    </p>
                </div>
            </div>

            <AlertDialog open={confirming} onOpenChange={(o) => !sending && setConfirming(o)}>
                <AlertDialogContent className="w-[calc(100%-2rem)] rounded-3xl sm:max-w-md">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Send to every learner?</AlertDialogTitle>
                        <AlertDialogDescription>
                            “{title.trim()}” goes out now with {priority} priority. It can't be
                            unsent.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={sending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={sending}
                            onClick={(e) => {
                                e.preventDefault();
                                void send();
                            }}
                        >
                            {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Send now
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AdminShell>
    );
};

const Broadcast = () => (
    <RequireRole role="admin">
        <BroadcastInner />
    </RequireRole>
);
export default Broadcast;
