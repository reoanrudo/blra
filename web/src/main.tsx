import React from "react";
import ReactDOM from "react-dom/client";
import { LawReader } from "./components/LawReader";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LawReader />
  </React.StrictMode>,
);
