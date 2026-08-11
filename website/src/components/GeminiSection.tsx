"use client";

import { motion } from "framer-motion";
import { CheckCircle2, Sparkles, ArrowRight, BrainCircuit } from "lucide-react";

export default function GeminiSection() {
  const geminiFeatures = [
    "Smart task prioritization",
    "Natural language understanding",
    "Daily planning & scheduling",
    "Document summarization",
    "Goal tracking & analytics",
    "Personalized recommendations",
    "Budget insights & coaching",
    "Conversational AI assistant"
  ];

  return (
    <section id="gemini" className="py-24 relative overflow-hidden bg-[#0A0E17]">
      {/* Background gradients */}
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-[#00E5FF]/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-[#7C4DFF]/5 rounded-full blur-[100px] pointer-events-none" />
      
      <div className="container mx-auto px-6 md:px-12 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/5 border border-white/10 mb-6 shadow-[0_0_30px_rgba(255,255,255,0.05)]"
          >
            <Sparkles className="w-8 h-8 text-white" />
          </motion.div>
          
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-5xl font-display font-bold mb-6"
          >
            Powered by <span className="text-gradient">Google Gemini</span>
          </motion.h2>
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-gray-300 text-lg leading-relaxed font-medium bg-white/5 p-6 rounded-2xl border border-white/10 glass shadow-xl"
          >
            Mini Manager uses Google's Gemini models to power conversational assistance, 
            intelligent scheduling, personalized recommendations, document understanding, 
            financial insights, and contextual decision-making. Gemini enables natural 
            language interaction throughout the application, allowing users to manage 
            their daily lives without learning complex menus or commands.
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
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors"
                >
                  <CheckCircle2 className="text-[#00E5FF] shrink-0" size={20} />
                  <span className="text-gray-300 font-medium">{feature}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Interactive Flow Diagram */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="glass-card rounded-3xl p-8 border border-white/10 relative"
          >
            <h3 className="text-xl font-display font-bold text-white mb-8 text-center">
              How It Works
            </h3>
            
            <div className="flex flex-col space-y-6">
              {/* Step 1: User */}
              <div className="flex items-center justify-between">
                <div className="flex-1" />
                <div className="w-10 flex justify-center">
                  <ArrowRight className="text-gray-600 rotate-90 sm:rotate-0" />
                </div>
                <div className="flex-1 bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                  <p className="text-white font-medium text-sm">User Input</p>
                  <p className="text-gray-500 text-xs mt-1">"I have exams in 2 weeks"</p>
                </div>
              </div>
              
              {/* Step 2: Mini Manager Context */}
              <div className="flex items-center justify-between">
                <div className="flex-1 bg-gradient-to-r from-[#7C4DFF]/20 to-[#7C4DFF]/10 border border-[#7C4DFF]/30 rounded-xl p-4 text-center order-3 sm:order-1">
                  <p className="text-white font-medium text-sm">Mini Manager</p>
                  <p className="text-gray-400 text-xs mt-1">Appends calendar data</p>
                </div>
                <div className="w-10 flex justify-center order-2">
                  <ArrowRight className="text-[#7C4DFF] rotate-90 sm:rotate-0" />
                </div>
                <div className="flex-1 order-1 sm:order-3" />
              </div>
              
              {/* Step 3: Gemini API */}
              <div className="flex items-center justify-between">
                <div className="flex-1" />
                <div className="w-10 flex justify-center">
                  <ArrowRight className="text-[#00E5FF] rotate-90 sm:rotate-0" />
                </div>
                <div className="flex-1 bg-gradient-to-r from-[#00E5FF]/20 to-[#00E5FF]/10 border border-[#00E5FF]/30 rounded-xl p-4 text-center relative overflow-hidden group">
                  <div className="absolute inset-0 bg-[#00E5FF]/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out" />
                  <p className="text-white font-medium text-sm flex items-center justify-center gap-2">
                    <Sparkles size={14} className="text-[#00E5FF]" />
                    Gemini API
                  </p>
                  <p className="text-gray-400 text-xs mt-1">Generates study plan</p>
                </div>
              </div>
              
              {/* Step 4: Response */}
              <div className="flex items-center justify-between">
                <div className="flex-1 bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-center order-3 sm:order-1">
                  <p className="text-white font-medium text-sm">Actionable UI</p>
                  <p className="text-gray-400 text-xs mt-1">Schedules study blocks</p>
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
