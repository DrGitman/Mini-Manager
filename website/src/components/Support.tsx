"use client";

import { motion } from "framer-motion";
import { MessageSquare, Mail, BookOpen, Bug, Zap, Shield, ArrowRight } from "lucide-react";
import { useState } from "react";

const CHANNELS = [
  {
    icon: MessageSquare,
    title: "Live AI Support",
    description: "Get instant answers from our AI support agent — available 24/7. Complex issues escalated to the team.",
    cta: "Chat now",
    action: () => {
      // Open the chat widget (scroll to bottom or trigger it)
      const event = new CustomEvent("openChatWidget");
      window.dispatchEvent(event);
    },
    color: "from-[#00E5FF] to-[#7C4DFF]",
    badge: "Instant",
  },
  {
    icon: Mail,
    title: "Email Support",
    description: "For billing questions, account issues, or anything that needs a human touch. We respond within 24h.",
    cta: "Send email",
    href: "mailto:support@minimanager.app",
    color: "from-[#7C4DFF] to-[#E040FB]",
    badge: "< 24h",
  },
  {
    icon: BookOpen,
    title: "Documentation",
    description: "Step-by-step guides, keyboard shortcuts, and API reference. Everything you need to get the most out of Mini Manager.",
    cta: "Read docs",
    href: "#",
    color: "from-[#00BFA5] to-[#00E5FF]",
    badge: "Self-serve",
  },
];

const COMMON_ISSUES = [
  { icon: Bug,    title: "File not moving",    desc: "Check the file isn't in a protected path or on your blocklist. System files (exe, dll) are always protected." },
  { icon: Zap,    title: "AI classification off",  desc: "Correct it directly in the Organize panel — the AI learns from every correction you make." },
  { icon: Shield, title: "Sensitive file warning", desc: "Mini Manager flagged a file with personal/financial content. Review before applying — this is intentional." },
];

