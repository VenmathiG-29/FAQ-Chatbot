import React, { useState } from "react";
import Chatbot from "./chatbot";
import AdminLogin from "./adminlogin";

export default function App() {
  const [page, setPage] = useState("chat");
  return (
    <div>
      <nav style={{ padding: 12, borderBottom: "1px solid #ddd" }}>
        <button onClick={()=>setPage("chat")}>Chatbot</button>
        <button onClick={()=>setPage("admin")}>Admin</button>
      </nav>
      <div>
        {page === "chat" ? <Chatbot /> : <AdminLogin />}
      </div>
    </div>
  );
}
