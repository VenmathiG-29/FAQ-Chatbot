import React, { useState } from "react";

export default function Chatbot() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");

  const send = async () => {
    if (!input.trim()) return;
    const userMsg = { sender: "user", text: input };
    setMessages(prev => [...prev, userMsg]);

    try {
      const res = await fetch(`${process.env.REACT_APP_API_BASE || "http://localhost:5000"}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input })
      });
      const data = await res.json();
      const botMsg = { sender: "bot", text: data.reply, source: data.source, original: input };
      setMessages(prev => [...prev, botMsg]);
    } catch (e) {
      setMessages(prev => [...prev, { sender: "bot", text: "⚠️ Server error", original: input }]);
    }
    setInput("");
  };

  const sendFeedback = async (question, fb) => {
    await fetch(`${process.env.REACT_APP_API_BASE || "http://localhost:5000"}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, feedback: fb })
    });
    alert("Thanks for your feedback ✅");
  };

  return (
    <div style={{ maxWidth: 700, margin: "40px auto" }}>
      <h2>🤖 FAQ Chatbot</h2>
      <div style={{ border: "1px solid #ddd", padding: 12, minHeight: 300 }}>
        <div style={{ maxHeight: 220, overflowY: "auto", marginBottom: 12 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ textAlign: m.sender === "user" ? "right" : "left", margin: 6 }}>
              <div><b>{m.sender}</b>: {m.text}</div>
              {m.sender === "bot" && (
                <div>
                  <button onClick={() => sendFeedback(m.original, "👍")}>👍</button>
                  <button onClick={() => sendFeedback(m.original, "👎")}>👎</button>
                </div>
              )}
            </div>
          ))}
        </div>
        <div>
          <input style={{ width: "75%" }} value={input} onChange={e => setInput(e.target.value)} placeholder="Ask something..." />
          <button onClick={send} style={{ width: "22%", marginLeft: "3%" }}>Send</button>
        </div>
      </div>
    </div>
  );
}
