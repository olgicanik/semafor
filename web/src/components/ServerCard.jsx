// web/src/components/ServerCard.jsx — semaphore dot + counts; click drills into jobs
import { useState } from "react";
import BlinkingDot from "./BlinkingDot";
import JobTable from "./JobTable";

export default function ServerCard({ server }) {
  const [open, setOpen] = useState(false);
  const { server_name, server_ip, category, status_color, metrics } = server;
  return (
    <section className={`server card ${status_color.toLowerCase()}`} onClick={() => setOpen(!open)}>
      <div className="server-head">
        <BlinkingDot color={status_color} />
        <h2>{server_name}</h2>
        <span className="ip">{server_ip}</span>
        <span className="badge">{category}</span>
      </div>
      <div className="counts">
        <span className="c-green">G {metrics.green_count}</span>
        <span className="c-orange">O {metrics.orange_count}</span>
        <span className="c-red">R {metrics.red_count}</span>
        <span className="c-total">Σ {metrics.total_count}</span>
      </div>
      {open && <JobTable serverName={server_name} />}
    </section>
  );
}
