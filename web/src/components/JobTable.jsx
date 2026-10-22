// web/src/components/JobTable.jsx — failed-first rows (already sorted by the API) + detail aside
import { useEffect, useRef, useState } from "react";
import { fetchServerJobs, fetchJobDetails } from "../api";
import BlinkingDot from "./BlinkingDot";

export default function JobTable({ serverName }) {
  const [jobs, setJobs] = useState([]);
  const [detail, setDetail] = useState(null);
  // Sequence token: only the latest Detail click's response may win, so a slow
  // earlier response can never overwrite a newer click's detail (v9: was a
  // last-settled-wins race showing a stale job's diagnosis).
  const detailSeq = useRef(0);
  useEffect(() => { fetchServerJobs(serverName).then((d) => setJobs(d.jobs || [])); }, [serverName]);
  const loadDetail = async (jobId) => {
    const seq = ++detailSeq.current;
    const d = await fetchJobDetails(jobId);
    if (seq === detailSeq.current) setDetail(d.data || null);
  };
  return (
    <div className="job-panel" onClick={(e) => e.stopPropagation()}>
      <table>
        <thead>
          <tr><th>#</th><th>Job</th><th>Project</th><th>Context</th><th>Last run</th><th>Status</th></tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.job_id} className={j.status_color.toLowerCase()}>
              <td><BlinkingDot color={j.status_color} />{j.job_id}</td>
              <td>{j.name} <button onClick={() => loadDetail(j.job_id)}>Detail</button></td>
              <td>{j.project}</td><td>{j.context}</td><td>{j.last_run}</td><td>{j.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {detail && (
        <aside className="detail">
          <h3>{detail.name} <button onClick={() => setDetail(null)}>×</button></h3>
          <pre>{detail.error_message || "(no error message)"}</pre>
          {detail.log_snippet && (
            <details><summary>Tail ({detail.log_snippet.length} chars)</summary><pre>{detail.log_snippet}</pre></details>)}
          {detail.ai_analysis?.error_summary && (
            <div className="ai-verdict">
              <b>AI diagnosis: </b>{detail.ai_analysis.error_summary}<br />
              <b>Action: </b>{detail.ai_analysis.action_item}
            </div>)}
        </aside>
      )}
    </div>
  );
}
