// Locates markdown code regions (fenced code blocks and inline code spans) in raw
// markdown text so wikilink/embed tokenizers can skip substitution inside them —
// text that merely *shows* `[[Link]]` / `![[embed]]` syntax must stay literal.

export interface CodeRange {
  start: number;
  end: number;
}

const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})/;
const INLINE_SPAN_RE = /(`+)([\s\S]*?)\1/g;

export function findCodeRanges(text: string): CodeRange[] {
  const ranges: CodeRange[] = [];
  const lines = text.split("\n");
  const lineStarts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineStarts.push(offset);
    offset += line.length + 1;
  }

  let i = 0;
  while (i < lines.length) {
    const open = FENCE_OPEN_RE.exec(lines[i]);
    if (open) {
      const fenceChar = open[1][0] === "`" ? "`" : "~";
      const fenceLen = open[1].length;
      const closeRe = new RegExp(`^ {0,3}[${fenceChar}]{${fenceLen},}[ \\t]*$`);
      let j = i + 1;
      while (j < lines.length && !closeRe.test(lines[j])) j++;
      const endLineIdx = j < lines.length ? j : lines.length - 1;
      ranges.push({ start: lineStarts[i], end: lineStarts[endLineIdx] + lines[endLineIdx].length });
      i = j + 1;
      continue;
    }
    i++;
  }

  INLINE_SPAN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_SPAN_RE.exec(text))) {
    const start = m.index;
    const end = start + m[0].length;
    if (!ranges.some((r) => start >= r.start && start < r.end)) {
      ranges.push({ start, end });
    }
  }

  ranges.sort((a, b) => a.start - b.start);
  return ranges;
}

export function isInsideCodeRange(idx: number, ranges: CodeRange[]): boolean {
  return ranges.some((r) => idx >= r.start && idx < r.end);
}

/** Like `text.replace(regex, replacer)`, but leaves matches inside a fenced code
 *  block or inline code span untouched (returns the original matched text for them). */
export function replaceOutsideCode(
  text: string,
  regex: RegExp,
  replacer: (...args: unknown[]) => string
): string {
  const ranges = findCodeRanges(text);
  if (ranges.length === 0) return text.replace(regex, replacer);
  return text.replace(regex, (...args: unknown[]) => {
    const offset = args[args.length - 2] as number;
    if (isInsideCodeRange(offset, ranges)) return args[0] as string;
    return replacer(...args);
  });
}