export default function Support() {
  const [formState, setFormState] = useState({ name: "", email: "", message: "" });
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // In production: POST to /api/v1/support/chat or a contact form API
    setSubmitted(true);
  }

  return (
    <section id="support" className="py-24 relative overflow-hidden bg-[#0A0E17]">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#00E5FF]/5 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#7C4DFF]/5 rounded-full blur-[100px]" />
      </div>

      <div className="container mx-auto px-6 md:px-16 max-w-7xl relative z-10">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center px-4 py-1.5 rounded-full bg-[#171c2f] border border-[#3c4561] text-xs font-bold tracking-widest text-[#9198b7] uppercase mb-6"
          >
            SUPPORT
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-4xl md:text-5xl font-display font-bold mb-6 text-[#edeef3]"
          >
            We&apos;ve got you <span className="bg-gradient-to-r from-[#00E5FF] to-[#7C4DFF] bg-clip-text text-transparent">covered</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-[#9198b7] text-lg"
          >
            AI-powered first-line support that resolves most issues instantly. Human backup for everything else.
          </motion.p>
        </div>

        {/* Support channels */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {CHANNELS.map((ch, i) => (
            <motion.div
              key={ch.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="relative group rounded-2xl border border-[#3c4561] bg-[#171c2f] p-6 hover:border-[#00E5FF]/40 hover:bg-[#1a2038] transition-all"
            >
              <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${ch.color} mb-4`}>
                <ch.icon size={20} className="text-white" />
              </div>
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-lg font-semibold text-[#edeef3]">{ch.title}</h3>
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#00E5FF] bg-[#00E5FF]/10 border border-[#00E5FF]/20 rounded-full px-2 py-0.5">
                  {ch.badge}
                </span>
              </div>
              <p className="text-sm text-[#9198b7] mb-5 leading-relaxed">{ch.description}</p>
              {ch.href ? (
                <a
                  href={ch.href}
                  className={`inline-flex items-center gap-2 text-sm font-semibold bg-gradient-to-r ${ch.color} bg-clip-text text-transparent group-hover:gap-3 transition-all`}
                >
                  {ch.cta} <ArrowRight size={14} className={`bg-gradient-to-r ${ch.color} [&>*]:fill-current text-[#00E5FF]`} />
                </a>
              ) : (
                <button
                  onClick={ch.action}
                  className={`inline-flex items-center gap-2 text-sm font-semibold bg-gradient-to-r ${ch.color} bg-clip-text text-transparent group-hover:gap-3 transition-all`}
                >
                  {ch.cta} <ArrowRight size={14} className="text-[#00E5FF]" />
                </button>
              )}
            </motion.div>
          ))}
        </div>

        {/* Common issues + contact form */}
        <div className="grid md:grid-cols-2 gap-10">
          {/* Common issues */}
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <h3 className="text-2xl font-display font-bold text-[#edeef3] mb-6">Common issues</h3>
            <div className="space-y-4">
              {COMMON_ISSUES.map((issue) => (
                <div key={issue.title} className="flex gap-4 p-4 rounded-xl border border-[#3c4561] bg-[#171c2f] hover:border-[#00E5FF]/30 transition-colors">
                  <div className="p-2 rounded-lg bg-[#00E5FF]/10 shrink-0">
                    <issue.icon size={16} className="text-[#00E5FF]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#edeef3] mb-0.5">{issue.title}</p>
                    <p className="text-xs text-[#9198b7] leading-relaxed">{issue.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Contact form */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <h3 className="text-2xl font-display font-bold text-[#edeef3] mb-6">Send a message</h3>
            {submitted ? (
              <div className="flex flex-col items-center justify-center h-64 rounded-2xl border border-[#00E5FF]/30 bg-[#00E5FF]/5 text-center p-8">
                <div className="w-12 h-12 rounded-full bg-[#00E5FF]/20 flex items-center justify-center mb-4">
                  <MessageSquare size={20} className="text-[#00E5FF]" />
                </div>
                <h4 className="text-white font-semibold mb-2">Message sent!</h4>
                <p className="text-sm text-[#9198b7]">We&apos;ll get back to you within 24 hours.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-[#9198b7] mb-1.5">Name</label>
                    <input
                      required
                      type="text"
                      value={formState.name}
                      onChange={e => setFormState(s => ({ ...s, name: e.target.value }))}
                      placeholder="Your name"
                      className="w-full rounded-xl border border-[#3c4561] bg-[#0d1020] px-4 py-3 text-sm text-[#edeef3] placeholder-[#9198b7] focus:border-[#00E5FF]/40 focus:outline-none focus:ring-1 focus:ring-[#00E5FF]/20 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#9198b7] mb-1.5">Email</label>
                    <input
                      required
                      type="email"
                      value={formState.email}
                      onChange={e => setFormState(s => ({ ...s, email: e.target.value }))}
                      placeholder="you@email.com"
                      className="w-full rounded-xl border border-[#3c4561] bg-[#0d1020] px-4 py-3 text-sm text-[#edeef3] placeholder-[#9198b7] focus:border-[#00E5FF]/40 focus:outline-none focus:ring-1 focus:ring-[#00E5FF]/20 transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-[#9198b7] mb-1.5">Message</label>
                  <textarea
                    required
                    rows={5}
                    value={formState.message}
                    onChange={e => setFormState(s => ({ ...s, message: e.target.value }))}
                    placeholder="Describe your issue or question…"
                    className="w-full rounded-xl border border-[#3c4561] bg-[#0d1020] px-4 py-3 text-sm text-[#edeef3] placeholder-[#9198b7] focus:border-[#00E5FF]/40 focus:outline-none focus:ring-1 focus:ring-[#00E5FF]/20 transition-all resize-none"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-[#00E5FF] to-[#7C4DFF] text-white font-bold text-sm hover:shadow-[0_0_20px_rgba(0,229,255,0.3)] transition-all transform hover:scale-[1.01]"
                >
                  Send message
                </button>
              </form>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
