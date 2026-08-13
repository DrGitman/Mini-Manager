"use client";

import { motion } from "framer-motion";
import { ArrowDown, Download, Play } from "lucide-react";

const files = [
  { name: "Invoice_Q3_2025.pdf", cat: "Finance", conf: 96, color: "#00E5FF", ext: "PDF" },
  { name: "resume_final_v3.docx", cat: "Career", conf: 91, color: "#7C4DFF", ext: "DOC" },
  { name: "vacation_photos.zip", cat: "Photos", conf: 88, color: "#34d399", ext: "ZIP" },
  { name: "lecture_notes_week4.txt", cat: "School", conf: 94, color: "#00E5FF", ext: "TXT" },
  { name: "budget_tracker_2025.xlsx", cat: "Finance", conf: 97, color: "#00E5FF", ext: "XLS" },
  { name: "project_spec_draft.docx", cat: "Work", conf: 85, color: "#fb923c", ext: "DOC" },
];

const sidebarItems = [
  { label: "Organize", active: true },
  { label: "Insights", active: false },
  { label: "History", active: false },
  { label: "Settings", active: false },
];

const stats = [
  { label: "5 AI Models" },
  { label: "Full Undo" },
  { label: "Open Source" },
  { label: "No Subscription" },
];

export default function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col items-center pt-40 pb-16 overflow-hidden">
      {/* Animated Background Mesh */}
      <div className="absolute inset-0 overflow-hidden z-0 pointer-events-none">
        <div className="absolute -top-1/4 -right-1/4 w-[900px] h-[900px] rounded-full bg-[#7C4DFF]/8 blur-[120px]" />
        <div className="absolute -bottom-1/4 -left-1/4 w-[700px] h-[700px] rounded-full bg-[#00E5FF]/8 blur-[100px]" />
      </div>

      <div className="container mx-auto px-6 md:px-16 max-w-7xl relative z-10 flex flex-col items-center text-center">

        {/* Eyebrow pill */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#171c2f] border border-[#3c4561] text-xs font-bold tracking-widest text-[#9198b7] uppercase mb-8"
        >
          AI FILE ORGANIZER FOR WINDOWS &amp; WEB
        </motion.div>

        {/* H1 */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-5xl md:text-7xl font-display font-bold leading-[1.05] tracking-tight mb-6 text-[#edeef3]"
        >
          Your AI-Powered
          <br />
          <span className="text-gradient">File Organizer</span>
        </motion.h1>

        {/* Subtext */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-lg md:text-xl text-[#9198b7] mb-10 max-w-2xl leading-relaxed"
        >
          Mini Manager scans any folder, classifies every file with AI, and auto-organizes them into the right place — with confidence scores, sensitivity detection, and full undo history.
        </motion.p>

        {/* CTA row */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12"
        >
          <a
            href="#demo"
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-[#00E5FF] to-[#7C4DFF] text-white font-bold text-base flex items-center justify-center gap-2 hover:opacity-90 transition-all"
          >
            <Play fill="currentColor" size={18} />
            Try Online Demo
          </a>
          <a
            href="#downloads"
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#171c2f] border border-[#3c4561] text-[#bec2d3] font-bold text-base flex items-center justify-center gap-2 hover:border-[#00E5FF]/40 hover:bg-[#1a2038] transition-all"
          >
            <Download size={18} />
            Download App
          </a>
        </motion.div>

        {/* Stats row */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.45 }}
          className="flex flex-wrap items-center justify-center gap-6 mb-16"
        >
          {stats.map((s, i) => (
            <span key={i} className="flex items-center gap-2 text-sm font-medium text-[#9198b7]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00E5FF]" />
              {s.label}
            </span>
          ))}
        </motion.div>

        {/* Wide app preview card */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.55, type: "spring", bounce: 0.2 }}
          className="w-full max-w-5xl"
        >
          <div className="rounded-2xl bg-[#171c2f] border border-[#3c4561] overflow-hidden shadow-2xl">
            {/* Title bar */}
            <div className="flex items-center gap-2 px-4 py-3 bg-[#0d1020] border-b border-[#3c4561]">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/70" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
                <div className="w-3 h-3 rounded-full bg-green-500/70" />
              </div>
              <div className="flex-1 mx-4 h-6 rounded-md bg-[#1a2038] border border-[#3c4561] flex items-center px-3">
                <span className="text-xs text-[#9198b7] font-mono">Mini Manager — Organize</span>
              </div>
            </div>

            {/* App body: sidebar + content */}
            <div className="flex min-h-[340px]">
              {/* Sidebar */}
              <div className="w-44 border-r border-[#3c4561] bg-[#0d1020] flex flex-col py-4 gap-1 flex-shrink-0 hidden sm:flex">
                {sidebarItems.map((item) => (
                  <div
                    key={item.label}
                    className={`mx-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      item.active
                        ? "bg-[#00E5FF]/10 text-[#00E5FF] border border-[#00E5FF]/20"
                        : "text-[#9198b7] hover:text-[#bec2d3]"
                    }`}
                  >
                    {item.label}
                  </div>
                ))}
              </div>

              {/* File list area */}
              <div className="flex-1 p-5 flex flex-col gap-3 overflow-x-auto">
                {/* Table header */}
                <div className="flex items-center gap-4 px-3 pb-2 border-b border-[#3c4561]">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-[#9198b7] flex-1">File</span>
                  <span className="text-[11px] font-bold uppercase tracking-widest text-[#9198b7] w-20 hidden md:block">Category</span>
                  <span className="text-[11px] font-bold uppercase tracking-widest text-[#9198b7] w-28">Confidence</span>
                </div>

                {files.map((f, i) => (
                  <motion.div
                    key={f.name}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.7 + i * 0.07 }}
                    className="flex items-center gap-4 px-3 py-2.5 rounded-lg bg-[#0d1020] border border-[#3c4561] hover:border-[#00E5FF]/30 transition-colors"
                  >
                    {/* Extension badge */}
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                      style={{ background: `${f.color}18`, border: `1px solid ${f.color}40`, color: f.color }}
                    >
                      {f.ext}
                    </div>

                    {/* Name */}
                    <span className="text-sm text-[#edeef3] font-medium flex-1 truncate min-w-0">{f.name}</span>

                    {/* Category */}
                    <span
                      className="text-xs font-medium w-20 hidden md:block flex-shrink-0"
                      style={{ color: f.color }}
                    >
                      {f.cat}
                    </span>

                    {/* Confidence bar */}
                    <div className="w-28 flex-shrink-0 flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-[#3c4561] overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${f.conf}%`, background: f.color, opacity: 0.8 }}
                        />
                      </div>
                      <span className="text-xs text-[#9198b7] w-8 text-right">{f.conf}%</span>
                    </div>
                  </motion.div>
                ))}

                {/* Organize button row */}
                <div className="flex justify-end mt-2">
                  <div className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#00E5FF] to-[#7C4DFF] text-white text-sm font-bold cursor-pointer hover:opacity-90 transition-all">
                    Organize 6 Files →
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 1 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
      >
        <span className="text-xs text-[#9198b7] font-medium uppercase tracking-widest">Scroll to explore</span>
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        >
          <ArrowDown className="text-[#9198b7]" size={18} />
        </motion.div>
      </motion.div>
    </section>
  );
}
