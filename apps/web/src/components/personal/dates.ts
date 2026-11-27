/**
 * Date inputs hold wall-clock values in the browser's zone. Convert to an ISO instant in the
 * browser before sending, so the server (which runs in UTC) never guesses the zone.
 */
const pad = (n: number) => String(n).padStart(2, "0");

/** ISO instant → value for <input type="datetime-local"> (browser zone). Client-only rendering. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "YYYY-MM-DD" → ISO at the given local time (default end of day, for deadlines). Empty stays empty. */
export function fromLocalDate(value: string, time = "23:59"): string {
  return value ? new Date(`${value}T${time}`).toISOString() : "";
}

/** "YYYY-MM-DDTHH:mm" → ISO. Empty stays empty. */
export function fromLocalDateTime(value: string): string {
  return value ? new Date(value).toISOString() : "";
}
