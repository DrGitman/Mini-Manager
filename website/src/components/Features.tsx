"use client";

import { motion } from "framer-motion";
import {
  FolderSearch,
  BrainCircuit,
  ShieldAlert,
  Undo2,
  ScrollText,
  BarChart3,
  MessageSquareText,
  FolderEdit,
  Ban
} from "lucide-react";

const features = [
  {
    icon: <FolderSearch className="w-6 h-6" />,
    title: "Folder Scanner",
    description: "Scan any folder and let the AI classify every file into categories: Documents, Images, Videos, Code, Finance, and more.",
    color: "text-blue-400"
  },
  {
    icon: <BrainCircuit className="w-6 h-6" />,
    title: "AI Auto-Organize",
    description: "Files are automatically moved to the right folders with smart naming. Confidence buckets let you review borderline decisions before applying.",
    color: "text-[#00E5FF]"
  },
  {
    icon: <ShieldAlert className="w-6 h-6" />,
    title: "Sensitivity Detection",
    description: "Flags personal, financial, and identity documents before moving them, so nothing sensitive gets relocated without your approval.",
    color: "text-purple-400"
  },
  {
    icon: <Undo2 className="w-6 h-6" />,
    title: "Full Undo & History",
    description: "Every file operation is logged in a journal. Roll back any move, rename, or organization action instantly — no data ever lost.",
    color: "text-emerald-400"
  },
  {
    icon: <ScrollText className="w-6 h-6" />,
    title: "Conventions & Rules",
    description: "Write natural-language rules like \"Put all invoices in Finance/Invoices/2026\" — the AI always follows them on every scan.",
    color: "text-orange-400"
  },
  {
    icon: <BarChart3 className="w-6 h-6" />,
    title: "Insights",
    description: "Detect duplicate files and stale files untouched for 90+ days. Get a clear picture of what's cluttering your storage.",
    color: "text-pink-400"
  },
  {
    icon: <MessageSquareText className="w-6 h-6" />,
    title: "AI Chat Agent",
    description: "Give natural language commands like \"move all PDFs from Downloads to Documents\" and watch the AI handle it for you.",
    color: "text-yellow-400"
  },
  {
    icon: <FolderEdit className="w-6 h-6" />,
    title: "Corrections Memory",
    description: "Every time you correct an AI decision, Mini Manager learns from it — improving classifications across all future scans.",
    color: "text-cyan-400"
  },
  {
    icon: <Ban className="w-6 h-6" />,
    title: "Blocklist",
    description: "Define protected paths that the AI will never touch. Keep sensitive directories completely off-limits, always.",
    color: "text-red-400"
  }
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
};

export default function Features() {
  return (
    <section id="features" className="py-24 relative overflow-hidden bg-[#0A0E17]">
      {/* Background element */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-[500px] bg-gradient-to-b from-[#7C4DFF]/5 to-transparent rounded-[100%] blur-[100px] pointer-events-none" />
      
      <div className="container mx-auto px-6 md:px-16 max-w-7xl relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center px-4 py-1.5 rounded-full bg-[#171c2f] border border-[#3c4561] text-xs font-bold tracking-widest text-[#9198b7] uppercase mb-6"
          >
            CAPABILITIES
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-5xl font-display font-bold mb-6 text-[#edeef3]"
          >
            Why <span className="text-[#00E5FF]">Mini Manager?</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-[#9198b7] text-lg"
          >
            Everything you need to take back control of your file system — powered by Groq and Gemini AI working together to classify, organize, and protect your files.
          </motion.p>
        </div>

        <motion.div 
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {features.map((feature, index) => (
            <motion.div 
              key={index}
              variants={itemVariants}
              className="bg-[#171c2f] border border-[#3c4561] rounded-2xl p-8 group hover:border-[#00E5FF]/40 hover:bg-[#1a2038] transition-all duration-300 relative overflow-hidden"
            >
              <div className={`w-14 h-14 rounded-xl bg-[#0d1020] flex items-center justify-center mb-6 border border-[#3c4561] ${feature.color}`}>
                {feature.icon}
              </div>

              <h3 className="text-xl font-display font-bold text-[#edeef3] mb-3 group-hover:text-[#00E5FF] transition-colors">
                {feature.title}
              </h3>

              <p className="text-[#9198b7] leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
