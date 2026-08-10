"use client";

import { motion } from "framer-motion";
import { Play } from "lucide-react";

export default function DemoVideo() {
  return (
    <section className="py-24 relative overflow-hidden bg-[#0A0E17]">
      <div className="container mx-auto px-6 md:px-12 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-5xl font-display font-bold mb-6"
          >
            Watch Mini Manager <span className="text-[#00E5FF]">in Action</span>
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-gray-400 text-lg"
          >
            See how the AI-powered life assistant streamlines daily tasks in this quick walkthrough.
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="relative max-w-5xl mx-auto"
        >
          {/* Video Placeholder */}
          <div className="relative aspect-video rounded-3xl overflow-hidden glass-card border border-white/10 shadow-2xl group cursor-pointer">
            <div className="absolute inset-0 bg-gradient-to-br from-[#0A0E17] to-[#111827] flex flex-col items-center justify-center">
              <div className="w-20 h-20 rounded-full bg-gradient-to-r from-[#00E5FF] to-[#7C4DFF] flex items-center justify-center shadow-[0_0_30px_rgba(0,229,255,0.4)] group-hover:scale-110 transition-transform duration-300">
                <Play className="text-white ml-1" size={32} fill="currentColor" />
              </div>
              <p className="mt-6 text-gray-400 font-medium tracking-widest uppercase text-sm">Play Video</p>
            </div>
            
            {/* Embedded iframe will go here later */}
            {/* <iframe src="https://www.youtube.com/embed/..." title="Demo Video" className="absolute inset-0 w-full h-full" allowFullScreen /> */}
          </div>
          
          {/* Glowing effect behind video */}
          <div className="absolute -inset-10 bg-gradient-to-r from-[#00E5FF] to-[#7C4DFF] rounded-[3rem] blur-3xl opacity-10 z-[-1]" />
        </motion.div>
      </div>
    </section>
  );
}
