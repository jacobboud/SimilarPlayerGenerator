// src/App.tsx
import {
  BrowserRouter as Router,
  Routes,
  Route,
  NavLink,
} from "react-router-dom";
import SimilarPlayerGenerator from "./components/SimilarPlayerGenerator";
import GoatPage from "./components/GoatPage";
import HomePage from "./components/HomePage";

function App() {
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
      <Router>
        {/* Top nav */}
        <header
          style={{
            borderBottom: "1px solid var(--color-border)",
            backgroundColor: "var(--color-surface)",
          }}
        >
          <div
            style={{
              maxWidth: "1000px",
              margin: "0 auto",
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            <div style={{ fontWeight: 700 }}>Basketball Analytics Lab</div>
            <nav
              style={{
                display: "flex",
                gap: "8px",
              }}
            >
              <NavLink
                to="/"
                end
                style={({ isActive }) => ({
                  padding: "6px 12px",
                  borderRadius: "4px",
                  border: "1px solid var(--color-border)",
                  backgroundColor: isActive
                    ? "var(--color-primary)"
                    : "var(--color-surface)",
                  color: isActive
                    ? "var(--color-primary-contrast)"
                    : "var(--color-text-primary)",
                  textDecoration: "none",
                  fontSize: "0.9rem",
                })}
              >
                Home
              </NavLink>

              <NavLink
                to="/similarity"
                style={({ isActive }) => ({
                  padding: "6px 12px",
                  borderRadius: "4px",
                  border: "1px solid var(--color-border)",
                  backgroundColor: isActive
                    ? "var(--color-primary)"
                    : "var(--color-surface)",
                  color: isActive
                    ? "var(--color-primary-contrast)"
                    : "var(--color-text-primary)",
                  textDecoration: "none",
                  fontSize: "0.9rem",
                })}
              >
                Similarity
              </NavLink>

              <NavLink
                to="/goat"
                style={({ isActive }) => ({
                  padding: "6px 12px",
                  borderRadius: "4px",
                  border: "1px solid var(--color-border)",
                  backgroundColor: isActive
                    ? "var(--color-primary)"
                    : "var(--color-surface)",
                  color: isActive
                    ? "var(--color-primary-contrast)"
                    : "var(--color-text-primary)",
                  textDecoration: "none",
                  fontSize: "0.9rem",
                })}
              >
                GOAT
              </NavLink>
            </nav>
          </div>
        </header>

        {/* Page content */}
        <main
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
            padding: "2rem 1rem",
          }}
        >
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/similarity" element={<SimilarPlayerGenerator />} />
            <Route path="/goat" element={<GoatPage />} />
          </Routes>
        </main>
      </Router>
    </div>
  );
}

export default App;
