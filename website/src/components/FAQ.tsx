"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

export default function FAQ() {
  const faqs = [
    {
      question: "Is Mini Manager free to use?",
      answer: "During the hackathon beta phase, Mini Manager is completely free to use. In the future, we plan to offer a generous free tier alongside a premium subscription for advanced AI features."
    },
    {
      question: "How does the AI actually work?",
      answer: "Mini Manager integrates with the Google Gemini API. When you input a task, request a schedule, or upload a document, your data is securely processed by Gemini to generate intelligent, context-aware responses and actions."
    },
    {
      question: "Does it work offline?",
      answer: "Core features like viewing your schedule and basic task management work offline on the native apps. However, advanced AI features powered by Gemini require an active internet connection."
    },
    {
      question: "Which platforms are supported?",
      answer: "Currently, Mini Manager is built natively as a Windows desktop application (Setup.exe). We also provide a limited web demo for instant previewing in browser."
    },
    {
      question: "Is my personal data secure?",
      answer: "Security is our top priority. All user data is encrypted at rest and in transit using industry-standard protocols. We adhere to OWASP Top 10 guidelines and use Firebase Authentication for secure access control."
    }
  ];

  const [openIndex, setOpenIndex] = useState<number | null>(0);

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
              className="glass-card border border-white/5 rounded-2xl overflow-hidden"
            >
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full px-6 py-5 flex items-center justify-between text-left focus:outline-none hover:bg-white/5 transition-colors"
              >
                <span className="font-bold text-white text-lg pr-8">{faq.question}</span>
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
                    <div className="px-6 pb-5 text-gray-400 leading-relaxed border-t border-white/5 pt-4">
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
