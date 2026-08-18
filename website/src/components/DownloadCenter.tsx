"use client";

import { motion } from "framer-motion";
import { Download, Monitor, Globe, ArrowRight, Code2 } from "lucide-react";

export default function DownloadCenter() {
  const downloads = [
    {
      id: "windows-exe",
      title: "Windows Installer",
      icon: <Monitor className="w-8 h-8 text-[#00E5FF]" />,
      version: "v1.0.0-beta",
      size: "184 MB",
      badge: "Setup.exe Direct Download",
      description: "Get full desktop power for heavy-duty organizing, document scanning, schedule planning, and AI assistance on Windows.",
      buttonText: "Download Setup.exe",
      buttonIcon: <Download size={18} />,
      // Points at the newest release asset, so the site never needs
      // editing when a new version is published.
      link: "https://github.com/DrGitman/Mini-Manager/releases/latest/download/Mini-Manager-Setup.exe",
      primary: true,
      color: "from-[#00E5FF]/20 to-transparent",
      borderColor: "border-[#00E5FF]/30"
    },
    {
      id: "web",
      title: "Web Demo",
      icon: <Globe className="w-8 h-8 text-[#FF6D00]" />,
      version: "Live Preview",
      size: "No install needed",
      badge: "Try Instantly",
      description: "Testing it out? Launch our web version in guest mode. 5-minute session limit.",
      buttonText: "Launch Online Demo",
      buttonIcon: <ArrowRight size={18} />,
      link: "#demo",
      primary: false,
      color: "from-[#FF6D00]/20 to-transparent",
      borderColor: "border-[#FF6D00]/30"
    }
  ];

  return (
    <section id="downloads" className="py-24 relative z-10 bg-[#05070B]">
      <div className="container mx-auto px-6 md:px-16 max-w-7xl">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
          <div className="max-w-2xl">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="inline-flex items-center px-4 py-1.5 rounded-full bg-[#171c2f] border border-[#3c4561] text-xs font-bold tracking-widest text-[#9198b7] uppercase mb-6"
            >
              GET STARTED
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-4xl md:text-5xl font-display font-bold mb-4 text-[#edeef3]"
            >
              Get Mini <span className="text-[#00E5FF]">Manager</span> for Windows
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-[#9198b7] text-lg"
            >
              Built natively for Windows. High-performance desktop file management powered by Groq and Google Gemini.
            </motion.p>
          </div>
          
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            <a 
              href="https://github.com/DrGitman/Mini-Manager" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#171c2f] border border-[#3c4561] text-[#bec2d3] hover:border-[#00E5FF]/40 hover:bg-[#1a2038] transition-all"
            >
              <Code2 size={18} />
              <span className="font-medium text-sm text-gray-200">View Source Code</span>
            </a>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {downloads.map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className={`bg-[#171c2f] border border-[#3c4561] rounded-2xl p-8 relative overflow-hidden group hover:border-[#00E5FF]/40 hover:bg-[#1a2038] transition-all duration-300`}
            >
              {/* Colored Glow Background */}
              <div className={`absolute top-0 left-0 w-full h-32 bg-gradient-to-b ${item.color} opacity-50`} />
              
              <div className="relative z-10">
                <div className="flex items-start justify-between mb-8">
                  <div className="w-16 h-16 rounded-2xl bg-[#0d1020] flex items-center justify-center border border-[#3c4561]">
                    {item.icon}
                  </div>
                  <span className="px-3 py-1 rounded-full bg-[#0d1020] text-xs font-medium text-[#9198b7] border border-[#3c4561]">
                    {item.badge}
                  </span>
                </div>
                
                <h3 className="text-2xl font-display font-bold text-[#edeef3] mb-2">
                  {item.title}
                </h3>
                
                <div className="flex items-center gap-3 text-sm text-[#9198b7] mb-6 font-mono">
                  <span>{item.version}</span>
                  <span className="w-1 h-1 rounded-full bg-gray-600" />
                  <span>{item.size}</span>
                </div>
                
                <p className="text-[#9198b7] leading-relaxed mb-8 h-20">
                  {item.description}
                </p>
                
                <a 
                  href={item.link}
                  target={item.id !== 'web' ? '_blank' : '_self'}
                  rel={item.id !== 'web' ? 'noopener noreferrer' : ''}
                  className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                    item.primary
                      ? 'bg-gradient-to-r from-[#00E5FF] to-[#7C4DFF] text-white hover:opacity-90'
                      : 'bg-[#0d1020] text-[#bec2d3] border border-[#3c4561] hover:border-[#00E5FF]/40 hover:bg-[#171c2f]'
                  }`}
                >
                  {item.buttonIcon}
                  {item.buttonText}
                </a>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
