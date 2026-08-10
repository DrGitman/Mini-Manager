import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Features from "@/components/Features";
import DemoVideo from "@/components/DemoVideo";
import DownloadCenter from "@/components/DownloadCenter";
import OnlineDemo from "@/components/OnlineDemo";
import GeminiSection from "@/components/GeminiSection";
import Architecture from "@/components/Architecture";
import Screenshots from "@/components/Screenshots";
import Team from "@/components/Team";
import Roadmap from "@/components/Roadmap";
import FAQ from "@/components/FAQ";
import Footer from "@/components/Footer";
import ChatWidget from "@/components/ChatWidget";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0A0E17] text-white">
      <Navbar />
      <Hero />
      <DemoVideo />
      <Features />
      <DownloadCenter />
      <OnlineDemo />
      <GeminiSection />
      <Architecture />
      <Screenshots />
      <Team />
      <Roadmap />
      <FAQ />
      <Footer />
      <ChatWidget />
    </main>
  );
}
