"use client";

import { motion } from "framer-motion";
import { Download, Monitor, Globe, ArrowRight, Code2, Sparkles } from "lucide-react";

export default function DownloadCenter() {
  const downloads = [
    {
      id: "windows-exe",
      title: "Windows Installer",
      icon: <Monitor className="w-8 h-8 text-[#00E5FF]" />,
      version: "v1.0.0-beta",
      size: "68.2 MB",
      badge: "Setup.exe Direct Download",
      description: "Get full desktop power for heavy-duty organizing, document scanning, schedule planning, and AI assistance on Windows.",
      buttonText: "Download Setup.exe",
      buttonIcon: <Download size={18} />,
      link: "https://github.com/DrGitman/Mini-Manager/releases",
      primary: true,
      color: "from-[#00E5FF]/20 to-transparent",
      borderColor: "border-[#00E5FF]/30"
    },
    {
      id: "windows-portable",
      title: "Windows Portable",
      icon: <Sparkles className="w-8 h-8 text-[#7C4DFF]" />,
      version: "v1.0.0-beta",
      size: "62.0 MB",
      badge: "Standalone Zip",
      description: "Run Mini Manager instantly without running an installer. Unzip and launch directly on any Windows PC.",
      buttonText: "Download Portable Zip",
      buttonIcon: <Download size={18} />,
      link: "https://github.com/DrGitman/Mini-Manager/releases",
      primary: false,
      color: "from-[#7C4DFF]/20 to-transparent",
      borderColor: "border-[#7C4DFF]/30"
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
    <section id="downloads" className="py-24 relative z-10">
      <div className="container mx-auto px-6 md:px-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
          <div className="max-w-2xl">
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-4xl md:text-5xl font-display font-bold mb-4"
            >
              Get Mini <span className="text-[#00E5FF]">Manager</span> for Windows
            </motion.h2>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-gray-400 text-lg"
            >
              Built natively for Windows. High-performance desktop life management powered by Google Gemini.
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
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full glass hover:bg-white/10 transition-colors border border-white/10"
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
              className={`glass-card rounded-3xl p-8 relative overflow-hidden group border ${item.primary ? item.borderColor : 'border-white/5'} hover:${item.borderColor} transition-colors duration-300`}
            >
              {/* Colored Glow Background */}
              <div className={`absolute top-0 left-0 w-full h-32 bg-gradient-to-b ${item.color} opacity-50`} />
              
              <div className="relative z-10">
                <div className="flex items-start justify-between mb-8">
                  <div className="w-16 h-16 rounded-2xl bg-gray-900/50 flex items-center justify-center border border-white/10 backdrop-blur-md">
                    {item.icon}
                  </div>
                  <span className="px-3 py-1 rounded-full bg-white/5 text-xs font-medium text-gray-300 border border-white/10">
                    {item.badge}
                  </span>
                </div>
                
                <h3 className="text-2xl font-display font-bold text-white mb-2">
                  {item.title}
                </h3>
                
                <div className="flex items-center gap-3 text-sm text-gray-400 mb-6 font-mono">
                  <span>{item.version}</span>
                  <span className="w-1 h-1 rounded-full bg-gray-600" />
                  <span>{item.size}</span>
                </div>
                
                <p className="text-gray-400 leading-relaxed mb-8 h-20">
                  {item.description}
                </p>
                
                <a 
                  href={item.link}
                  target={item.id !== 'web' ? '_blank' : '_self'}
                  rel={item.id !== 'web' ? 'noopener noreferrer' : ''}
                  className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                    item.primary 
                      ? 'bg-gradient-to-r from-[#00E5FF] to-[#7C4DFF] text-white hover:shadow-[0_0_20px_rgba(0,229,255,0.4)]' 
                      : 'bg-white/5 text-white hover:bg-white/10 border border-white/10'
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
