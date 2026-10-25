// Icons for the phone tab bar: a 24px outline set, each with a filled
// variant shown on the active tab (the iOS / Material convention).
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

export type TabIconProps = { active?: boolean; className?: string };
export type TabIcon = ComponentType<TabIconProps>;

const Svg = ({ active, className, children }: TabIconProps & { children: React.ReactNode }) => (
    <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={cn("h-6 w-6", className)}
        fill="none"
        stroke="currentColor"
        strokeWidth={active ? 2 : 1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        {children}
    </svg>
);

export const HomeIcon: TabIcon = ({ active, className }) => (
    <Svg active={active} className={className}>
        {active ? (
            <path
                fill="currentColor"
                stroke="none"
                d="M12.64 2.83a1 1 0 0 0-1.28 0l-8 6.67a1 1 0 0 0-.36.77V20a1.5 1.5 0 0 0 1.5 1.5H9v-6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6h4.5A1.5 1.5 0 0 0 21 20v-9.73a1 1 0 0 0-.36-.77l-8-6.67Z"
            />
        ) : (
            <path d="M3.75 10.4 12 3.6l8.25 6.8V20a1 1 0 0 1-1 1H15v-5.25a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1V21H4.75a1 1 0 0 1-1-1Z" />
        )}
    </Svg>
);

export const CoursesIcon: TabIcon = ({ active, className }) => (
    <Svg active={active} className={className}>
        {active ? (
            <>
                <path
                    fill="currentColor"
                    stroke="none"
                    d="M11 6.15V20c-1.85-.95-4-1.45-6.5-1.45A1.5 1.5 0 0 1 3 17.05V5.5A1.5 1.5 0 0 1 4.5 4c2.65 0 4.8.7 6.5 2.15Z"
                />
                <path
                    fill="currentColor"
                    stroke="none"
                    d="M13 6.15C14.7 4.7 16.85 4 19.5 4A1.5 1.5 0 0 1 21 5.5v11.55a1.5 1.5 0 0 1-1.5 1.5c-2.5 0-4.65.5-6.5 1.45Z"
                />
            </>
        ) : (
            <>
                <path d="M12 6.6C10.3 5.25 7.95 4.6 4.75 4.6a1 1 0 0 0-1 1v11.55a1 1 0 0 0 1 1c3.05 0 5.4.65 7.25 1.95 1.85-1.3 4.2-1.95 7.25-1.95a1 1 0 0 0 1-1V5.6a1 1 0 0 0-1-1c-3.2 0-5.55.65-7.25 2Z" />
                <path d="M12 6.6v13.5" />
            </>
        )}
    </Svg>
);

export const CodeIcon: TabIcon = ({ active, className }) => (
    <Svg active={active} className={className}>
        {active ? (
            <>
                <rect
                    x="2.75"
                    y="3.75"
                    width="18.5"
                    height="16.5"
                    rx="4"
                    fill="currentColor"
                    stroke="none"
                />
                <g className="stroke-background" strokeWidth={2}>
                    <path d="m9.25 9.25-2.75 2.75 2.75 2.75" />
                    <path d="m14.75 9.25 2.75 2.75-2.75 2.75" />
                    <path d="m12.9 8.5-1.8 7" />
                </g>
            </>
        ) : (
            <>
                <rect x="3" y="4" width="18" height="16" rx="3.5" />
                <path d="m9.25 9.25-2.75 2.75 2.75 2.75" />
                <path d="m14.75 9.25 2.75 2.75-2.75 2.75" />
                <path d="m12.9 8.5-1.8 7" />
            </>
        )}
    </Svg>
);

export const GrowthIcon: TabIcon = ({ active, className }) => (
    <Svg active={active} className={className}>
        <path d="M3.75 3.75v15.5a1 1 0 0 0 1 1h15.5" />
        {active && (
            <path
                fill="currentColor"
                stroke="none"
                opacity={0.3}
                d="M7.5 16.5 11 12.5l3 2.75 5.5-6.25v8.5a1 1 0 0 1-1 1h-11Z"
            />
        )}
        <path d="m7.5 15 3.5-3.75 3 2.75 5.25-6" />
        <path d="M15.75 8h3.5v3.5" />
    </Svg>
);

export const MenuIcon: TabIcon = ({ active, className }) => (
    <Svg active={active} className={className}>
        {active ? (
            <>
                <path d="M6 6l12 12" />
                <path d="M18 6 6 18" />
            </>
        ) : (
            <>
                <path d="M4 7h16" />
                <path d="M4 12h16" />
                <path d="M4 17h10" />
            </>
        )}
    </Svg>
);

const GEAR =
    "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z";

export const SettingsIcon: TabIcon = ({ active, className }) => (
    <Svg active={active} className={className}>
        {active ? (
            // Filled gear with the centre cut out.
            <path
                fill="currentColor"
                stroke="none"
                fillRule="evenodd"
                d={`${GEAR} M15 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0z`}
            />
        ) : (
            <>
                <path d={GEAR} />
                <circle cx="12" cy="12" r="3" />
            </>
        )}
    </Svg>
);

export const WalletIcon: TabIcon = ({ active, className }) => (
    <Svg active={active} className={className}>
        {active ? (
            <>
                <path
                    fill="currentColor"
                    stroke="none"
                    d="M5.5 4A2.5 2.5 0 0 0 3 6.5v11A2.5 2.5 0 0 0 5.5 20h13a2.5 2.5 0 0 0 2.5-2.5V15h-3.5a3 3 0 0 1 0-6H21V8.5A2.5 2.5 0 0 0 18.5 6H6a1 1 0 0 1 0-2Z"
                />
                <path fill="currentColor" stroke="none" d="M17.5 10.5a1.5 1.5 0 0 0 0 3H21v-3Z" />
            </>
        ) : (
            <>
                <path d="M19.25 7V6a2 2 0 0 0-2-2H6a2.25 2.25 0 0 0 0 4.5h13.25a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1H5.75a2 2 0 0 1-2-2V6.25" />
                <path d="M20.25 11.5H17.5a1.5 1.5 0 0 0 0 3h2.75" />
            </>
        )}
    </Svg>
);

export const ShieldIcon: TabIcon = ({ active, className }) => (
    <Svg active={active} className={className}>
        <path
            fill={active ? "currentColor" : "none"}
            stroke={active ? "none" : undefined}
            d="M12 2.9 4.5 5.6a1 1 0 0 0-.65.94V11c0 4.9 3.3 8.6 7.8 10.05a1 1 0 0 0 .7 0C16.85 19.6 20.15 15.9 20.15 11V6.54a1 1 0 0 0-.65-.94L12 2.9Z"
        />
        <path className={active ? "stroke-background" : undefined} d="m8.75 12 2.25 2.25 4.25-4.5" />
    </Svg>
);
