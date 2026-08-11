"use client";

import { motion } from "framer-motion";
import { Code2, Briefcase, MessageCircle } from "lucide-react";

export default function Team() {
  const team = [
    {
      name: "Team Member 1",
      role: "Lead Developer",
      github: "https://github.com",
      image: "https://ui-avatars.com/api/?name=TM&background=0D8ABC&color=fff&size=150"
    },
    {
      name: "Team Member 2",
      role: "AI Engineer",
      github: "https://github.com",
      image: "https://ui-avatars.com/api/?name=TM&background=7C4DFF&color=fff&size=150"
    },
    {
      name: "Team Member 3",
      role: "UI/UX Designer",
      github: "https://github.com",
      image: "https://ui-avatars.com/api/?name=TM&background=FF6D00&color=fff&size=150"
    },
    {
      name: "Kayel",
      role: "Web & Deployment",
      github: "https://github.com",
      image: "https://ui-avatars.com/api/?name=K&background=00E5FF&color=fff&size=150"
    }
  ];

  return (
    <section id="team" className="py-24 relative overflow-hidden bg-[#05070B]">
      <div className="container mx-auto px-6 md:px-12 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-5xl font-display font-bold mb-6"
          >
            Meet the <span className="text-gradient">Team</span>
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-gray-400 text-lg"
          >
            The builders behind Mini Manager for the Build with Gemini XPRIZE.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {team.map((member, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="glass-card rounded-2xl p-6 flex flex-col items-center text-center group hover:-translate-y-2 transition-transform duration-300 border border-white/5 hover:border-white/20"
            >
              <div className="w-24 h-24 rounded-full overflow-hidden mb-6 border-2 border-white/10 group-hover:border-[#00E5FF] transition-colors">
                <img src={member.image} alt={member.name} className="w-full h-full object-cover" />
              </div>
              
              <h3 className="text-xl font-bold text-white mb-1">{member.name}</h3>
              <p className="text-[#00E5FF] text-sm font-medium mb-4">{member.role}</p>
              
              <div className="flex items-center gap-3 mt-auto">
                <a href={member.github} target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
                  <Code2 size={16} />
                </a>
                <a href="#" className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:text-[#0077b5] hover:bg-white/10 transition-colors">
                  <Briefcase size={16} />
                </a>
                <a href="#" className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:text-[#1DA1F2] hover:bg-white/10 transition-colors">
                  <MessageCircle size={16} />
                </a>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
