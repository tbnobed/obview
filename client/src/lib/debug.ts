/**
 * Gated debug logger for chatty per-file logs (sprite metadata, URL params…).
 *
 * Silent by default. To turn on in a browser console:
 *   localStorage.setItem("obviu:debug", "1"); location.reload();
 * To turn off:
 *   localStorage.removeItem("obviu:debug"); location.reload();
 */
const enabled: boolean = (() => {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("obviu:debug") === "1";
  } catch {
    return false;
  }
})();

export function debugLog(...args: unknown[]): void {
  if (enabled) console.log(...args);
}
