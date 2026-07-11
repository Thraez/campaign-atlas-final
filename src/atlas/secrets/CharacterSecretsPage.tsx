import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { loadAtlasContent } from "@/atlas/content/loader";
import type { AtlasProject, Entity } from "@/atlas/content/schema";
import { AtlasNavMenu } from "@/atlas/AtlasNavMenu";
import { collectCharacterSecrets, type CollectedSecret } from "./collectCharacterSecrets";
import { getCharacterKey, setCharacterKey, forgetAll } from "./playerSecretsStore";

function SafeHtml({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.replaceChildren(document.createRange().createContextualFragment(html));
  }, [html]);
  return <div ref={ref} />;
}

function SecretsBody({ entities }: { entities: Entity[] }) {
  const [key, setKey] = useState<string | null>(() => getCharacterKey());
  const [found, setFound] = useState<CollectedSecret[]>([]);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!key) { setFound([]); setTried(false); return; }
    let alive = true;
    void collectCharacterSecrets(entities, key).then((r) => {
      if (alive) { setFound(r); setTried(true); }
    });
    return () => { alive = false; };
  }, [key, entities]);

  const onSignIn = (value: string) => { setCharacterKey(value); setKey(value); };
  const onForget = () => { forgetAll(); setKey(null); setFound([]); setTried(false); };

  if (!key) {
    return (
      <>
        <p className="text-sm text-muted-foreground mb-4">
          Enter the key your DM gave you to see what only your character knows.
        </p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const v = (e.currentTarget.elements.namedItem("k") as HTMLInputElement).value.trim();
            if (v) onSignIn(v);
          }}
        >
          <input
            name="k"
            type="text"
            aria-label="Your character key"
            placeholder="Your character key"
            className="flex-1 border border-border rounded px-3 py-2 text-sm bg-background"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded hover:opacity-90"
          >
            Sign in
          </button>
        </form>
      </>
    );
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <button
          onClick={onForget}
          className="text-xs text-muted-foreground hover:text-foreground border border-border rounded px-3 py-1.5"
        >
          Forget on this device
        </button>
      </div>
      {!tried && (
        <p className="text-sm text-muted-foreground">Searching…</p>
      )}
      {tried && found.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No secrets found for that key. Check it with your DM.
        </p>
      )}
      <ul className="space-y-4">
        {found.map((s) => (
          <li key={`${s.entityId}:${s.secretId}`} className="border border-border rounded p-4">
            <SafeHtml html={s.html} />
            <Link
              to={`/atlas?entity=${encodeURIComponent(s.entityId)}`}
              className="text-xs text-muted-foreground hover:text-foreground mt-2 inline-block"
            >
              On: {s.entityTitle}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function CharacterSecretsPage() {
  const [project, setProject] = useState<AtlasProject | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAtlasContent(true).then(setProject).catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-destructive text-sm p-6">
        {error}
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AtlasNavMenu publishedAt={project.publishedAt} />
      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
        <div className="flex items-center gap-2 mb-6">
          <Link
            to="/atlas"
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Back to atlas"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-2xl font-display">Your character's secrets</h1>
        </div>
        <SecretsBody entities={project.entities} />
      </div>
    </div>
  );
}
