import React, { useEffect, useState } from "react";
import api from "./api";
import AdminFAQManager from "./AdminFAQManager";
import AdminUserManager from "./AdminUserManager";

export default function Admin({ onLogout }) {
  const [me, setMe] = useState(null);
  const [tab, setTab] = useState("faqs");
  const [feedbacks, setFeedbacks] = useState([]);
  const [unanswered, setUnanswered] = useState([]);

  useEffect(() => {
    api.get("/whoami")
      .then(r => setMe(r.data))
      .catch(() => {
        localStorage.removeItem("adminToken");
        window.location.href = "/admin";
      });

    // load logs if admin role
    api.get("/feedbacks").then(r => setFeedbacks(r.data.feedbacks || [])).catch(()=>{});
    api.get("/unanswered").then(r => setUnanswered(r.data.unanswered || [])).catch(()=>{});
  }, []);

  const exportCSV = (rows, filename) => {
    const csv = "data:text/csv;charset=utf-8," +
      rows.map((row, i) => `${i+1},"${row.replace(/"/g,'""')}"`).join("\n");
    const link = document.createElement("a");
    link.href = encodeURI(csv);
    link.download = filename;
    link.click();
  };

  const resetLogs = async () => {
    if (!window.confirm("Clear all logs?")) return;
    await api.post("/admin/reset-logs");
    setFeedbacks([]);
    setUnanswered([]);
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => setTab("faqs")}>FAQ Manager</button>
        {me && (me.role === "superadmin") && <button onClick={() => setTab("users")}>User Manager</button>}
        <button onClick={() => exportCSV(feedbacks, "feedbacks.csv")}>Export Feedback</button>
        <button onClick={() => exportCSV(unanswered, "unanswered.csv")}>Export Unanswered</button>
        <button onClick={resetLogs}>Reset Logs</button>
        <button onClick={onLogout}>Logout</button>
      </div>

      <div>
        <h3>Welcome {me?.username} — role: {me?.role}</h3>
      </div>

      <div>
        {tab === "faqs" && <AdminFAQManager />}
        {tab === "users" && me?.role === "superadmin" && <AdminUserManager />}
      </div>

      <div style={{marginTop:24}}>
        <h4>Feedback</h4>
        <ul>{feedbacks.map((f,i)=> <li key={i}>{f}</li>)}</ul>

        <h4>Unanswered</h4>
        <ul>{unanswered.map((q,i)=> <li key={i}>{q}</li>)}</ul>
      </div>
    </div>
  );
}
