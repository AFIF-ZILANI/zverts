import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Clock, ListVideo, Play } from "lucide-react";

interface Video {
    videoId: string;
    title: string;
    thumbnail: string;
    duration: number;
}
interface Preview {
    playlist: { title: string; description: string; channel: string; thumbnail: string | null };
    videos: Video[];
    total: number;
}

const fmt = (s: number) => {
    if (!s) return "0:00";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${m}:${String(sec).padStart(2, "0")}`;
};

const fmtTotal = (s: number) => {
    if (s <= 0) return "0 min";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return m > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${h}h`;
    return `${m} min`;
};

export const PlaylistPreview = ({
    open,
    onClose,
    preview,
    onConfirm,
    importing,
}: {
    open: boolean;
    onClose: () => void;
    preview: Preview | null;
    onConfirm: () => void;
    importing: boolean;
}) => {
    if (!preview) return null;
    const totalSecs = preview.videos.reduce((s, v) => s + v.duration, 0);
    const isSingle = preview.total === 1;

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="font-display text-xl">
                        {isSingle ? "Video Preview" : "Playlist Preview"}
                    </DialogTitle>
                </DialogHeader>
                <div className="flex gap-4 py-2 border-b border-border">
                    {preview.playlist.thumbnail && (
                        <div className="relative shrink-0">
                            <img
                                src={preview.playlist.thumbnail}
                                alt=""
                                className="w-32 aspect-video object-cover rounded-lg border border-border"
                            />
                            {!isSingle && (
                                <div className="absolute inset-0 bg-black/20 rounded-lg flex items-center justify-center">
                                    <ListVideo className="h-6 w-6 text-white drop-shadow-lg" />
                                </div>
                            )}
                        </div>
                    )}
                    <div className="flex-1 min-w-0">
                        <div className="font-display text-lg leading-tight line-clamp-2">
                            {preview.playlist.title}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono mt-1">
                            {preview.playlist.channel}
                        </div>
                        <div className="flex gap-3 text-xs font-mono text-muted-foreground mt-2">
                            <span className="flex items-center gap-1">
                                {isSingle ? <Play className="h-3 w-3" /> : <ListVideo className="h-3 w-3" />}
                                {preview.total} video{preview.total !== 1 ? "s" : ""}
                            </span>
                            <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {fmtTotal(totalSecs)}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto py-3 space-y-1.5 -mx-6 px-6">
                    {preview.videos.map((v, i) => (
                        <div
                            key={v.videoId}
                            className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50"
                        >
                            <span className="text-xs font-mono text-muted-foreground w-6 text-right">
                                {i + 1}
                            </span>
                            <div className="relative shrink-0">
                                {v.thumbnail ? (
                                    <img
                                        src={v.thumbnail}
                                        alt=""
                                        className="w-20 aspect-video object-cover rounded border border-border"
                                        loading="lazy"
                                    />
                                ) : (
                                    <div className="w-20 aspect-video rounded border border-border bg-muted flex items-center justify-center">
                                        <Play className="h-4 w-4 text-muted-foreground/40" />
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm leading-tight line-clamp-2">{v.title}</div>
                                <div className="text-[10px] font-mono text-muted-foreground mt-0.5 flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {fmt(v.duration)}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="flex justify-between items-center gap-2 pt-3 border-t border-border">
                    <p className="text-xs text-muted-foreground font-mono">
                        {isSingle
                            ? "This will create a course with 1 module."
                            : `This will create a course with ${preview.total} modules.`}
                    </p>
                    <div className="flex gap-2">
                        <Button variant="ghost" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button
                            onClick={onConfirm}
                            disabled={importing}
                            className="bg-gradient-lime text-primary-foreground hover:opacity-90 shadow-glow"
                        >
                            {importing ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Creating course…
                                </>
                            ) : (
                                <>
                                    <Plus className="h-4 w-4 mr-2" />
                                    Create course
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
