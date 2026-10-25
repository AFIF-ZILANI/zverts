import { Bar, BarChart, ResponsiveContainer, XAxis, Tooltip, Cell } from "recharts";

// Colours go through classes: SVG fill attributes can't read CSS variables.
export const WeeklyActivityChart = ({
    data,
    unit = "min",
    label = "Watched",
    height = 150,
}: {
    data: { day: string; minutes: number }[];
    /** Tooltip wording for the value, e.g. "12 min · Watched". */
    unit?: string;
    label?: string;
    height?: number;
}) => {
    const today = data.length - 1;
    return (
        <ResponsiveContainer width="100%" height={height}>
            <BarChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
                <XAxis
                    dataKey="day"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, className: "fill-muted-foreground" }}
                />
                <Tooltip
                    cursor={{ className: "fill-muted/40", radius: 8 }}
                    contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 12,
                        fontSize: 12,
                    }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                    formatter={(v: number) => [`${v} ${unit}`, label]}
                />
                <Bar dataKey="minutes" radius={[8, 8, 8, 8]} maxBarSize={36} minPointSize={4}>
                    {data.map((_, i) => (
                        <Cell
                            key={i}
                            className={i === today ? "fill-primary" : "fill-primary/30"}
                        />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
};
