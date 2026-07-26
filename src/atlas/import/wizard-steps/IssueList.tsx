import { Badge } from "@/components/ui/badge";

export function IssueList({
  title,
  items,
  variant,
}: {
  title: string;
  items: string[];
  variant: "destructive" | "secondary";
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        {title} ({items.length})
      </div>
      <ul className="space-y-1">
        {items.map((m, i) => (
          <li
            key={i}
            className="rounded-md border border-border bg-card/50 p-2 text-xs flex items-start gap-2"
          >
            <Badge variant={variant} className="text-[9px] shrink-0">
              {title.toLowerCase()}
            </Badge>
            <span>{m}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
