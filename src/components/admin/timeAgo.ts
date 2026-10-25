/** "3 min ago", "5 h ago", then a date. */
export const timeAgo = (iso: string | null | undefined) => {
    if (!iso) return "Never";
    const s = (Date.now() - Date.parse(iso)) / 1000;
    if (s < 60) return "Just now";
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
    return new Date(iso).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
};
