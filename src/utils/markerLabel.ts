/** Extract display title from a note link. Supports "path/Page#heading|Alias" syntax. */
export function displayTitle(noteLink: string): string {
  const pipeIdx = noteLink.indexOf("|");
  if (pipeIdx >= 0) return noteLink.slice(pipeIdx + 1);
  return noteLink.split("/").pop() ?? noteLink;
}

/** Extract the link path from a note link (strips alias). */
export function linkPath(noteLink: string): string {
  const pipeIdx = noteLink.indexOf("|");
  return pipeIdx >= 0 ? noteLink.slice(0, pipeIdx) : noteLink;
}

/** Build a marker label (title + description) into a container element. */
export function buildMarkerLabel(
  container: HTMLElement,
  note: string | null,
  description: string | null,
  labelClass: string
): void {
  if (!note && !description) return;

  const label = container.createDiv({ cls: labelClass });
  if (note) {
    label.createSpan({ cls: "ttrpgmap-marker-title", text: displayTitle(note) });
  }
  if (description) {
    label.createDiv({ cls: "ttrpgmap-marker-desc", text: description });
  }
}
