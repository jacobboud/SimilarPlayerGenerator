// App.tsx
import Recommender from "./components/SimilarPlayerGenerator";

function App() {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        minHeight: "100vh",
        width: "100vw",
        backgroundColor: "var(--color-bg)",
        color: "var(--color-text-primary)",
        padding: "2rem",
        boxSizing: "border-box",
      }}
    >
      <Recommender />
    </div>
  );
}

export default App;
