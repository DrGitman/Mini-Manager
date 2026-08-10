"use client";

import { motion } from "framer-motion";

export default function Screenshots() {
  const screenshots = [
    { title: "Dashboard", desc: "Your daily overview" },
    { title: "Task Manager", desc: "AI-prioritized lists" },
    { title: "Budget Tracker", desc: "Financial insights" },
    { title: "Chat Interface", desc: "Talk to Gemini" },
  ];

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
            Beautifully <span className="text-gradient">Designed</span>
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-gray-400 text-lg"
          >
            A clean, intuitive interface that gets out of your way and lets the AI do the heavy lifting.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {screenshots.map((shot, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="flex flex-col gap-4 group"
            >
              <div className="relative aspect-[9/16] rounded-2xl glass-card border border-white/10 overflow-hidden shadow-lg group-hover:-translate-y-2 transition-transform duration-300">
                <div className="absolute inset-0 bg-gradient-to-br from-[#111827] to-[#0A0E17] flex flex-col items-center justify-center p-6 text-center">
                  <div className="w-12 h-12 bg-white/5 rounded-full border border-white/10 flex items-center justify-center mb-4">
                    <span className="text-gray-500 font-display font-bold">{index + 1}</span>
                  </div>
                  <p className="text-gray-500 text-sm font-medium">Screenshot Placeholder</p>
                </div>
              </div>
              <div className="text-center">
                <h3 className="text-white font-bold text-lg">{shot.title}</h3>
                <p className="text-gray-400 text-sm">{shot.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
