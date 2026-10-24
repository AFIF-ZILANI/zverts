import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Pages that change the photo or name fire this so the header updates at once.
const EVENT = "zverts:profile-updated";
type ProfileBits = { name?: string | null; avatar_url?: string | null };

export const announceProfileUpdate = (bits: ProfileBits) =>
    window.dispatchEvent(new CustomEvent<ProfileBits>(EVENT, { detail: bits }));

/**
 * The signed-in user's name and photo for the header and menu. The photo
 * uploaded in ZverTs (profiles.avatar_url) wins; the Google sign-in photo is
 * the fallback.
 */
export function useMyProfile(user: User | null) {
    const [profile, setProfile] = useState<ProfileBits>({});
    // The user object is replaced on every token refresh; key on the id.
    const uid = user?.id;

    useEffect(() => {
        setProfile({});
        if (!uid) return;
        let cancelled = false;
        supabase
            .from("profiles")
            .select("name,avatar_url")
            .eq("id", uid)
            .maybeSingle()
            .then(({ data }) => {
                if (!cancelled && data) setProfile(data);
            });
        const onUpdate = (e: Event) =>
            setProfile((p) => ({ ...p, ...(e as CustomEvent<ProfileBits>).detail }));
        window.addEventListener(EVENT, onUpdate);
        return () => {
            cancelled = true;
            window.removeEventListener(EVENT, onUpdate);
        };
    }, [uid]);

    const meta = user?.user_metadata ?? {};
    return {
        avatarUrl:
            profile.avatar_url ||
            (meta.avatar_url as string | undefined) ||
            (meta.picture as string | undefined) ||
            undefined,
        name:
            profile.name?.trim() ||
            (meta.full_name as string | undefined) ||
            (meta.name as string | undefined) ||
            user?.email?.split("@")[0] ||
            "You",
    };
}
