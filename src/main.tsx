import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/base.css";
import "./styles/titlebar.css";
import "./styles/backstage.css";
import "./styles/ribbon.css";
import "./styles/workbook.css";
import "./styles/menus.css";
import "./styles/dialogs.css";

// Disable the WebView context menu outside inputs (the app provides its own menus)
window.addEventListener("contextmenu", (e) => {
  const t = e.target as HTMLElement;
  if (!(t instanceof HTMLInputElement) && !(t instanceof HTMLTextAreaElement) && !t.closest?.("[contenteditable]")) {
    e.preventDefault();
  }
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);
