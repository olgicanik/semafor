// web/src/App.jsx — bootstrap from REST, then replace state on every /ws broadcast
import { useEffect, useState } from "react";
import { fetchServerStatus, openStatusSocket } from "./api";
import ServerCard from "./components/ServerCard";
import "./App.css";

export default function App() {
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchServerStatus().then(setSnapshot).catch((e) => setError(String(e)));
    const ws = openStatusSocket((snap) => snap && setSnapshot(snap));
    return () => ws.close();
  }, []);

  if (!snapshot) {
    return <div className="app">{error ? `Offline: ${error}` : "Loading dashboard…"}</div>;
  }
  return (
    <div className="app">
      <header>
        <h1>Talend Job Conductor Monitor</h1>
        <span className="meta">generated {snapshot.generated_at || "—"}</span>
      </header>
      <main className="server-grid">
        {snapshot.data.map((s) => <ServerCard key={s.server_name} server={s} />)}
      </main>
    </div>
  );
}
