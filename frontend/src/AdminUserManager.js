import React, { useEffect, useState } from "react";
import api from "./api";

export default function AdminUserManager() {
  const [admins, setAdmins] = useState([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("editor");

  const load = async () => {
    const r = await api.get("/admins");
    setAdmins(r.data.admins || []);
  };

  useEffect(()=>{ load(); }, []);

  const create = async () => {
    if (!username || !password) return alert("username & password required");
    await api.post("/admins", { username, password, role });
    setUsername(""); setPassword(""); setRole("editor"); load();
  };

  const changeRole = async (id) => {
    const newRole = prompt("New role (viewer/editor/admin/superadmin):");
    if (!newRole) return;
    await api.put(`/admins/${id}`, { role: newRole });
    load();
  };

  const del = async (id) => {
    if (!window.confirm("Delete admin?")) return;
    await api.delete(`/admins/${id}`);
    load();
  };

  return (
    <div style={{ padding: 12 }}>
      <h3>Admin Users (superadmin)</h3>
      <div style={{ marginBottom:8 }}>
        <input placeholder="username" value={username} onChange={e=>setUsername(e.target.value)} />
        <input placeholder="password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
        <select value={role} onChange={e=>setRole(e.target.value)}>
          <option value="viewer">viewer</option>
          <option value="editor">editor</option>
          <option value="admin">admin</option>
          <option value="superadmin">superadmin</option>
        </select>
        <button onClick={create}>Create</button>
      </div>
      <ul>
        {admins.map(u => <li key={u.id}>{u.username} — {u.role} <button onClick={()=>changeRole(u.id)}>Change Role</button> <button onClick={()=>del(u.id)}>Delete</button></li>)}
      </ul>
    </div>
  );
}
