/**
 * Reading a tick box out of a submitted form.
 *
 * An unticked box sends nothing at all. So `fd.get("enabled") !== "off"` — the
 * shape this codebase reached for twice — reads a missing field as `null`,
 * `null !== "off"` is true, and the setting comes back on. The box could be
 * unticked and saved all day and nothing would ever turn off: a reminder kept
 * going out after somebody switched it off, and somebody who had stopped taking
 * bookings kept being offered them.
 *
 * Presence is the whole signal. The value ("on", by default) never matters.
 *
 * This is only for tick boxes. A pair of radios with explicit on/off values
 * always sends one of them, and comparing the value there is correct.
 */
export function ticked(fd: Pick<FormData, "get">, name: string): boolean {
  return fd.get(name) !== null;
}
