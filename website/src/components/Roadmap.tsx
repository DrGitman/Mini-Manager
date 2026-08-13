"use client";

import { motion } from "framer-motion";
import { CheckCircle2, CircleDashed, Rocket } from "lucide-react";

export default function Roadmap() {
  const roadmap = [
    {
      phase: "Phase 1: Core Organizer",
      status: "completed",
      icon: <CheckCircle2 className="text-green-400" size={24} />,
      items: [
        "FastAPI + Next.js architecture",
        "Groq llama-3.3-70b file classification",
        "Folder scanner & auto-organize",
        "Full undo journal & history"
      ]
    },
    {
      phase: "Phase 2: Intelligence Layer",
      status: "current",
      icon: <CircleDashed className="text-[#00E5FF] animate-spin-slow" size={24} />,
      items: [
        "Corrections memory (continuous learning)",
        "Natural-language conventions engine",
        "Sensitivity detection & flagging",
        "Blocklist & protected paths"
      ]
    },
    {
      phase: "Phase 3: Expansion",
      status: "upcoming",
      icon: <Rocket className="text-gray-500" size={24} />,
      items: [
        "Cloud folder sync (Google Drive, OneDrive)",
        "Scheduled auto-organize with cron",
        "Multi-user workspace support",
        "CLI mode & public API"
      ]
    }
  ];

  return (
    <section id="roadmap" className="py-24 relative overflow-hidden">
      <div className="container mx-auto px-6 md:px-12 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-5xl font-display font-bold mb-6"
          >
            Project <span className="text-[#00E5FF]">Roadmap</span>
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-gray-400 text-lg"
          >
            From hackathon prototype to a fully-featured AI file organizer.
          </motion.p>
        </div>

        <div className="max-w-4xl mx-auto relative">
          {/* Vertical Line */}
          <div className="absolute left-8 md:left-1/2 top-0 bottom-0 w-px bg-white/10 md:-translate-x-1/2" />

          <div className="space-y-12">
            {roadmap.map((milestone, index) => (
              <motion.div 
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className={`relative flex flex-col md:flex-row gap-8 ${
                  index % 2 === 0 ? "md:flex-row-reverse" : ""
                }`}
              >
                {/* Timeline Node */}
                <div className="absolute left-8 md:left-1/2 -translate-x-1/2 flex items-center justify-center w-12 h-12 rounded-full bg-[#0A0E17] border-[4px] border-[#0A0E17] z-10">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center glass-card border border-white/10 ${
                    milestone.status === 'completed' ? 'shadow-[0_0_15px_rgba(74,222,128,0.3)]' : 
                    milestone.status === 'current' ? 'shadow-[0_0_15px_rgba(0,229,255,0.3)]' : ''
                  }`}>
                    {milestone.icon}
                  </div>
                </div>

                <div className="ml-20 md:ml-0 md:w-1/2 flex flex-col">
                  <div className={`glass-card p-6 rounded-2xl border ${
                    milestone.status === 'current' ? 'border-[#00E5FF]/30' : 'border-white/5'
                  } ${index % 2 === 0 ? 'md:ml-12' : 'md:mr-12'}`}>
                    <h3 className={`text-xl font-bold mb-4 ${
                      milestone.status === 'current' ? 'text-[#00E5FF]' : 'text-white'
                    }`}>
                      {milestone.phase}
                    </h3>
                    <ul className="space-y-3">
                      {milestone.items.map((item, i) => (
                        <li key={i} className="flex items-start gap-3 text-gray-400">
                          <div className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                            milestone.status === 'completed' ? 'bg-green-400' :
                            milestone.status === 'current' ? 'bg-[#00E5FF]' : 'bg-gray-600'
                          }`} />
                          <span className={milestone.status === 'completed' ? 'line-through opacity-70' : ''}>
                            {item}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
