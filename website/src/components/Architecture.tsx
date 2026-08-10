"use client";

import { motion } from "framer-motion";
import { Database, Server, Smartphone, Lock, Code2, Cloud } from "lucide-react";

export default function Architecture() {
  const stack = [
    { name: "Flutter App", icon: <Smartphone className="text-[#00E5FF]" />, desc: "Cross-platform frontend" },
    { name: "Firebase Auth", icon: <Lock className="text-yellow-400" />, desc: "Secure authentication" },
    { name: "Firestore", icon: <Database className="text-orange-400" />, desc: "Realtime NoSQL database" },
    { name: "Cloud Functions", icon: <Server className="text-blue-400" />, desc: "Serverless backend logic" },
    { name: "Gemini API", icon: <BrainCircuit className="text-[#7C4DFF]" />, desc: "AI intelligence layer" },
    { name: "Firebase Storage", icon: <Cloud className="text-gray-300" />, desc: "Secure file storage" },
  ];

  // Quick fallback icon component since BrainCircuit isn't in this import list
  function BrainCircuit(props: any) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
      >
        <path d="M12 4.5a2.5 2.5 0 0 0-4.96-.46 2.5 2.5 0 0 0-1.98 3 2.5 2.5 0 0 0-1.32 4.24 3 3 0 0 0 .34 5.58 2.5 2.5 0 0 0 2.96 3.08 2.5 2.5 0 0 0 4.91.05L12 20V4.5Z" />
        <path d="M16 8V5c0-1.1.9-2 2-2" />
        <path d="M12 13h4" />
        <path d="M12 17h6" />
        <path d="M19 13v4" />
        <path d="M22 13h-3" />
        <path d="M22 17h-3" />
      </svg>
    );
  }

  return (
    <section id="architecture" className="py-24 relative overflow-hidden">
      <div className="container mx-auto px-6 md:px-12 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-5xl font-display font-bold mb-6"
          >
            Built on <span className="text-[#00E5FF]">Google Cloud</span>
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-gray-400 text-lg"
          >
            A scalable, secure, and modern architecture leveraging the Google ecosystem for maximum performance and reliability.
          </motion.p>
        </div>

        <div className="relative max-w-5xl mx-auto">
          {/* Central Architecture Flow */}
          <div className="hidden md:flex justify-between items-center mb-16 relative">
            <div className="absolute left-10 right-10 top-1/2 -translate-y-1/2 h-0.5 bg-gradient-to-r from-[#00E5FF]/20 via-[#7C4DFF]/50 to-[#00E5FF]/20 z-0" />
            
            {["App", "API", "AI", "Database"].map((step, i) => (
              <motion.div
                key={step}
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className="w-24 h-24 rounded-2xl glass-card flex items-center justify-center border border-white/10 relative z-10 shadow-xl"
              >
                <span className="font-display font-bold text-white">{step}</span>
              </motion.div>
            ))}
          </div>

          {/* Grid of Technologies */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            {stack.map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="bg-white/5 border border-white/5 rounded-xl p-6 hover:bg-white/10 transition-colors flex flex-col items-center text-center group"
              >
                <div className="w-12 h-12 rounded-lg bg-[#0A0E17] flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  {item.icon}
                </div>
                <h4 className="text-white font-bold mb-1">{item.name}</h4>
                <p className="text-gray-400 text-sm">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
