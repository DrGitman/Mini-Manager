"use client";

import { motion } from "framer-motion";
import { 
  CalendarDays, 
  MessageSquareText, 
  BellRing, 
  Wallet, 
  FileText, 
  Mail, 
  GraduationCap, 
  Plane, 
  Mic 
} from "lucide-react";

const features = [
  {
    icon: <CalendarDays className="w-6 h-6" />,
    title: "AI Planner",
    description: "Tell Gemini your schedule. It returns a perfectly optimized daily timetable.",
    color: "text-blue-400"
  },
  {
    icon: <MessageSquareText className="w-6 h-6" />,
    title: "AI Assistant",
    description: "A Jarvis-like conversational interface for your daily life management.",
    color: "text-[#00E5FF]"
  },
  {
    icon: <BellRing className="w-6 h-6" />,
    title: "Smart Reminders",
    description: "Natural language understanding for complex reminders (e.g., 'Remind me to pay rent after salary').",
    color: "text-purple-400"
  },
  {
    icon: <Wallet className="w-6 h-6" />,
    title: "AI Budget Coach",
    description: "Upload spending data. Get personalized insights and savings recommendations.",
    color: "text-emerald-400"
  },
  {
    icon: <FileText className="w-6 h-6" />,
    title: "Document Reader",
    description: "Upload PDFs and let the AI summarize the key points instantly.",
    color: "text-orange-400"
  },
  {
    icon: <Mail className="w-6 h-6" />,
    title: "AI Email Writer",
    description: "Draft professional emails to your boss or professors with a single prompt.",
    color: "text-pink-400"
  },
  {
    icon: <GraduationCap className="w-6 h-6" />,
    title: "Study Planner",
    description: "Have exams coming up? The AI builds a comprehensive revision timetable.",
    color: "text-yellow-400"
  },
  {
    icon: <Plane className="w-6 h-6" />,
    title: "Travel Planner",
    description: "Going on a trip? Get a detailed, day-by-day itinerary tailored to your interests.",
    color: "text-cyan-400"
  },
  {
    icon: <Mic className="w-6 h-6" />,
    title: "Voice Commands",
    description: "Manage your entire life hands-free using natural voice interactions.",
    color: "text-red-400"
  }
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
};

export default function Features() {
  return (
    <section id="features" className="py-24 relative overflow-hidden">
      {/* Background element */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-[500px] bg-gradient-to-b from-[#7C4DFF]/5 to-transparent rounded-[100%] blur-[100px] pointer-events-none" />
      
      <div className="container mx-auto px-6 md:px-12 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-5xl font-display font-bold mb-6"
          >
            Why <span className="text-[#00E5FF]">Mini Manager?</span>
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-gray-400 text-lg"
          >
            A comprehensive suite of tools designed to streamline your daily routines, powered by the advanced intelligence of Google Gemini.
          </motion.p>
        </div>

        <motion.div 
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {features.map((feature, index) => (
            <motion.div 
              key={index}
              variants={itemVariants}
              className="glass-card p-8 rounded-2xl group hover:-translate-y-2 transition-transform duration-300 relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              
              <div className={`w-14 h-14 rounded-xl bg-white/5 flex items-center justify-center mb-6 border border-white/10 ${feature.color}`}>
                {feature.icon}
              </div>
              
              <h3 className="text-xl font-display font-bold text-white mb-3 group-hover:text-[#00E5FF] transition-colors">
                {feature.title}
              </h3>
              
              <p className="text-gray-400 leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
