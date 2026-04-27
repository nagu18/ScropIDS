import React from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "sonner";

import { App } from "@/app/App";
import { AuthProvider } from "@/hooks/useAuth";
import "@/index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
      <Toaster richColors theme="dark" />
    </AuthProvider>
  </React.StrictMode>
);
