"use client";

import { motion } from "framer-motion";
import { FolderSearch, BarChart3, Clock, Settings2 } from "lucide-react";

const screens = [
  {
    title: "Organize",
    desc: "Scan & apply AI moves",
    icon: <FolderSearch className="w-5 h-5 text-[#00E5FF]" />,
    accent: "#00E5FF",
    preview: [
      { label: "Documents", count: 12, pct: 80 },
      { label: "Finance", count: 5, pct: 40 },
      { label: "Photos", count: 9, pct: 60 },
    ]
  },
  {
    title: "Insights",
    desc: "Duplicates & stale files",
    icon: <BarChart3 className="w-5 h-5 text-[#7C4DFF]" />,
    accent: "#7C4DFF",
    preview: [
      { label: "Duplicates", count: 3, pct: 30 },
      { label: "Stale (90d+)", count: 7, pct: 55 },
      { label: "Large files", count: 4, pct: 45 },
    ]
  },
  {
    title: "History",
    desc: "Full undo journal",
    icon: <Clock className="w-5 h-5 text-emerald-400" />,
    accent: "#34d399",
    preview: [
      { label: "Moved today", count: 18, pct: 90 },
      { label: "Undone", count: 2, pct: 15 },
      { label: "Total logged", count: 47, pct: 70 },
    ]
  },
  {
    title: "Settings",
    desc: "Rules, blocklist & prefs",
    icon: <Settings2 className="w-5 h-5 text-orange-400" />,
    accent: "#fb923c",
    preview: [
      { label: "Conventions", count: 4, pct: 50 },
      { label: "Blocked paths", count: 2, pct: 25 },
      { label: "Categories", count: 9, pct: 100 },
    ]
  },
];

export default function Screenshots() {
  return (
    <section className="py-24 relative overflow-hidden bg-[#05070B]">
      <div className="container mx-auto px-6 md:px-12 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-5xl font-display font-bold mb-6"
          >
            Every Screen <span className="text-gradient">Purpose-Built</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-gray-400 text-lg"
          >
            Four focused views — no clutter, no subscriptions. Just your files, organised.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {screens.map((screen, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="flex flex-col gap-4 group"
            >
              <div className="relative aspect-[9/16] rounded-2xl glass-card border border-white/10 overflow-hidden shadow-lg group-hover:-translate-y-2 transition-transform duration-300">
                <div className="absolute inset-0 bg-[#0D111C] flex flex-col">
                  {/* Fake top bar */}
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
                    {screen.icon}
                    <span className="text-white text-xs font-bold">{screen.title}</span>
                  </div>
                  {/* Simulated bars */}
                  <div className="flex-1 px-4 pt-4 flex flex-col gap-4">
                    {screen.preview.map((item, i) => (
                      <div key={i}>
                        <div className="flex justify-between mb-1">
                          <span className="text-gray-400 text-[10px]">{item.label}</span>
                          <span className="text-[10px] font-medium" style={{ color: screen.accent }}>{item.count}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${item.pct}%`, background: screen.accent, opacity: 0.7 }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Fake bottom action */}
                  <div className="px-4 pb-4">
                    <div
                      className="w-full py-2 rounded-lg text-[10px] font-bold text-center text-white"
                      style={{ background: `${screen.accent}22`, border: `1px solid ${screen.accent}44` }}
                    >
                      {screen.title} →
                    </div>
                  </div>
                </div>
              </div>
              <div className="text-center">
                <h3 className="text-white font-bold text-lg">{screen.title}</h3>
                <p className="text-gray-400 text-sm">{screen.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
