import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AtlasMap } from "@/atlas/AtlasMap";
import { Toolbar } from "@/atlas/Toolbar";
import { SidePanel } from "@/atlas/SidePanel";
import { Minimap } from "@/atlas/Minimap";
import { useAtlas } from "@/atlas/store";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const Index = () => {
  const nav = useNavigate();
  const atlas = useAtlas((s) => s.atlas);
  const setAtlas = useAtlas((s) => s.setAtlas);
  const worldId = useAtlas((s) => s.worldId);
  const setWorldId = useAtlas((s) => s.setWorldId);
  const [signedIn, setSignedIn] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setSignedIn(!!session);
      setUserId(session?.user.id ?? null);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(!!data.session);
      setUserId(data.session?.user.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Load most recent world from cloud when first signed in
  useEffect(() => {
    if (!userId || worldId) return;
    (async () => {
      const { data, error } = await supabase
        .from("worlds")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(1);
      if (error) return;
      if (data && data[0]) {
        setWorldId(data[0].id);
        try { setAtlas(data[0].data as any); } catch {}
      }
    })();
  }, [userId, worldId, setWorldId, setAtlas]);

  const saveCloud = async () => {
    if (!userId) { nav("/auth"); return; }
    if (worldId) {
      const { error } = await supabase.from("worlds")
        .update({ name: atlas.world.name, data: atlas as any })
        .eq("id", worldId);
      if (error) return toast.error(error.message);
      toast.success("Saved to cloud");
    } else {
      const { data, error } = await supabase.from("worlds")
        .insert({ user_id: userId, name: atlas.world.name, data: atlas as any })
        .select().single();
      if (error) return toast.error(error.message);
      setWorldId(data.id);
      toast.success("World saved to cloud");
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setWorldId(null);
    toast.success("Signed out");
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
      <Toolbar onSaveCloud={saveCloud} onSignOut={signOut} signedIn={signedIn} />
      {!signedIn && (
        <div className="px-3 py-1.5 text-xs bg-accent/20 text-foreground border-b border-border flex items-center justify-between">
          <span>Working locally — your atlas is autosaved in this browser.</span>
          <button className="text-primary hover:underline" onClick={() => nav("/auth")}>Sign in to save to cloud →</button>
        </div>
      )}
      <div className="flex-1 flex relative">
        <div className="flex-1 relative">
          <AtlasMap />
          <Minimap />
        </div>
        <SidePanel />
      </div>
    </div>
  );
};

export default Index;
