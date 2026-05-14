/**
 * Textarea wrapped with one-click "mark this DM-only" affordances.
 *
 * Authors of player-visible fields (summary, player-profile freeform fields)
 * sometimes paste DM notes inline. To make the safe path discoverable, the
 * textarea ships with two buttons above it:
 *
 *  - **DM inline** → wraps the current selection in `%% ... %%` (Obsidian
 *    comment syntax). The build pipeline strips these from any shipping
 *    string in player builds. Good for parenthetical asides.
 *  - **DM block** → wraps the current selection in `:::dm\n ... \n:::`
 *    callout syntax. Same strip behaviour, paragraph-level. Good for whole
 *    sentences you want hidden from players.
 *
 * If no selection exists, both buttons insert empty fences at the cursor.
 *
 * The component is a thin wrapper over the existing UI Textarea — its props
 * are forwarded, so it slots in anywhere a Textarea is used.
 */
import { forwardRef, useRef, useImperativeHandle } from "react";
import { ShieldAlert } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface DmMaskingTextareaProps {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
  id?: string;
  /** Hide the block button (useful for single-line-style fields). */
  blockOnly?: boolean;
  /** Hide the inline button (useful for body-style fields). */
  inlineOnly?: boolean;
}

function wrap(
  value: string,
  start: number,
  end: number,
  open: string,
  close: string,
  blockStyle: boolean
): { next: string; cursorStart: number; cursorEnd: number } {
  const before = value.slice(0, start);
  const middle = value.slice(start, end);
  const after = value.slice(end);
  const placeholder = blockStyle ? "DM-only paragraph here" : "DM note";
  if (middle.length === 0) {
    if (blockStyle) {
      const insert = `${before.endsWith("\n") || before.length === 0 ? "" : "\n"}${open}\n${placeholder}\n${close}\n`;
      const next = before + insert + after;
      const placeholderStart = next.indexOf(placeholder, before.length);
      return { next, cursorStart: placeholderStart, cursorEnd: placeholderStart + placeholder.length };
    }
    const insert = `${open}${placeholder}${close}`;
    const next = before + insert + after;
    const placeholderStart = next.indexOf(placeholder, before.length);
    return { next, cursorStart: placeholderStart, cursorEnd: placeholderStart + placeholder.length };
  }
  if (blockStyle) {
    const leadingNl = before.endsWith("\n") || before.length === 0 ? "" : "\n";
    const trailingNl = after.startsWith("\n") || after.length === 0 ? "" : "\n";
    const next = `${before}${leadingNl}${open}\n${middle}\n${close}${trailingNl}${after}`;
    return { next, cursorStart: start + leadingNl.length + open.length + 1, cursorEnd: start + leadingNl.length + open.length + 1 + middle.length };
  }
  const next = `${before}${open}${middle}${close}${after}`;
  return { next, cursorStart: start + open.length, cursorEnd: start + open.length + middle.length };
}

export interface DmMaskingTextareaRef {
  focus: () => void;
}

export const DmMaskingTextarea = forwardRef<DmMaskingTextareaRef, DmMaskingTextareaProps>(
  function DmMaskingTextarea(
    { value, onChange, rows, placeholder, className, blockOnly, inlineOnly, ...rest },
    ref
  ) {
    const taRef = useRef<HTMLTextAreaElement | null>(null);

    useImperativeHandle(ref, () => ({ focus: () => taRef.current?.focus() }));

    const apply = (open: string, close: string, blockStyle: boolean) => {
      const ta = taRef.current;
      if (!ta) return;
      const start = ta.selectionStart ?? value.length;
      const end = ta.selectionEnd ?? value.length;
      const { next, cursorStart, cursorEnd } = wrap(value, start, end, open, close, blockStyle);
      onChange(next);
      requestAnimationFrame(() => {
        if (!taRef.current) return;
        taRef.current.focus();
        taRef.current.setSelectionRange(cursorStart, cursorEnd);
      });
    };

    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          {!blockOnly && (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                    onClick={() => apply("%%", "%%", false)}
                    aria-label="Mark selection DM-only inline"
                  >
                    <ShieldAlert className="h-3 w-3" aria-hidden="true" />
                    DM inline
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs max-w-xs">
                  Wraps the selection in <code className="text-[10px]">%% ... %%</code> (Obsidian comment).
                  Stripped from player builds. Use for short parenthetical DM notes.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {!inlineOnly && (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                    onClick={() => apply(":::dm", ":::", true)}
                    aria-label="Mark selection DM-only block"
                  >
                    <ShieldAlert className="h-3 w-3" aria-hidden="true" />
                    DM block
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs max-w-xs">
                  Wraps the selection in <code className="text-[10px]">:::dm ... :::</code> callout.
                  Stripped from player builds. Use for whole paragraphs you want hidden.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <Textarea
          ref={taRef}
          rows={rows}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={className}
          {...rest}
        />
      </div>
    );
  }
);
