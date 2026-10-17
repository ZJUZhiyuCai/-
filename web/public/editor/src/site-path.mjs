// Empty on Sites; an explicit deployment prefix on a standalone server.
export function sitePath(path){return (globalThis.__SHUYE_BASE__||'')+path;}
