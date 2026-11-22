"use client";
import { useState } from "react";
import { api } from "@/lib/util";

export default function Contact() {
  const [msg, setMsg] = useState(null);

  async function submit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = Object.fromEntries(new FormData(form));
    try {
      await api("/api/messages", { method: "POST", body: f });
      form.reset();
      setMsg({ ok: true, text: "Thank you — your message has been sent to the admin." });
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    }
  }

  return (
    <main className="page">
      <h1>Contact Us</h1>
      <p>Found a wrong deadline? Spotted a fake ad? Or have a question about a listing? Send us a message — the admin reads every message.</p>
      <p className="notice">Please never send money, or share bank or password details, with anyone about a job. This form is for messages only.</p>
      <div className="form-card" style={{ maxWidth: "100%" }}>
        <form onSubmit={submit}>
          <label>Your name *</label><input name="name" required maxLength={100} />
          <label>Your email *</label><input name="email" type="email" required />
          <label>Subject *</label><input name="subject" required maxLength={200} placeholder="e.g. Wrong last date on the MES listing" />
          <label>Message *</label><textarea name="message" required maxLength={5000} placeholder="Tell us what you found, with the job title and a link if you have one." />
          <p><button className="btn btn-dark btn-block" type="submit">Send message</button></p>
          {msg && <p className={msg.ok ? "success" : "error"}>{msg.text}</p>}
        </form>
      </div>
    </main>
  );
}
