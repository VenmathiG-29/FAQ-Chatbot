import React, { useState, useEffect } from "react";
import api from "./api";
import Admin from "./admin";

export default function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState(localStorage.getItem("adminToken"));

  useEffect(() => {
    const t = localStorage.getItem("adminToken");
    if (t) setToken(t);
  }, []);

  const handleLogin = async () => {
    try {
      const { data } = await api.post("/login", { username, password });
      localStorage.setItem("adminToken", data.token);
      setToken(data.token);
    } catch (e) {
      alert("Login failed");
    }
  };

  if (token) return <Admin onLogout={async () => {
    await api.post("/logout");
    localStorage.removeItem("adminToken");
    window.location.href = "/admin";
  }} />;

  return (
    <div style={{ padding: 24 }}>
      <h2>🔑 Admin Login</h2>
      <input placeholder="username" value={username} onChange={e=>setUsername(e.target.value)} />
      <input type="password" placeholder="password" value={password} onChange={e=>setPassword(e.target.value)} />
      <button onClick={handleLogin}>Login</button>
    </div>
  );
}
