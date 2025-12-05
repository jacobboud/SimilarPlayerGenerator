// src/components/HomePage.tsx
import { Link } from "react-router-dom";

export default function HomePage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--color-bg)",
        color: "var(--color-text-primary)",
        padding: "40px 16px",
        textAlign: "center",
      }}
    >
      <h1
        style={{
          fontSize: "2.4rem",
          fontWeight: "bold",
          marginBottom: "12px",
        }}
      >
        Basketball Analytics Lab
      </h1>

      <p
        style={{
          maxWidth: "600px",
          margin: "0 auto 32px",
          color: "var(--color-text-muted)",
        }}
      >
        Explore player similarity and build your own GOAT formula. Pick a tool
        to get started.
      </p>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          alignItems: "center",
        }}
      >
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "8px",
            padding: "20px",
            maxWidth: "500px",
            width: "90vw",
            textAlign: "center",
            boxShadow: "var(--shadow-elevated)",
          }}
        >
          <h2 style={{ fontSize: "1.4rem", marginBottom: "6px" }}>
            Similar Player Generator
          </h2>
          <p style={{ color: "var(--color-text-muted)", marginBottom: "12px" }}>
            Search for a player and find the most similar careers or seasons,
            using stats and accolades you choose.
          </p>
          <Link to="/similarity">
            <button
              style={{
                padding: "8px 16px",
                borderRadius: "4px",
                border: "none",
                backgroundColor: "var(--color-primary)",
                color: "var(--color-primary-contrast)",
                cursor: "pointer",
              }}
            >
              Open Similarity Tool
            </button>
          </Link>
        </div>

        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "8px",
            padding: "20px",
            maxWidth: "500px",
            width: "90vw",
            textAlign: "center",
            boxShadow: "var(--shadow-elevated)",
          }}
        >
          <h2 style={{ fontSize: "1.4rem", marginBottom: "6px" }}>
            GOAT Ranking Engine
          </h2>
          <p style={{ color: "var(--color-text-muted)", marginBottom: "12px" }}>
            Assign weights to stats and awards to compute your own GOAT
            leaderboard for careers or single seasons.
          </p>
          <Link to="/goat">
            <button
              style={{
                padding: "8px 16px",
                borderRadius: "4px",
                border: "none",
                backgroundColor: "var(--color-primary)",
                color: "var(--color-primary-contrast)",
                cursor: "pointer",
              }}
            >
              Open GOAT Engine
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
