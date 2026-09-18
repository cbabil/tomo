/** Turn the release workflow's Markdown into sections of plain items the update screen can list. */

export interface NoteItem {
  /** The area of Tomo the change touches, e.g. "ui", when the note names one. */
  scope?: string;
  text: string;
}

export interface NoteSection {
  title: string;
  items: NoteItem[];
}

const SECTION = /^#{3,}\s+(.*)$/;
const ITEM = /^[-*]\s+(?:\*\*([^*]+)\*\*:\s*)?(.*)$/;

export function parseReleaseNotes(markdown: string): NoteSection[] {
  const sections: NoteSection[] = [];
  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    const heading = SECTION.exec(line);
    if (heading) {
      sections.push({ title: heading[1], items: [] });
      continue;
    }
    const item = ITEM.exec(line);
    if (!item || !item[2]) continue;
    if (sections.length === 0) sections.push({ title: "", items: [] });
    const text = item[2].charAt(0).toUpperCase() + item[2].slice(1);
    sections[sections.length - 1].items.push({ ...(item[1] && { scope: item[1] }), text });
  }
  return sections.filter((s) => s.items.length > 0);
}
