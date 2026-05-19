export interface InsertResult {
  value: string;
  selStart: number;
  selEnd: number;
}

/**
 * Wraps the selected text (selStart..selEnd) with `before`/`after` markers.
 * When nothing is selected, inserts `before + placeholder + after` and selects the placeholder.
 */
export function wrapInline(
  value: string,
  selStart: number,
  selEnd: number,
  before: string,
  after: string,
  placeholder = "text",
): InsertResult {
  const selected = value.slice(selStart, selEnd);
  const inner = selected || placeholder;
  const newValue = value.slice(0, selStart) + before + inner + after + value.slice(selEnd);
  return {
    value: newValue,
    selStart: selStart + before.length,
    selEnd: selStart + before.length + inner.length,
  };
}

/**
 * Prepends `prefix` to every line spanned by selStart..selEnd.
 * Line boundaries are expanded outward to full lines.
 */
export function prefixLines(
  value: string,
  selStart: number,
  selEnd: number,
  prefix: string,
): InsertResult {
  const lineStart = value.lastIndexOf("\n", selStart - 1) + 1;
  const nextNl = value.indexOf("\n", selEnd);
  const lineEnd = nextNl === -1 ? value.length : nextNl;

  const block = value.slice(lineStart, lineEnd);
  const lines = block.split("\n");
  const prefixed = lines.map((l) => prefix + l).join("\n");

  const newValue = value.slice(0, lineStart) + prefixed + value.slice(lineEnd);
  return {
    value: newValue,
    selStart: selStart + prefix.length,
    selEnd: selEnd + prefix.length * lines.length,
  };
}

/**
 * Inserts `block` after the line containing `selStart`, separated by a blank line.
 * Leaves the cursor immediately after the inserted block.
 */
export function insertBlock(value: string, selStart: number, block: string): InsertResult {
  const nextNl = value.indexOf("\n", selStart);
  const insertAt = nextNl === -1 ? value.length : nextNl;

  const head = value.slice(0, insertAt);
  const tail = value.slice(insertAt);

  const sep =
    head === ""
      ? ""
      : head.endsWith("\n\n")
        ? ""
        : head.endsWith("\n")
          ? "\n"
          : "\n\n";
  const trailingNl = tail.startsWith("\n") ? "" : "\n";

  const inserted = sep + block + trailingNl;
  const newCursor = insertAt + inserted.length;
  return {
    value: head + inserted + tail,
    selStart: newCursor,
    selEnd: newCursor,
  };
}
