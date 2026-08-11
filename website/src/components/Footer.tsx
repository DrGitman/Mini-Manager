"use client";

import { Code2, MessageCircle, Mail } from "lucide-react";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-[#05070B] pt-20 pb-10 border-t border-white/5">
      <div className="container mx-auto px-6 md:px-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          <div className="col-span-1 md:col-span-2">
            <a href="#" className="flex items-center gap-2 mb-6">
              <div className="w-10 h-10 bg-gradient-to-tr from-[#00E5FF] to-[#7C4DFF] rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg">
                M
              </div>
              <span className="font-display font-bold text-2xl tracking-tight">
                Mini <span className="text-[#00E5FF]">Manager</span>
              </span>
            </a>
            <p className="text-gray-400 max-w-sm mb-6">
              Your AI-powered life management platform. Built with Google Gemini
              to help you organize tasks, budgets, schedules, documents and more.
            </p>
            <div className="flex items-center gap-4">
              <a href="https://github.com/DrGitman/Mini-Manager" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
                <Code2 size={20} />
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
                <MessageCircle size={20} />
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
                <Mail size={20} />
              </a>
            </div>
          </div>

          <div>
            <h4 className="font-display font-semibold text-white mb-6">Product</h4>
            <ul className="space-y-4">
              <li><a href="#features" className="text-gray-400 hover:text-[#00E5FF] transition-colors">Features</a></li>
              <li><a href="#downloads" className="text-gray-400 hover:text-[#00E5FF] transition-colors">Download App</a></li>
              <li><a href="#demo" className="text-gray-400 hover:text-[#00E5FF] transition-colors">Online Demo</a></li>
              <li><a href="#roadmap" className="text-gray-400 hover:text-[#00E5FF] transition-colors">Roadmap</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-display font-semibold text-white mb-6">Hackathon</h4>
            <ul className="space-y-4">
              <li><a href="https://xprize.devpost.com/" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-[#7C4DFF] transition-colors">Build with Gemini XPRIZE</a></li>
              <li><a href="#gemini" className="text-gray-400 hover:text-[#7C4DFF] transition-colors">Gemini Integration</a></li>
              <li><a href="#architecture" className="text-gray-400 hover:text-[#7C4DFF] transition-colors">Architecture</a></li>
              <li><a href="#team" className="text-gray-400 hover:text-[#7C4DFF] transition-colors">Team</a></li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-500">
            &copy; {currentYear} Mini Manager Team. All rights reserved.
          </p>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            Built for <span className="font-medium text-gray-300">XPRIZE</span> 
          </div>
        </div>
      </div>
    </footer>
  );
}
