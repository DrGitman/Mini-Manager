"use client";

import { motion } from "framer-motion";
import { Play, Sparkles, AlertCircle } from "lucide-react";
import { useState } from "react";

export default function OnlineDemo() {
  const [demoActive, setDemoActive] = useState(false);

  return (
    <section id="demo" className="py-24 relative overflow-hidden">
      {/* Background styling */}
      <div className="absolute inset-0 bg-[#05070B] z-0" />
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent z-10" />
      
      <div className="container mx-auto px-6 md:px-12 relative z-10">
        <div className="flex flex-col md:flex-row items-center gap-12 lg:gap-24">
          <motion.div 
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="flex-1"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FF6D00]/10 text-[#FF6D00] border border-[#FF6D00]/20 text-sm font-medium mb-6">
              <Sparkles size={14} />
              Try it instantly
            </div>
            
            <h2 className="text-4xl md:text-5xl font-display font-bold mb-6">
              Experience Mini Manager <br/>
              <span className="text-gradient">No Install Required</span>
            </h2>
            
            <p className="text-gray-400 text-lg mb-8 leading-relaxed">
              We've created a special Guest Mode so judges can try out the core features immediately. 
              Interact with the AI Assistant, try out the Task Planner, and see how Gemini powers the experience.
            </p>
            
            <ul className="space-y-4 mb-10">
              {[
                "Fully functional web preview",
                "5-minute guest session",
                "Pre-loaded demo data",
                "Live Gemini API connection"
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-3 text-gray-300">
                  <div className="w-6 h-6 rounded-full bg-[#00E5FF]/10 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-[#00E5FF]" />
                  </div>
                  {item}
                </li>
              ))}
            </ul>
            
            {!demoActive && (
              <button 
                onClick={() => setDemoActive(true)}
                className="px-8 py-4 rounded-xl bg-gradient-to-r from-[#FF6D00] to-[#FF9100] text-white font-bold text-lg flex items-center justify-center gap-2 hover:shadow-[0_0_20px_rgba(255,109,0,0.4)] transition-all transform hover:-translate-y-1 w-full sm:w-auto"
              >
                <Play fill="currentColor" size={20} />
                Launch Interactive Demo
              </button>
            )}
          </motion.div>
          
          <motion.div 
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="flex-1 w-full"
          >
            <div className="relative w-full aspect-[4/3] max-w-2xl mx-auto rounded-2xl glass-card border border-white/10 overflow-hidden shadow-2xl flex flex-col">
              {/* Browser bar */}
              <div className="h-12 border-b border-white/10 bg-black/40 flex items-center px-4 gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                  <div className="w-3 h-3 rounded-full bg-green-500/80" />
                </div>
                <div className="mx-auto w-1/2 h-6 bg-white/5 rounded-md border border-white/10 flex items-center justify-center">
                  <span className="text-xs text-gray-500 font-mono">demo.minimanager.ai</span>
                </div>
              </div>
              
              {/* Demo Content Area */}
              <div className="flex-1 relative bg-[#0A0E17] flex items-center justify-center p-6">
                {demoActive ? (
                  <div className="absolute inset-0 flex items-center justify-center flex-col text-center p-8">
                    <div className="w-16 h-16 border-4 border-[#00E5FF]/20 border-t-[#00E5FF] rounded-full animate-spin mb-6" />
                    <p className="text-white font-medium">Connecting to demo environment...</p>
                    <p className="text-gray-500 text-sm mt-2">Placeholder for Vercel hosted demo iframe</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="w-20 h-20 bg-gray-900 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg border border-white/5">
                      <Play fill="#FF6D00" className="text-[#FF6D00] ml-1" size={32} />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Ready to explore?</h3>
                    <p className="text-gray-400 text-sm max-w-sm mx-auto">
                      Click launch to start your 5-minute guest session. No account required.
                    </p>
                  </div>
                )}
              </div>
            </div>
            
            <div className="mt-6 flex items-start gap-3 bg-blue-900/20 border border-blue-500/30 rounded-xl p-4">
              <AlertCircle className="text-blue-400 shrink-0 mt-0.5" size={18} />
              <p className="text-sm text-blue-200/80 leading-relaxed">
                <strong>Note for Judges:</strong> The web demo offers a subset of features. For the full experience including device file scanning and system hotkeys, please download the native Windows app.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
