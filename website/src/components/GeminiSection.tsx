"use client";

import { motion } from "framer-motion";
import { CheckCircle2, Sparkles, ArrowRight, BrainCircuit } from "lucide-react";

export default function GeminiSection() {
  const geminiFeatures = [
    "File classification at scale (Groq llama-3.3-70b)",
    "Deep file understanding & explanation (Gemini)",
    "Confidence scoring per classification",
    "Sensitivity flagging for personal documents",
    "Corrections memory & continuous learning",
    "Natural language conventions engine",
    "AI chat agent for file operations",
    "Onboarding style inference from first scan"
  ];

  return (
    <section id="gemini" className="py-24 relative overflow-hidden bg-[#0A0E17]">
      {/* Background gradients */}
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-[#00E5FF]/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-[#7C4DFF]/5 rounded-full blur-[100px] pointer-events-none" />
      
      <div className="container mx-auto px-6 md:px-16 max-w-7xl relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center px-4 py-1.5 rounded-full bg-[#171c2f] border border-[#3c4561] text-xs font-bold tracking-widest text-[#9198b7] uppercase mb-6"
          >
            AI INTELLIGENCE
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-5xl font-display font-bold mb-6 text-[#edeef3]"
          >
            Dual AI <span className="text-gradient">Intelligence Layer</span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-[#bec2d3] text-lg leading-relaxed font-medium bg-[#171c2f] p-6 rounded-2xl border border-[#3c4561] shadow-xl"
          >
            Mini Manager uses two AI models working in tandem. Groq's llama-3.3-70b handles
            high-speed file classification at scale — reading filenames, extensions, sizes, and
            content previews to assign categories instantly. Google Gemini provides deep file
            understanding and explanation, powering the AI chat agent, natural-language rules
            engine, and onboarding style inference.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Capabilities Grid */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <h3 className="text-2xl font-display font-bold text-white mb-8 flex items-center gap-3">
              <BrainCircuit className="text-[#00E5FF]" />
              Intelligence Layer Capabilities
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
              {geminiFeatures.map((feature, index) => (
                <motion.div 
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-[#171c2f] transition-colors"
                >
                  <CheckCircle2 className="text-[#00E5FF] shrink-0" size={20} />
                  <span className="text-[#bec2d3] font-medium">{feature}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Interactive Flow Diagram */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="bg-[#171c2f] border border-[#3c4561] rounded-2xl p-8 relative hover:border-[#00E5FF]/40 transition-colors"
          >
            <h3 className="text-xl font-display font-bold text-white mb-8 text-center">
              How It Works
            </h3>
            
            <div className="flex flex-col space-y-6">
              {/* Step 1: User scans folder */}
              <div className="flex items-center justify-between">
                <div className="flex-1" />
                <div className="w-10 flex justify-center">
                  <ArrowRight className="text-gray-600 rotate-90 sm:rotate-0" />
                </div>
                <div className="flex-1 bg-[#0d1020] border border-[#3c4561] rounded-xl p-4 text-center">
                  <p className="text-[#edeef3] font-medium text-sm">User Scans Folder</p>
                  <p className="text-[#9198b7] text-xs mt-1">Select any directory</p>
                </div>
              </div>

              {/* Step 2: Mini Manager reads metadata */}
              <div className="flex items-center justify-between">
                <div className="flex-1 bg-gradient-to-r from-[#7C4DFF]/20 to-[#7C4DFF]/10 border border-[#7C4DFF]/30 rounded-xl p-4 text-center order-3 sm:order-1">
                  <p className="text-[#edeef3] font-medium text-sm">Mini Manager</p>
                  <p className="text-[#9198b7] text-xs mt-1">Reads file metadata</p>
                </div>
                <div className="w-10 flex justify-center order-2">
                  <ArrowRight className="text-[#7C4DFF] rotate-90 sm:rotate-0" />
                </div>
                <div className="flex-1 order-1 sm:order-3" />
              </div>

              {/* Step 3: Groq classifies */}
              <div className="flex items-center justify-between">
                <div className="flex-1" />
                <div className="w-10 flex justify-center">
                  <ArrowRight className="text-[#00E5FF] rotate-90 sm:rotate-0" />
                </div>
                <div className="flex-1 bg-gradient-to-r from-[#00E5FF]/20 to-[#00E5FF]/10 border border-[#00E5FF]/30 rounded-xl p-4 text-center relative overflow-hidden group">
                  <div className="absolute inset-0 bg-[#00E5FF]/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out" />
                  <p className="text-white font-medium text-sm flex items-center justify-center gap-2">
                    <Sparkles size={14} className="text-[#00E5FF]" />
                    Groq llama-3.3-70b
                  </p>
                  <p className="text-[#9198b7] text-xs mt-1">Classifies every file</p>
                </div>
              </div>

              {/* Step 4: Results with confidence scores */}
              <div className="flex items-center justify-between">
                <div className="flex-1 bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-center order-3 sm:order-1">
                  <p className="text-[#edeef3] font-medium text-sm">Results &amp; Confidence</p>
                  <p className="text-[#9198b7] text-xs mt-1">Auto-apply, Review, or Input</p>
                </div>
                <div className="w-10 flex justify-center order-2">
                  <ArrowRight className="text-green-500 rotate-90 sm:rotate-0" />
                </div>
                <div className="flex-1 order-1 sm:order-3" />
              </div>
            </div>
            
            {/* Animated connection lines (decorative) */}
            <div className="absolute left-[50%] top-[100px] bottom-[100px] w-px bg-gradient-to-b from-transparent via-white/10 to-transparent hidden sm:block" />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
