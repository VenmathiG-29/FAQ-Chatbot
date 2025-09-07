import React, { useEffect, useState } from "react";
import api from "./api";

export default function AdminFAQManager() {
  const [faqs, setFaqs] = useState([]);
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState("");
  const [a, setA] = useState("");

  const load = async () => {
    const r = await api.get("/faqs");
    setFaqs(r.data.faqs || []);
  };
  useEffect(()=>{ load(); }, []);

  const createFaq = async () => {
    if (!q.trim() || !a.trim()) return alert("Provide question and answer");
    await api.post("/faqs", { question: q, answer: a });
    setQ(""); setA(""); load();
  };

  const startEdit = (f) => { setEditing(f); setQ(f.question); setA(f.answer); };
  const saveEdit = async () => {
    await api.put(`/faqs/${editing.id}`, { question: q, answer: a });
    setEditing(null); setQ(""); setA(""); load();
  };

  const deleteFaq = async (id) => {
    if (!window.confirm("Delete FAQ?")) return;
    await api.delete(`/faqs/${id}`);
    load();
  };

  return (
    <div style={{ padding: 12 }}>
      <h3>FAQ Manager</h3>
      <div style={{ marginBottom: 12 }}>
        <input placeholder="Question" value={q} onChange={e=>setQ(e.target.value)} style={{width:'45%'}} />
        <input placeholder="Answer" value={a} onChange={e=>setA(e.target.value)} style={{width:'45%', marginLeft:8}} />
        {editing ? <><button onClick={saveEdit}>Save</button><button onClick={()=>{setEditing(null);setQ('');setA('');}}>Cancel</button></> : <button onClick={createFaq}>Add FAQ</button>}
      </div>
      <ul>
        {faqs.map(f => <li key={f.id}><b>{f.question}</b><br /><small>{f.answer}</small><br />
          <button onClick={()=>startEdit(f)}>Edit</button>
          <button onClick={()=>deleteFaq(f.id)} style={{marginLeft:8}}>Delete</button>
        </li>)}
      </ul>
    </div>
  );
}
