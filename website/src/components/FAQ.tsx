"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

export default function FAQ() {
  const faqs = [
    {
      question: "Is Mini Manager free?",
      answer: "Yes — Mini Manager has a free tier that lets you scan folders and view AI classifications. The Pro plan ($9/mo) unlocks unlimited scans, unlimited AI classifications, and priority support."
    },
    {
      question: "How does the AI classify files?",
      answer: "Groq's llama-3.3-70b model reads each file's name, extension, size, and a short content preview to assign it a category (Documents, Images, Videos, Code, Finance, etc.) along with a confidence score. Files scoring ≥85% are auto-applied, 70-84% go to Review, and below 70% need your input."
    },
    {
      question: "Does it work offline?",
      answer: "Folder scanning and browsing your file history work fully offline. AI classification and the chat agent require an internet connection to reach the Groq and Gemini APIs."
    },
    {
      question: "Which platforms are supported?",
      answer: "Mini Manager ships as a native Windows desktop app built with Electron. There is also a web app version accessible in any modern browser, so you can use it on any operating system."
    },
    {
      question: "Is my data secure?",
      answer: "Only file metadata (name, extension, size, a brief content snippet) is ever sent to the AI models — your actual file contents stay on your machine. When the AI moves a file, it goes to the system Recycle Bin first, not permanent deletion, and every action is fully reversible via the history journal."
    }
  ];

  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="py-24 relative overflow-hidden bg-[#0A0E17]">
      <div className="container mx-auto px-6 md:px-16 max-w-7xl relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center px-4 py-1.5 rounded-full bg-[#171c2f] border border-[#3c4561] text-xs font-bold tracking-widest text-[#9198b7] uppercase mb-6"
          >
            FAQ
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-5xl font-display font-bold mb-6 text-[#edeef3]"
          >
            Frequently Asked <span className="text-gradient">Questions</span>
          </motion.h2>
        </div>

        <div className="max-w-3xl mx-auto space-y-4">
          {faqs.map((faq, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="bg-[#171c2f] border border-[#3c4561] rounded-2xl overflow-hidden hover:border-[#00E5FF]/40 transition-colors"
            >
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full px-6 py-5 flex items-center justify-between text-left focus:outline-none hover:bg-[#1a2038] transition-colors"
              >
                <span className="font-bold text-[#edeef3] text-lg pr-8">{faq.question}</span>
                <ChevronDown 
                  className={`text-[#00E5FF] shrink-0 transition-transform duration-300 ${
                    openIndex === index ? "rotate-180" : ""
                  }`} 
                  size={24} 
                />
              </button>
              
              <AnimatePresence>
                {openIndex === index && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                  >
                    <div className="px-6 pb-5 text-[#9198b7] leading-relaxed border-t border-[#3c4561] pt-4">
                      {faq.answer}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
