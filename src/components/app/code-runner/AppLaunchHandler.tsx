import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { cphHashFrom } from "./bookmarklet";

type LaunchQueue = { setConsumer(cb: (params: { targetURL?: string }) => void): void };

/**
 * The installed app stays one window, like VS Code: a problem sent from the
 * bookmark while it's open arrives here (manifest launch_handler "focus-existing")
 * and opens in the code editor, whatever page the window was on.
 */
export const AppLaunchHandler = () => {
    const navigate = useNavigate();
    useEffect(() => {
        (window as { launchQueue?: LaunchQueue }).launchQueue?.setConsumer(({ targetURL }) => {
            const hash = targetURL && cphHashFrom(targetURL);
            if (hash) navigate(`/code${hash}`);
        });
    }, [navigate]);
    return null;
};
