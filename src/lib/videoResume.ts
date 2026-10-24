// Where a lesson video picks up again.

export const positionKey = (moduleId: string) => `zverts.pos.${moduleId}`;

// First second not yet watched, from the server's ranges ("{[0,120),[300,410)}").
export const firstUnwatched = (ranges: unknown) => {
    const list = [...String(ranges ?? "").matchAll(/[[(](\d+),(\d+)[\])]/g)]
        .map((m) => [Number(m[1]), Number(m[2])])
        .sort((a, b) => a[0] - b[0]);
    return list.length && list[0][0] <= 1 ? list[0][1] : 0;
};

// Where to start the video: the position saved on this device, else the first
// unwatched second; from the top when that's within the last 15 seconds.
export const resumePoint = (moduleId: string, ranges: unknown, duration: number) => {
    let saved = 0;
    try {
        saved = Number(localStorage.getItem(positionKey(moduleId))) || 0;
    } catch {
        /* storage unavailable */
    }
    const at = saved > 0 ? saved : firstUnwatched(ranges);
    return duration > 0 && at > duration - 15 ? 0 : at;
};
