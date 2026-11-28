"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/util";

// Loads published jobs from the serverless API.
export default function useJobs() {
  const [jobs, setJobs] = useState(null);
  useEffect(() => { api("/api/jobs").then((d) => setJobs(d.jobs)).catch(() => setJobs([])); }, []);
  return jobs;
}
export const byDeadline = (a, b) => (a.deadline || "").localeCompare(b.deadline || "");
