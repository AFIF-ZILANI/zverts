import { useEffect, useMemo, useRef, useState } from "react";
import { RequireRole } from "@/components/RequireRole";
import { AdminShell } from "@/components/admin/AdminShell";
import { EmptyState, ErrorNote, Initial, Panel } from "@/components/admin/parts";
import { timeAgo } from "@/components/admin/timeAgo";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, Download, MessageCircle, Phone, PhoneCall, Search } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Row = Database["public"]["Functions"]["admin_list_support_contacts"]["Returns"][number];

// Excel and Sheets run a cell that starts with = + - or @ as a formula; names
// and emails are typed by students, so make those plain text.
const csvText = (v: string) => (/^[=+\-@]/.test(v) ? `'${v}` : v);

// Some numbers were saved with the trunk 0 (+880 01…) or the country code
// typed again (+880 8801…); drop those so the number dials and opens WhatsApp.
const fullPhone = (r: Row) => {
    const cc = r.country_code ?? "";
    const ccDigits = cc.replace(/\D/g, "");
    let n = r.phone_number.replace(/^\+/, "");
    if (ccDigits && n.length > 10 && n.startsWith(ccDigits)) n = n.slice(ccDigits.length);
    if (cc) n = n.replace(/^0+/, "");
    return `${cc}${n}`;
};
const fmtDate = (iso: string | null) =>
    iso
        ? new Date(iso).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
          })
        : "—";

