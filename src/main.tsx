import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerServiceWorker } from "./pwa";
import { installGlobalErrorHandlers } from "./lib/installGlobalErrorHandlers";
import { syncCalmModeToDocument } from "./hooks/use-reduce-motion";

installGlobalErrorHandlers();
syncCalmModeToDocument();

createRoot(document.getElementById("root")!).render(<App />);

// Production-only PWA registration — see src/pwa.ts for the iframe and dev
// guards.
registerServiceWorker();
