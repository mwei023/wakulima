import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { startDataSafety } from "./lib/bootstrap";

startDataSafety();

createRoot(document.getElementById("root")!).render(
  <App />
);