const SupportContactsInner = () => {
    const [rows, setRows] = useState<Row[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    // The search last run with Search/Enter; the 15 s refresh repeats it.
    const applied = useRef("");

    const load = async (term = applied.current) => {
        applied.current = term;
        const { data, error } = await supabase.rpc("admin_list_support_contacts", {
            _search: term.trim() || undefined,
            _limit: 1000,
        });
        if (error) {
            setError(error.message);
            setRows((r) => r ?? []);
            return;
        }
        setError(null);
        setRows(data ?? []);
    };

    useEffect(() => {
        void load();
        const interval = setInterval(() => void load(), 15000);
        return () => clearInterval(interval);
    }, []);

    const filtered = useMemo(
        () =>
            (rows ?? []).filter((r) => {
                if (from && new Date(r.submitted_at) < new Date(from)) return false;
                if (to && new Date(r.submitted_at) > new Date(to + "T23:59:59")) return false;
                return true;
            }),
        [rows, from, to],
    );

    const copy = (text: string) => {
        void navigator.clipboard.writeText(text);
        toast.success("Number copied");
    };

    const exportCSV = () => {
        const headers = [
            "Name",
            "Email",
            "Phone",
            "WhatsApp",
            "Joined",
            "Last active",
            "Premium",
            "Submitted",
        ];
        const lines = [headers.join(",")];
        filtered.forEach((r) => {
            const cells = [
                csvText(r.name),
                csvText(r.email ?? ""),
                fullPhone(r),
                r.whatsapp_enabled ? "yes" : "no",
                r.joined_at ?? "",
                r.last_active ?? "",
                r.is_paid_user ? "yes" : "no",
                r.submitted_at,
            ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
            lines.push(cells.join(","));
        });
        const blob = new Blob([lines.join("\n")], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `support-contacts-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const empty = error
        ? "Couldn't load contacts."
        : rows?.length
          ? "No contacts match these filters."
          : "No contacts yet. Numbers appear here when learners submit the support pop-up.";

    return (
        <AdminShell
            title="Support contacts"
            description={
                rows
                    ? `${filtered.length} of ${rows.length} learners shared a number for support.`
                    : "Phone numbers learners shared for support."
            }
            actions={
                <Button
                    onClick={exportCSV}
                    variant="outline"
                    className="gap-2 rounded-full"
                    disabled={!filtered.length}
                >
                    <Download className="h-4 w-4" /> Export CSV
                </Button>
            }
        >
            <form
                className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center"
                onSubmit={(e) => {
                    e.preventDefault();
                    void load(search);
                }}
            >
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Search name, email, phone…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="rounded-full pl-9"
                    />
                </div>
                <div className="grid grid-cols-2 gap-2 sm:contents">
                    <Input
                        type="date"
                        aria-label="From"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                        className="rounded-full sm:w-40"
                    />
                    <Input
                        type="date"
                        aria-label="To"
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                        className="rounded-full sm:w-40"
                    />
                </div>
                <Button type="submit" className="rounded-full">
                    Search
                </Button>
            </form>

            {error && <ErrorNote>Couldn't load contacts: {error}</ErrorNote>}

            <Panel>
                {!rows ? (
                    <div className="space-y-3 p-4 sm:p-5">
                        {[0, 1, 2, 3].map((i) => (
                            <Skeleton key={i} className="h-14 rounded-2xl" />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <EmptyState icon={Phone}>{empty}</EmptyState>
                ) : (
                    <>
                        {/* Laptops and up: a table. */}
                        <div className="hidden overflow-x-auto lg:block">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-border/60 text-left text-xs font-medium text-muted-foreground">
                                        <th className="px-5 py-2.5 font-medium">Learner</th>
                                        <th className="px-3 py-2.5 font-medium">Phone</th>
                                        <th className="px-3 py-2.5 font-medium">Plan</th>
                                        <th className="px-3 py-2.5 font-medium">Joined</th>
                                        <th className="px-3 py-2.5 font-medium">Submitted</th>
                                        <th className="px-5 py-2.5 text-right font-medium">
                                            Contact
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/40">
                                    {filtered.map((r) => (
                                        <tr key={r.id} className="hover:bg-foreground/[0.02]">
                                            <td className="px-5 py-3">
                                                <div className="flex items-center gap-3">
                                                    <Initial
                                                        id={r.user_id}
                                                        name={r.name}
                                                        email={r.email}
                                                        className="h-8 w-8 text-xs"
                                                    />
                                                    <div className="min-w-0">
                                                        <div className="max-w-[220px] truncate font-medium">
                                                            {r.name}
                                                        </div>
                                                        <div className="max-w-[220px] truncate text-xs text-muted-foreground">
                                                            {r.email || "—"}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 font-mono text-xs">
                                                <span className="inline-flex items-center gap-1.5">
                                                    {fullPhone(r)}
                                                    {r.whatsapp_enabled && (
                                                        <MessageCircle
                                                            className="h-3.5 w-3.5 text-primary"
                                                            aria-label="On WhatsApp"
                                                        />
                                                    )}
                                                </span>
                                            </td>
                                            <td className="px-3 py-3">
                                                <Plan paid={r.is_paid_user} />
                                            </td>
                                            <td className="px-3 py-3 text-xs text-muted-foreground">
                                                {fmtDate(r.joined_at)}
                                            </td>
                                            <td
                                                className="px-3 py-3 text-xs text-muted-foreground"
                                                title={new Date(r.submitted_at).toLocaleString()}
                                            >
                                                {timeAgo(r.submitted_at)}
                                            </td>
                                            <td className="px-5 py-3">
                                                <ContactActions r={r} onCopy={copy} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Phones and small tablets: cards with one-tap call and WhatsApp. */}
                        <ul className="divide-y divide-border/40 lg:hidden">
                            {filtered.map((r) => (
                                <li key={r.id} className="p-4">
                                    <div className="flex items-center gap-3">
                                        <Initial id={r.user_id} name={r.name} email={r.email} />
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate font-medium">{r.name}</div>
                                            <div className="truncate text-xs text-muted-foreground">
                                                {r.email || "—"}
                                            </div>
                                        </div>
                                        <Plan paid={r.is_paid_user} />
                                    </div>
                                    <div className="mt-3 flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="font-mono text-sm">{fullPhone(r)}</div>
                                            <div className="text-xs text-muted-foreground">
                                                Submitted {timeAgo(r.submitted_at).toLowerCase()}
                                            </div>
                                        </div>
                                        <ContactActions r={r} onCopy={copy} />
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </Panel>
        </AdminShell>
    );
};

const ContactActions = ({ r, onCopy }: { r: Row; onCopy: (t: string) => void }) => {
    const phone = fullPhone(r);
    const digits = phone.replace(/[^\d]/g, "");
    return (
        <div className="flex justify-end gap-1.5">
            <a
                href={`tel:${phone}`}
                aria-label={`Call ${r.name}`}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border hover:bg-foreground/5"
            >
                <PhoneCall className="h-4 w-4" />
            </a>
            {r.whatsapp_enabled && (
                <a
                    href={`https://wa.me/${digits}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`WhatsApp ${r.name}`}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/40 text-primary hover:bg-primary/10"
                >
                    <MessageCircle className="h-4 w-4" />
                </a>
            )}
            <button
                type="button"
                onClick={() => onCopy(phone)}
                aria-label={`Copy ${r.name}'s number`}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border hover:bg-foreground/5"
            >
                <Copy className="h-4 w-4" />
            </button>
        </div>
    );
};

const Plan = ({ paid }: { paid: boolean }) => (
    <span
        className={
            paid
                ? "rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary"
                : "rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
        }
    >
        {paid ? "Paid" : "Free"}
    </span>
);

const SupportContacts = () => (
    <RequireRole role="admin">
        <SupportContactsInner />
    </RequireRole>
);
export default SupportContacts;
