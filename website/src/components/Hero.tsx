"use client";

import { motion } from "framer-motion";
import { ArrowDown, Download, Play, Sparkles } from "lucide-react";
import Image from "next/image";

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center pt-24 pb-12 overflow-hidden">
      {/* Animated Background Mesh */}
      <div className="absolute inset-0 overflow-hidden z-0 pointer-events-none">
        <div className="absolute -top-1/4 -right-1/4 w-[1000px] h-[1000px] rounded-full bg-[#7C4DFF]/10 blur-[120px] animate-pulse" />
        <div className="absolute -bottom-1/4 -left-1/4 w-[800px] h-[800px] rounded-full bg-[#00E5FF]/10 blur-[100px] animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <div className="container mx-auto px-6 md:px-12 relative z-10 flex flex-col lg:flex-row items-center gap-16">
        {/* Text Content */}
        <div className="flex-1 text-center lg:text-left mt-12 lg:mt-0">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-light dark:glass border-[#00E5FF]/30 mb-8"
          >
            <Sparkles className="w-4 h-4 text-[#00E5FF]" />
            <span className="text-sm font-medium tracking-wide">AI File Organizer for Windows &amp; Web</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-5xl md:text-7xl font-display font-bold leading-[1.1] tracking-tight mb-6"
          >
            Your AI-Powered
            <br />
            <span className="text-gradient">File Organizer</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-lg md:text-xl text-gray-400 mb-10 max-w-2xl mx-auto lg:mx-0 leading-relaxed"
          >
            Mini Manager scans any folder, classifies every file with AI, and auto-organizes them into the right place — with confidence scores, sensitivity detection, and full undo history.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 mb-12"
          >
            <a
              href="#demo"
              className="w-full sm:w-auto px-8 py-4 rounded-full bg-gradient-to-r from-[#00E5FF] to-[#7C4DFF] text-white font-bold text-lg flex items-center justify-center gap-2 hover:shadow-[0_0_30px_rgba(0,229,255,0.4)] transition-all transform hover:-translate-y-1"
            >
              <Play fill="currentColor" size={20} />
              Try Online Demo
            </a>
            
            <a
              href="#downloads"
              className="w-full sm:w-auto px-8 py-4 rounded-full glass hover:bg-white/10 text-white font-bold text-lg flex items-center justify-center gap-2 transition-all border border-white/10 hover:border-white/20"
            >
              <Download size={20} />
              Download App
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.6 }}
            className="flex items-center justify-center lg:justify-start gap-6 text-gray-500 text-sm font-medium"
          >
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Windows Desktop Ready
            </span>
            <span className="hidden sm:inline">|</span>
            <a href="https://github.com/DrGitman/Mini-Manager" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
              View on GitHub →
            </a>
          </motion.div>
        </div>

        {/* Hero Visual / Phone Mockup */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, rotateY: -15 }}
          animate={{ opacity: 1, scale: 1, rotateY: 0 }}
          transition={{ duration: 1, type: "spring", bounce: 0.4 }}
          className="flex-1 w-full max-w-[500px] perspective-1000"
        >
          <div className="relative w-full aspect-[1/2] max-h-[700px] mx-auto">
            {/* Phone Frame */}
            <div className="absolute inset-0 rounded-[3rem] border-8 border-gray-900 bg-gray-950 overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-10">
              <div className="absolute top-0 inset-x-0 h-7 bg-gray-900 z-20 rounded-b-3xl w-1/2 mx-auto" />
              
              {/* App Preview */}
              <div className="absolute inset-0 bg-[#0A0E17] flex flex-col">
                {/* App top bar */}
                <div className="flex items-center gap-2 px-4 pt-10 pb-3 border-b border-white/5">
                  <Image src="/logo-white-full.png" alt="Mini Manager" width={100} height={28} className="object-contain" />
                </div>
                {/* Simulated file list */}
                <div className="flex-1 px-3 py-3 overflow-hidden flex flex-col gap-2">
                  {[
                    { name: "Invoice_Q3.pdf", cat: "Finance", conf: 96, color: "#00E5FF" },
                    { name: "resume_final.docx", cat: "Career", conf: 91, color: "#7C4DFF" },
                    { name: "photo_trip.jpg", cat: "Photos", conf: 88, color: "#FF6D00" },
                    { name: "lecture_notes.txt", cat: "School", conf: 94, color: "#00E5FF" },
                    { name: "budget_2024.xlsx", cat: "Finance", conf: 97, color: "#00E5FF" },
                  ].map((f) => (
                    <div key={f.name} className="flex items-center gap-2 p-2 rounded-lg bg-white/5 border border-white/5">
                      <div className="w-7 h-7 rounded-md flex-shrink-0" style={{ background: `${f.color}22`, border: `1px solid ${f.color}44` }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-[10px] font-medium truncate">{f.name}</p>
                        <p className="text-[10px]" style={{ color: f.color }}>{f.cat}</p>
                      </div>
                      <span className="text-[9px] text-gray-400 flex-shrink-0">{f.conf}%</span>
                    </div>
                  ))}
                </div>
                {/* Bottom action bar */}
                <div className="px-3 pb-4">
                  <div className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#00E5FF] to-[#7C4DFF] text-white text-[11px] font-bold text-center">
                    Organize 5 Files →
                  </div>
                </div>
              </div>
            </div>
            
            {/* Glowing effect behind phone */}
            <div className="absolute inset-4 bg-gradient-to-r from-[#00E5FF] to-[#7C4DFF] rounded-[3rem] blur-2xl opacity-40 z-0" />
            
            {/* Floating Gemini Badge */}
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
              className="absolute -right-6 top-1/4 glass-card p-4 rounded-2xl z-20 flex items-center gap-3 border border-white/10 shadow-xl"
            >
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                <Sparkles className="text-[#00E5FF]" size={20} />
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium">Powered by</p>
                <p className="text-sm text-white font-bold">Groq + Gemini</p>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 1 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
      >
        <span className="text-xs text-gray-500 font-medium uppercase tracking-widest">Scroll to explore</span>
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        >
          <ArrowDown className="text-gray-400" size={20} />
        </motion.div>
      </motion.div>
    </section>
  );
}
