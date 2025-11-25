import Recommender from "./components/SimilarPlayerGenerator";

function App() {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start", // <- was "center"
        minHeight: "100vh",
        width: "100vw",
        backgroundColor: "#f9f9f9",
        padding: "2rem",
        boxSizing: "border-box",
      }}
    >
      <Recommender />
    </div>
  );
}

export default App;
