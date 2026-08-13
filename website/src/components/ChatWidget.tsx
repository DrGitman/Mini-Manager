"use client";

import { useState, useRef, useEffect } from "react";
import { MessageSquare, X, Send, Sparkles, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hi! I'm Mini Manager's AI assistant. Ask me anything about the app, features, or our XPRIZE submission." }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      // In a real implementation, this calls your Next.js API route
      // which uses the GEMINI_API_KEY from environment variables
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage })
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const data = await response.json();
      
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: data.reply || "I'm having trouble connecting to Gemini right now. Please try again later."
      }]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: "API Key not configured yet! Once you add your GEMINI_API_KEY to the .env file, this chatbot will answer questions about Mini Manager."
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 1, type: "spring", stiffness: 200 }}
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-r from-[#00E5FF] to-[#7C4DFF] text-white flex items-center justify-center shadow-lg hover:shadow-[0_0_20px_rgba(0,229,255,0.4)] transition-all transform hover:scale-110 ${isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      >
        <MessageSquare size={24} />
      </motion.button>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            transition={{ type: "spring", bounce: 0.3 }}
            className="fixed bottom-6 right-6 z-50 w-full max-w-[350px] sm:max-w-[400px] h-[500px] max-h-[80vh] flex flex-col bg-[#171c2f] rounded-2xl shadow-2xl border border-[#3c4561] overflow-hidden"
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-[#3c4561] bg-[#0d1020] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#00E5FF] to-[#7C4DFF] flex items-center justify-center">
                  <Sparkles size={16} className="text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">Ask Mini Manager</h3>
                  <p className="text-xs text-[#00E5FF]">Powered by Gemini</p>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="text-[#9198b7] hover:text-[#edeef3] transition-colors p-1"
              >
                <X size={20} />
              </button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4 bg-[#0A0E17]">
              {messages.map((msg, index) => (
                <div 
                  key={index} 
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div 
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                      msg.role === 'user'
                        ? 'bg-gradient-to-r from-[#00E5FF] to-[#7C4DFF] text-white rounded-br-sm'
                        : 'bg-[#0d1020] text-[#bec2d3] rounded-bl-sm border border-[#3c4561]'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-[#0d1020] text-[#bec2d3] rounded-2xl rounded-bl-sm border border-[#3c4561] px-4 py-3 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-[#00E5FF] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 bg-[#00E5FF] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 bg-[#00E5FF] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* API Key Notice */}
            <div className="px-4 py-2 bg-[#0d1020] border-t border-[#3c4561] flex items-center gap-2">
              <AlertCircle size={14} className="text-[#9198b7] shrink-0" />
              <p className="text-[10px] text-[#9198b7] leading-tight">
                Requires GEMINI_API_KEY in .env to function fully.
              </p>
            </div>

            {/* Input Area */}
            <div className="p-4 bg-[#0d1020] border-t border-[#3c4561]">
              <form onSubmit={handleSend} className="flex items-center gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask a question..."
                  className="flex-1 bg-[#171c2f] border border-[#3c4561] rounded-full px-4 py-2.5 text-sm text-[#edeef3] focus:outline-none focus:border-[#00E5FF]/50 transition-colors placeholder-[#9198b7]"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="w-10 h-10 rounded-full bg-[#00E5FF]/10 text-[#00E5FF] flex items-center justify-center hover:bg-[#00E5FF]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                >
                  <Send size={16} className="ml-1" />
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
