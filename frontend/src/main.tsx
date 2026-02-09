import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router"
import { FrappeProvider } from "frappe-react-sdk"
import { Toaster } from "sonner"
import "./index.css"
import App from "./App"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <FrappeProvider>
      <BrowserRouter basename="/frontend">
        <App />
        <Toaster position="top-right" />
      </BrowserRouter>
    </FrappeProvider>
  </StrictMode>
)
