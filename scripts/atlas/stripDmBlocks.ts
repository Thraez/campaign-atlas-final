// Strip Obsidian comment blocks: %% ... %% (single or multi-line).
// Returns cleaned text and the number of blocks removed.
export function stripDmBlocks(input: string): { text: string; count: number } {
  let count = 0;
  const text = input.replace(/%%[\s\S]*?%%/g, () => {
    count += 1;
    return "";
  });
  // Collapse runs of >2 blank lines left behind
  return { text: text.replace(/\n{3,}/g, "\n\n"), count };
}
