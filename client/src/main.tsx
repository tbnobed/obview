import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Set page title
document.title = "Obviu.io - Video Review & Approval Platform";

// Window-level drag fallback: prevents the browser from navigating to
// the dropped file (and showing the 🚫 cursor) for any OS file drag
// that doesn't land on a registered drop zone. Element-level handlers
// (e.g. media-card-grid) still get their drop event because we don't
// stopPropagation here. Internal app drags are skipped so the
// cross-project move flow keeps its no-drop semantics outside drop
// zones.
const isExternalFileDrag = (e: DragEvent): boolean => {
  const types = e.dataTransfer?.types;
  if (!types) return false;
  for (let i = 0; i < types.length; i++) {
    if (types[i] === "application/x-obviu-dnd") return false;
  }
  return true;
};
window.addEventListener("dragover", (e) => {
  if (isExternalFileDrag(e)) e.preventDefault();
});
window.addEventListener("drop", (e) => {
  if (isExternalFileDrag(e)) e.preventDefault();
});

// Create meta description if doesn't exist
if (!document.querySelector('meta[name="description"]')) {
  const metaDescription = document.createElement('meta');
  metaDescription.name = 'description';
  metaDescription.content = 'Obviu.io is a self-hosted video review and approval platform. Upload, review, comment, and approve media assets with ease.';
  document.head.appendChild(metaDescription);
}

createRoot(document.getElementById("root")!).render(<App />);
