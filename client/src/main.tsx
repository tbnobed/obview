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

// Create an error display div
const errorDiv = document.createElement('div');
errorDiv.id = 'app-error';
errorDiv.style.display = 'none';
errorDiv.style.position = 'fixed';
errorDiv.style.top = '0';
errorDiv.style.left = '0';
errorDiv.style.width = '100%';
errorDiv.style.padding = '20px';
errorDiv.style.backgroundColor = '#f44336';
errorDiv.style.color = 'white';
errorDiv.style.zIndex = '9999';
document.body.appendChild(errorDiv);

// Add global error handler
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
  errorDiv.textContent = `Application Error: ${event.error?.message || 'Unknown error'}`;
  errorDiv.style.display = 'block';
});

// Add unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  errorDiv.textContent = `Application Error: ${event.reason?.message || 'Unhandled Promise Rejection'}`;
  errorDiv.style.display = 'block';
});

try {
  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error("Root element not found");
  }
  const root = createRoot(rootElement);
  root.render(<App />);
  console.log("App rendered successfully");
} catch (error) {
  console.error("Error rendering app:", error);
  errorDiv.textContent = `Application Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
  errorDiv.style.display = 'block';
}
