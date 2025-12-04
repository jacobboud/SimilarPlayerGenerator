// App.tsx
import { useState } from "react";
import SimilarPlayerGenerator from "./components/SimilarPlayerGenerator";
import GoatPage from "./components/GoatPage";

function App() {
  const [activePage, setActivePage] = useState<"similarity" | "goat">(
    "similarity"
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100vw",
        backgroundColor: "var(--color-bg)",
        color: "var(--color-text-primary)",
        boxSizing: "border-box",
      }}
    >
      {/* Simple top nav */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "8px",
          padding: "12px 16px",
          borderBottom: "1px solid var(--color-border)",
          backgroundColor: "var(--color-surface)",
        }}
      >
        <button
          onClick={() => setActivePage("similarity")}
          style={{
            padding: "6px 12px",
            borderRadius: "4px",
            border: "1px solid var(--color-border)",
            backgroundColor:
              activePage === "similarity"
                ? "var(--color-primary)"
                : "var(--color-surface)",
            color:
              activePage === "similarity"
                ? "var(--color-primary-contrast)"
                : "var(--color-text-primary)",
            cursor: "pointer",
          }}
        >
          Similarity
        </button>
        <button
          onClick={() => setActivePage("goat")}
          style={{
            padding: "6px 12px",
            borderRadius: "4px",
            border: "1px solid var(--color-border)",
            backgroundColor:
              activePage === "goat"
                ? "var(--color-primary)"
                : "var(--color-surface)",
            color:
              activePage === "goat"
                ? "var(--color-primary-contrast)"
                : "var(--color-text-primary)",
            cursor: "pointer",
          }}
        >
          GOAT
        </button>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          padding: "2rem 1rem",
        }}
      >
        {activePage === "similarity" ? (
          <SimilarPlayerGenerator />
        ) : (
          <GoatPage />
        )}
      </div>
    </div>
  );
}

export default App;
