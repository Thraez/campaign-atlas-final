import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Landing from "./pages/Landing.tsx";

// Lazy-load heavy/secondary routes to keep the landing bundle small.
const Index = lazy(() => import("./pages/Index.tsx"));
const Auth = lazy(() => import("./pages/Auth.tsx"));
const AtlasViewer = lazy(() => import("./pages/AtlasViewer.tsx"));
const AtlasPlacementEditor = lazy(() => import("./pages/AtlasPlacementEditor.tsx"));
const AtlasTimeline = lazy(() => import("./pages/AtlasTimeline.tsx"));
const AtlasBrowse = lazy(() => import("./pages/AtlasBrowse.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
import { isDmToolsEnabled } from "@/atlas/dmTools";

// Route-level gate. The /atlas/edit route is the editor entry point; in
// production player builds (VITE_ENABLE_DM_TOOLS unset / not "true") we
// must not just hide the link — the route itself must render NotFound so
// players cannot reach the editor by typing the URL or following a stale
// link.
const AtlasEditorRoute = () =>
  isDmToolsEnabled() ? <AtlasPlacementEditor /> : <NotFound />;

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
            <Route path="/legacy-editor" element={<Index />} />
            <Route path="/atlas" element={<AtlasViewer />} />
            <Route path="/atlas/edit" element={<AtlasEditorRoute />} />
            <Route path="/atlas/timeline" element={<AtlasTimeline />} />
            <Route path="/atlas/browse" element={<AtlasBrowse mode="browse" />} />
            <Route path="/atlas/tag/:tag" element={<AtlasBrowse mode="tag" />} />
            <Route path="/atlas/type/:type" element={<AtlasBrowse mode="type" />} />
            <Route path="/auth" element={<Auth />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
