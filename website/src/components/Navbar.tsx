"use client";

import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";

export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { name: "Features", href: "#features" },
    { name: "Downloads", href: "#downloads" },
    { name: "Demo", href: "#demo" },
    { name: "Gemini AI", href: "#gemini" },
    { name: "Architecture", href: "#architecture" },
    { name: "Support", href: "#support" },
  ];

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled ? "glass py-3" : "bg-transparent py-5"
      }`}
    >
      <div className="container mx-auto px-6 md:px-12 flex items-center justify-between">
        <a href="#" className="flex items-center gap-2 z-50">
          <div className="w-10 h-10 bg-gradient-to-tr from-[#00E5FF] to-[#7C4DFF] rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg">
            M
          </div>
          <span className="font-display font-bold text-xl tracking-tight">
            Mini <span className="text-[#00E5FF]">Manager</span>
          </span>
        </a>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <a
              key={link.name}
              href={link.href}
              className="text-sm font-medium text-gray-300 hover:text-white transition-colors"
            >
              {link.name}
            </a>
          ))}
        </nav>

        {/* CTA & Actions */}
        <div className="hidden md:flex items-center gap-4">
          <a
            href="#demo"
            className="text-sm font-medium text-gray-300 hover:text-white transition-colors"
          >
            Try Demo
          </a>
          <a
            href="#downloads"
            className="px-5 py-2.5 rounded-full bg-gradient-to-r from-[#00E5FF] to-[#7C4DFF] text-white text-sm font-bold hover:shadow-[0_0_15px_rgba(0,229,255,0.5)] transition-all transform hover:scale-105"
          >
            Download
          </a>
        </div>

        {/* Mobile Menu Toggle */}
        <button
          className="md:hidden text-gray-300 hover:text-white z-50"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-[#0A0E17]/95 backdrop-blur-xl pt-24 px-6 flex flex-col gap-6 md:hidden">
          {navLinks.map((link) => (
            <a
              key={link.name}
              href={link.href}
              className="text-2xl font-display font-medium text-gray-200"
              onClick={() => setMobileMenuOpen(false)}
            >
              {link.name}
            </a>
          ))}
          <div className="h-px bg-gray-800 w-full my-4" />
          <a
            href="#demo"
            className="text-xl font-medium text-gray-300"
            onClick={() => setMobileMenuOpen(false)}
          >
            Try Demo
          </a>
          <a
            href="#downloads"
            className="px-6 py-4 mt-2 rounded-xl bg-gradient-to-r from-[#00E5FF] to-[#7C4DFF] text-white text-center font-bold"
            onClick={() => setMobileMenuOpen(false)}
          >
            Download App
          </a>
        </div>
      )}
    </header>
  );
}
