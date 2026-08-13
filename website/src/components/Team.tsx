"use client";

import { motion } from "framer-motion";
import { Code2, GitBranch, ExternalLink } from "lucide-react";
import Image from "next/image";

const contributions = [
  { label: "Full-stack architecture", detail: "FastAPI + Next.js + SQLite" },
  { label: "AI integration", detail: "Groq llama-3.3-70b + Gemini" },
  { label: "Desktop app", detail: "Electron wrapper + auto-updater" },
  { label: "UI/UX design", detail: "Tailwind + shadcn/ui components" },
];

export default function Team() {
  return (
    <section id="team" className="py-24 relative overflow-hidden bg-[#05070B]">
      <div className="container mx-auto px-6 md:px-12 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-5xl font-display font-bold mb-6"
          >
            Built by <span className="text-gradient">one dev</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-gray-400 text-lg"
          >
            Mini Manager was designed, engineered, and shipped solo for the Build with Gemini hackathon.
          </motion.p>
        </div>

        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass-card rounded-3xl p-8 md:p-12 border border-white/10 flex flex-col md:flex-row items-center md:items-start gap-10"
          >
            {/* Avatar */}
            <div className="flex flex-col items-center gap-4 flex-shrink-0">
              <div className="w-28 h-28 rounded-2xl overflow-hidden border-2 border-[#00E5FF]/30 shadow-[0_0_30px_rgba(0,229,255,0.15)]">
                <Image
                  src={`https://github.com/DrGitman.png`}
                  alt="DrGitman"
                  width={112}
                  height={112}
                  className="w-full h-full object-cover"
                  unoptimized
                />
              </div>
              <div className="text-center">
                <h3 className="text-xl font-bold text-white">DrGitman</h3>
                <p className="text-[#00E5FF] text-sm font-medium">Full-stack Developer</p>
              </div>
              <a
                href="https://github.com/DrGitman/Mini-Manager"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-full glass border border-white/10 text-gray-300 hover:text-white text-sm transition-colors"
              >
                <GitBranch size={16} />
                GitHub
                <ExternalLink size={12} className="text-gray-500" />
              </a>
            </div>

            {/* Contributions */}
            <div className="flex-1 w-full">
              <h4 className="text-white font-bold text-lg mb-6">What went into this</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {contributions.map((c, i) => (
                  <div key={i} className="flex items-start gap-3 p-4 rounded-xl bg-white/5 border border-white/5">
                    <Code2 size={16} className="text-[#00E5FF] mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-white text-sm font-medium">{c.label}</p>
                      <p className="text-gray-500 text-xs mt-0.5">{c.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
