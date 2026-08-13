"use client";

import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";
import Image from "next/image";

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
    <>
      {/* Top utility bar — desktop only */}
      <div className="hidden md:flex fixed top-0 left-0 right-0 z-50 bg-[#0d1020] border-b border-[#3c4561] py-2 px-6 md:px-16 text-xs text-[#9198b7] justify-between items-center">
        <span>AI File Organizer for Windows &amp; Web</span>
        <span>v1.0.0-beta · Open Source</span>
      </div>

      {/* Main nav */}
      <header
        className={`fixed left-0 right-0 z-40 transition-all duration-300 ${
          isScrolled
            ? "bg-[#0A0E17]/90 backdrop-blur-xl border-b border-[#3c4561] py-3"
            : "bg-transparent py-5"
        } md:top-8 top-0`}
      >
        <div className="container mx-auto px-6 md:px-16 max-w-7xl flex items-center justify-between">
          <a href="#" className="flex items-center z-50">
            <Image
              src="/logo-white-full.png"
              alt="Mini Manager"
              width={140}
              height={40}
              className="object-contain"
              priority
            />
          </a>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                className="text-sm font-medium text-[#bec2d3] hover:text-[#edeef3] transition-colors"
              >
                {link.name}
              </a>
            ))}
          </nav>

          {/* CTA buttons */}
          <div className="hidden md:flex items-center gap-3">
            <a
              href="#demo"
              className="text-sm font-medium px-5 py-2.5 rounded-xl bg-[#171c2f] border border-[#3c4561] text-[#bec2d3] hover:border-[#00E5FF]/40 hover:bg-[#1a2038] transition-all"
            >
              Try Demo
            </a>
            <a
              href="#downloads"
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#00E5FF] to-[#7C4DFF] text-white text-sm font-bold transition-all hover:opacity-90"
            >
              Download
            </a>
          </div>

          {/* Mobile Menu Toggle */}
          <button
            className="md:hidden text-[#bec2d3] hover:text-[#edeef3] z-50"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-40 bg-[#0A0E17]/97 backdrop-blur-xl pt-24 px-6 flex flex-col gap-6 md:hidden">
            <Image src="/logo-white-full.png" alt="Mini Manager" width={130} height={38} className="object-contain mb-2" />
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                className="text-2xl font-medium text-[#edeef3]"
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.name}
              </a>
            ))}
            <div className="h-px bg-[#3c4561] w-full my-4" />
            <a
              href="#demo"
              className="text-xl font-medium text-[#bec2d3]"
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
    </>
  );
}
