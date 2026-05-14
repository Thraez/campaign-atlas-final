import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Landing from "./pages/Landing.tsx";

// Lazy-load heavy/secondary routes to keep the landing bundle small.
const AtlasViewer = lazy(() => import("./pages/AtlasViewer.tsx"));
// Editor route is build-gated. In player production builds __INCLUDE_EDITOR__
// is replaced with `false` at build time, so this `import()` is dead-coded
// and AtlasPlacementEditor.tsx never enters the player bundle.
const AtlasPlacementEditor = __INCLUDE_EDITOR__
  ? lazy(() => import("./pages/AtlasPlacementEditor.tsx"))
  : null;
const AtlasTimeline = lazy(() => import("./pages/AtlasTimeline.tsx"));
const AtlasBrowse = lazy(() => import("./pages/AtlasBrowse.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
import { isDmToolsEnabled } from "@/atlas/dmTools";

// Route-level gate. In editor builds, the route additionally honors the
// runtime DM-tools flag so a deployed editor build can still suppress
// the editor for non-DMs; in player builds the route isn't mounted at all.
const AtlasEditorRoute = () =>
  AtlasPlacementEditor && isDmToolsEnabled() ? <AtlasPlacementEditor /> : <NotFound />;

const queryClient = new QueryClient();

const RouteFallback = () => (
  <div
    role="status"
    aria-live="polite"
    className="h-screen w-screen flex items-center justify-center bg-background text-muted-foreground text-sm"
  >
    Loading…
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/+$/, "") || "/"}>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/atlas" element={<AtlasViewer />} />
            {AtlasPlacementEditor && (
              <Route path="/atlas/edit" element={<AtlasEditorRoute />} />
            )}
            <Route path="/atlas/timeline" element={<AtlasTimeline />} />
            <Route path="/atlas/browse" element={<AtlasBrowse mode="browse" />} />
            <Route path="/atlas/tag/:tag" element={<AtlasBrowse mode="tag" />} />
            <Route path="/atlas/type/:type" element={<AtlasBrowse mode="type" />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
