import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Set page title
document.title = "MediaReview.io - Video Review & Approval Platform";

// Create meta description if doesn't exist
if (!document.querySelector('meta[name="description"]')) {
  const metaDescription = document.createElement('meta');
  metaDescription.name = 'description';
  metaDescription.content = 'MediaReview.io is a self-hosted video review and approval platform. Upload, review, comment, and approve media assets with ease.';
  document.head.appendChild(metaDescription);
}

createRoot(document.getElementById("root")!).render(<App />);
