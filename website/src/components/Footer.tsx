"use client";

import { Code2, MessageCircle, Mail } from "lucide-react";
import Image from "next/image";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-[#05070B] pt-20 pb-10 border-t border-[#3c4561]">
      <div className="container mx-auto px-6 md:px-16 max-w-7xl">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          <div className="col-span-1 md:col-span-2">
            <a href="#" className="inline-flex mb-6">
              <Image
                src="/logo-white-full.png"
                alt="Mini Manager"
                width={150}
                height={42}
                className="object-contain"
              />
            </a>
            <p className="text-[#9198b7] max-w-sm mb-6">
              AI-powered file organizer for Windows and web. Scan, classify, and organize your files automatically — with full undo, sensitivity detection, and corrections memory.
            </p>
            <div className="flex items-center gap-4">
              <a href="https://github.com/DrGitman/Mini-Manager" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-[#171c2f] border border-[#3c4561] flex items-center justify-center text-[#9198b7] hover:text-[#edeef3] hover:border-[#00E5FF]/40 transition-colors">
                <Code2 size={20} />
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-[#171c2f] border border-[#3c4561] flex items-center justify-center text-[#9198b7] hover:text-[#edeef3] hover:border-[#00E5FF]/40 transition-colors">
                <MessageCircle size={20} />
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-[#171c2f] border border-[#3c4561] flex items-center justify-center text-[#9198b7] hover:text-[#edeef3] hover:border-[#00E5FF]/40 transition-colors">
                <Mail size={20} />
              </a>
            </div>
          </div>

          <div>
            <h4 className="font-display font-semibold text-[#edeef3] mb-6">Product</h4>
            <ul className="space-y-4">
              <li><a href="#features" className="text-[#9198b7] hover:text-[#00E5FF] transition-colors">Features</a></li>
              <li><a href="#downloads" className="text-[#9198b7] hover:text-[#00E5FF] transition-colors">Download App</a></li>
              <li><a href="#demo" className="text-[#9198b7] hover:text-[#00E5FF] transition-colors">Organize (Demo)</a></li>
              <li><a href="#rules" className="text-[#9198b7] hover:text-[#00E5FF] transition-colors">Rules</a></li>
              <li><a href="#insights" className="text-[#9198b7] hover:text-[#00E5FF] transition-colors">Insights</a></li>
              <li><a href="#history" className="text-[#9198b7] hover:text-[#00E5FF] transition-colors">History</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-display font-semibold text-[#edeef3] mb-6">Learn More</h4>
            <ul className="space-y-4">
              <li><a href="#gemini" className="text-[#9198b7] hover:text-[#7C4DFF] transition-colors">AI Integration</a></li>
              <li><a href="#architecture" className="text-[#9198b7] hover:text-[#7C4DFF] transition-colors">Architecture</a></li>
              <li><a href="#roadmap" className="text-[#9198b7] hover:text-[#7C4DFF] transition-colors">Roadmap</a></li>
              <li><a href="#team" className="text-[#9198b7] hover:text-[#7C4DFF] transition-colors">Team</a></li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-[#3c4561] flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-[#9198b7]">
            &copy; {currentYear} Mini Manager Team. All rights reserved.
          </p>
          <div className="flex items-center gap-2 text-sm text-[#9198b7]">
            Powered by <span className="font-medium text-[#bec2d3]">Groq</span> &amp; <span className="font-medium text-[#bec2d3]">Gemini</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
