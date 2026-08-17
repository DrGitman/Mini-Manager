import { useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  FolderSearch,
  Wand2,
  ShieldAlert,
  RotateCcw,
  SlidersHorizontal,
  BarChart2,
  MessageSquare,
  Brain,
  Lock,
  ChevronDown,
  GitBranch,
  Mail,
  BookOpen,
  ArrowRight,
  Check,
  FileText,
  FileArchive,
  FileSpreadsheet,
  File,
  Menu,
  X,
  Zap,
  Sparkles,
  MonitorDown,
  Globe,
  MessageCircle,
  Star,
} from "lucide-react";

// ─── MOTION PRIMITIVES ────────────────────────────────────────────────────────

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Fades + lifts its children the first time they scroll into view.
 * Renders a plain div when the visitor prefers reduced motion.
 */
function Reveal({
  children,
  delay = 0,
  y = 24,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.55, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Same idea as Reveal, but plays immediately on mount rather than on scroll —
 * for above-the-fold content that is already visible on load.
 */
function FadeIn({
  children,
  delay = 0,
  y = 20,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

// ─── NAVBAR ───────────────────────────────────────────────────────────────────

function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = [
    { label: "Features", href: "#features" },
    { label: "Downloads", href: "#downloads" },
    { label: "Demo", href: "#demo" },
    { label: "Support", href: "#support" },
  ];

  return (
    <header className="sticky top-0 z-50 w-full bg-[#0c1120] border-b border-[#3c4561]">
      <div className="flex items-center justify-between px-6 py-4 max-w-[1204px] mx-auto">
        {/* Logo */}
        <a href="#" className="shrink-0">
          <img src="/logo-white-full.png" alt="Mini Manager" className="h-12 w-auto object-contain" />
        </a>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="font-medium text-[14px] text-[#bec2d3] hover:text-[#edeef3] transition-colors"
            >
              {l.label}
            </a>
          ))}
        </nav>

        {/* Desktop CTAs */}
        <div className="hidden md:flex items-center gap-2">
          <a
            href="#demo"
            className="bg-[#171c2f] border border-[#3c4561] text-[#bec2d3] font-bold text-[14px] px-4 py-2 rounded-lg hover:bg-[#1d2440] transition-colors whitespace-nowrap"
          >
            Try Demo
          </a>
          <a
            href="#downloads"
            className="bg-[#3364db] text-white font-bold text-[14px] px-4 py-2 rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            Download
          </a>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden text-[#bec2d3] hover:text-[#edeef3] p-1"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-[#0c1120] border-t border-[#3c4561] px-6 py-4 flex flex-col gap-4">
          {navLinks.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="font-medium text-[15px] text-[#bec2d3] hover:text-[#edeef3] transition-colors"
              onClick={() => setMobileOpen(false)}
            >
              {l.label}
            </a>
          ))}
          <div className="flex flex-col gap-2 pt-2">
            <a
              href="#demo"
              className="bg-[#171c2f] border border-[#3c4561] text-[#bec2d3] font-bold text-[14px] px-4 py-2.5 rounded-lg text-center"
              onClick={() => setMobileOpen(false)}
            >
              Try Demo
            </a>
            <a
              href="#downloads"
              className="bg-[#3364db] text-white font-bold text-[14px] px-4 py-2.5 rounded-lg text-center"
              onClick={() => setMobileOpen(false)}
            >
              Download
            </a>
          </div>
        </div>
      )}
    </header>
  );
}

// ─── HERO ─────────────────────────────────────────────────────────────────────

const heroFiles = [
  { ext: "PDF", name: "Invoice_Q3_2025.pdf", category: "Finance", confidence: 96, icon: FileText },
  { ext: "DOC", name: "resume_final_v3.docx", category: "Career", confidence: 91, icon: File },
  { ext: "ZIP", name: "vacation_photos.zip", category: "Photos", confidence: 88, icon: FileArchive },
  { ext: "TXT", name: "lecture_notes_week4.txt", category: "School", confidence: 94, icon: File },
  { ext: "XLS", name: "budget_tracker_2025.xlsx", category: "Finance", confidence: 97, icon: FileSpreadsheet },
];

const extColors: Record<string, string> = {
  PDF: "bg-red-500/20 text-red-400",
  DOC: "bg-blue-500/20 text-blue-400",
  ZIP: "bg-yellow-500/20 text-yellow-400",
  TXT: "bg-gray-500/20 text-gray-400",
  XLS: "bg-green-500/20 text-green-400",
};

function AppWindowMockup() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="w-full bg-[#131828] rounded-2xl border border-[#3c4561] overflow-hidden shadow-2xl">
      {/* Title bar */}
      <div className="flex items-center gap-2 px-3 sm:px-4 py-3 border-b border-[#3c4561] bg-[#0f1623]">
        <div className="w-3 h-3 rounded-full bg-red-500/70 shrink-0" />
        <div className="w-3 h-3 rounded-full bg-yellow-500/70 shrink-0" />
        <div className="w-3 h-3 rounded-full bg-green-500/70 shrink-0" />
        <span className="ml-2 sm:ml-3 text-[12px] sm:text-[13px] text-[#9198b7] truncate">
          Mini Manager — Organize
        </span>
        {/* Tab pills are decorative — drop them below lg so the bar never overflows */}
        <div className="ml-auto hidden lg:flex items-center gap-1">
          {["Organize", "Insights", "History", "Settings"].map((t, i) => (
            <span
              key={t}
              className={`text-[12px] px-3 py-1 rounded-md font-medium ${
                i === 0 ? "bg-[#3364db] text-white" : "text-[#9198b7]"
              }`}
            >
              {t}
            </span>
          ))}
        </div>
      </div>
      {/* Table header — Category column is dropped on narrow screens */}
      <div className="grid grid-cols-[1.6fr_1fr] sm:grid-cols-[2fr_1fr_1fr] gap-3 sm:gap-4 px-3 sm:px-5 py-2 border-b border-[#3c4561]">
        <span className="text-[10px] sm:text-[11px] font-medium text-[#9198b7] uppercase tracking-wider">File</span>
        <span className="hidden sm:block text-[11px] font-medium text-[#9198b7] uppercase tracking-wider">Category</span>
        <span className="text-[10px] sm:text-[11px] font-medium text-[#9198b7] uppercase tracking-wider">Confidence</span>
      </div>
      {/* Rows */}
      {heroFiles.map((f, i) => (
        <motion.div
          key={f.name}
          initial={reduceMotion ? false : { opacity: 0, x: -12 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.5 + i * 0.08, ease: EASE }}
          className="grid grid-cols-[1.6fr_1fr] sm:grid-cols-[2fr_1fr_1fr] gap-3 sm:gap-4 px-3 sm:px-5 py-2.5 border-b border-[#2a3050] hover:bg-[#1d2440] transition-colors"
        >
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${extColors[f.ext] ?? "bg-gray-500/20 text-gray-400"}`}>
              {f.ext}
            </span>
            <span className="text-[12px] sm:text-[13px] text-[#bec2d3] truncate">{f.name}</span>
          </div>
          <span className="hidden sm:block text-[13px] text-[#edeef3] truncate">{f.category}</span>
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex-1 h-1.5 bg-[#2a3050] rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-[#00E5FF] to-[#7C4DFF] rounded-full"
                initial={reduceMotion ? false : { width: 0 }}
                whileInView={{ width: `${f.confidence}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: 0.6 + i * 0.08, ease: EASE }}
                style={reduceMotion ? { width: `${f.confidence}%` } : undefined}
              />
            </div>
            <span className="text-[12px] sm:text-[13px] font-bold text-[#edeef3] shrink-0">{f.confidence}%</span>
          </div>
        </motion.div>
      ))}
      <div className="flex items-center justify-between gap-3 px-3 sm:px-5 py-3">
        <span className="text-[11px] sm:text-[12px] text-[#9198b7] truncate">5 files ready to organize</span>
        <button className="flex items-center gap-1.5 bg-[#3364db] text-white text-[12px] sm:text-[13px] font-bold px-3 sm:px-4 py-1.5 rounded-lg hover:opacity-90 transition-opacity shrink-0">
          <span className="hidden sm:inline">Organize 5 Files</span>
          <span className="sm:hidden">Organize</span>
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative w-full bg-[#0c1120] overflow-hidden">
      {/* Background glow */}
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-[#00E5FF] opacity-[0.04] blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 -right-60 w-[600px] h-[600px] rounded-full bg-[#7C4DFF] opacity-[0.04] blur-3xl pointer-events-none" />

      <div className="flex flex-col items-center px-5 sm:px-6 pt-16 sm:pt-20 md:pt-24 pb-16 md:pb-20 max-w-[1204px] mx-auto gap-10 md:gap-14">
        {/* Text block */}
        <div className="flex flex-col items-center gap-5 sm:gap-6 max-w-[820px]">
          {/* Eyebrow */}
          <FadeIn>
            <div className="bg-[#171c2f] border border-[#3c4561] rounded-full px-3 sm:px-4 py-2 flex items-center gap-2">
              <Brain size={16} className="text-[#00E5FF] shrink-0" />
              <span className="font-medium text-[#bec2d3] text-[11px] sm:text-[13px] tracking-[0.08em] uppercase text-center">
                AI FILE ORGANIZER FOR WINDOWS &amp; WEB
              </span>
            </div>
          </FadeIn>

          {/* Headline */}
          <FadeIn delay={0.08}>
            <h1 className="font-bold text-[34px] sm:text-[48px] md:text-[64px] leading-[1.1] text-[#edeef3] text-center text-balance">
              Your AI-Powered{" "}
              <span className="bg-gradient-to-r from-[#00E5FF] to-[#7C4DFF] bg-clip-text text-transparent">
                File Organizer
              </span>
            </h1>
          </FadeIn>

          {/* Subtitle */}
          <FadeIn delay={0.16}>
            <p className="text-[15px] sm:text-[17px] leading-[1.65] text-[#bec2d3] text-center max-w-[660px]">
              Mini Manager scans any folder, classifies every file with AI, and auto-organizes them into the right place — with confidence scores, sensitivity detection, and full undo history.
            </p>
          </FadeIn>

          {/* CTAs */}
          <FadeIn delay={0.24} className="w-full">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-wrap justify-center">
              <a
                href="#demo"
                className="bg-[#3364db] text-white font-bold text-[15px] sm:text-[16px] px-7 py-3.5 rounded-xl text-center transition-all duration-200 hover:bg-[#2a55c0] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#3364db]/30"
              >
                Try Online Demo
              </a>
              <a
                href="#downloads"
                className="flex items-center justify-center gap-2 bg-[#171c2f] border border-[#3c4561] text-[#bec2d3] font-bold text-[15px] sm:text-[16px] px-7 py-3.5 rounded-xl transition-all duration-200 hover:bg-[#1d2440] hover:border-[#00E5FF]/40 hover:-translate-y-0.5"
              >
                Download App <ArrowRight size={16} />
              </a>
            </div>
          </FadeIn>

          {/* Stat badges */}
          <FadeIn delay={0.32}>
            <div className="flex items-center gap-x-5 gap-y-2 flex-wrap justify-center">
              {["Groq + Gemini", "Full Undo", "Open Source", "Free Plan Available"].map((b) => (
                <div key={b} className="flex items-center gap-1.5 text-[13px] sm:text-[14px] font-medium text-[#9198b7]">
                  <Check size={14} className="text-[#00E5FF] shrink-0" />
                  {b}
                </div>
              ))}
            </div>
          </FadeIn>
        </div>

        {/* App window mockup */}
        <FadeIn delay={0.4} y={32} className="w-full max-w-[900px]">
          <AppWindowMockup />
        </FadeIn>
      </div>
    </section>
  );
}

// ─── FEATURES ─────────────────────────────────────────────────────────────────

const features = [
  {
    icon: FolderSearch,
    title: "Folder Scanner",
    desc: "Scan any folder and let the AI classify every file into categories: Documents, Images, Videos, Code, Finance, and more.",
  },
  {
    icon: Wand2,
    title: "AI Auto-Organize",
    desc: "Files are automatically moved to the right folders with smart naming. Confidence buckets let you review borderline decisions before applying.",
  },
  {
    icon: ShieldAlert,
    title: "Sensitivity Detection",
    desc: "Flags personal, financial, and identity documents before moving them, so nothing sensitive gets relocated without your approval.",
  },
  {
    icon: RotateCcw,
    title: "Full Undo & History",
    desc: "Every file operation is logged in a journal. Roll back any move, rename, or organization action instantly — no data ever lost.",
  },
  {
    icon: SlidersHorizontal,
    title: "Conventions & Rules",
    desc: 'Write natural-language rules like "Put all invoices in Finance/Invoices/2026" — the AI always follows them on every scan.',
  },
  {
    icon: BarChart2,
    title: "Insights",
    desc: "Detect duplicate files and stale files untouched for 90+ days. Get a clear picture of what's cluttering your storage.",
  },
  {
    icon: MessageSquare,
    title: "AI Chat Agent",
    desc: 'Give natural language commands like "move all PDFs from Downloads to Documents" and watch the AI handle it for you.',
  },
  {
    icon: Brain,
    title: "Corrections Memory",
    desc: "Every time you correct an AI decision, Mini Manager learns from it — improving classifications across all future scans.",
  },
  {
    icon: Lock,
    title: "Blocklist",
    desc: "Define protected paths that the AI will never touch. Keep sensitive directories completely off-limits, always.",
  },
];

function Features() {
  return (
    <section id="features" className="w-full bg-[#171c2f] py-16 md:py-24 px-5 sm:px-6 border-t border-[#3c4561]">
      <div className="flex flex-col items-center gap-16 max-w-[1204px] mx-auto">
        <div className="flex flex-col items-center gap-4 max-w-[680px] text-center">
          <span className="text-[12px] font-medium text-[#00E5FF] uppercase tracking-[0.15em]">Capabilities</span>
          <h2 className="font-bold text-[28px] sm:text-[34px] md:text-[42px] leading-[1.15] text-[#edeef3]">Why Mini Manager?</h2>
          <p className="text-[16px] leading-[1.65] text-[#bec2d3]">
            Everything you need to take back control of your file system — powered by Groq and Gemini AI working together to classify, organize, and protect your files.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 w-full">
          {features.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="bg-[#171c2f] border border-[#3c4561] rounded-2xl p-6 flex flex-col gap-4 transition-all duration-300 hover:border-[#00E5FF]/40 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/30"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00E5FF]/20 to-[#7C4DFF]/20 flex items-center justify-center">
                <Icon size={20} className="text-[#00E5FF]" />
              </div>
              <div className="flex flex-col gap-1.5">
                <h3 className="font-bold text-[17px] text-[#edeef3]">{title}</h3>
                <p className="text-[14px] leading-[1.6] text-[#bec2d3]">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── DOWNLOADS ────────────────────────────────────────────────────────────────

function Downloads() {
  const options = [
    {
      Icon: MonitorDown,
      tag: "Windows Installer",
      title: "Setup.exe Direct Download",
      version: "v1.0.0-beta",
      size: "68.2 MB",
      desc: "Get full desktop power for heavy-duty organizing, document scanning, and AI assistance on Windows.",
      cta: "Download Setup.exe",
      href: "#",
      primary: true,
    },
    {
      Icon: Globe,
      tag: "Live Preview",
      title: "Web Demo",
      version: "No install needed",
      size: "",
      desc: "Launch our web version in guest mode. Experience the full AI-powered UI in your browser.",
      cta: "Launch Online Demo",
      href: "#demo",
      primary: false,
    },
  ];

  return (
    <section id="downloads" className="w-full bg-[#0c1120] py-16 md:py-24 px-5 sm:px-6 border-t border-[#3c4561]">
      <div className="flex flex-col items-center gap-16 max-w-[1204px] mx-auto">
        <Reveal className="flex flex-col items-center gap-4 text-center">
          <span className="text-[12px] font-medium text-[#00E5FF] uppercase tracking-[0.15em]">Get Started</span>
          <h2 className="font-bold text-[28px] sm:text-[34px] md:text-[42px] leading-[1.15] text-[#edeef3]">Mini Manager for Windows</h2>
          <p className="text-[16px] leading-[1.65] text-[#bec2d3] max-w-[560px]">
            Built natively for Windows. High-performance desktop file management powered by Groq and Google Gemini.
          </p>
          <a href="#" className="flex items-center gap-2 text-[#bec2d3] hover:text-[#edeef3] font-medium text-[15px] transition-colors mt-1">
            <GitBranch size={16} /> View on GitHub
          </a>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full">
          {options.map((o) => (
            <div
              key={o.title}
              className={`rounded-2xl border p-6 flex flex-col gap-5 ${
                o.primary
                  ? "bg-gradient-to-b from-[#00E5FF]/10 to-[#7C4DFF]/10 border-[#00E5FF]/30"
                  : "bg-[#171c2f] border-[#3c4561]"
              }`}
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00E5FF]/20 to-[#7C4DFF]/20 flex items-center justify-center">
                    <o.Icon size={20} className="text-[#00E5FF]" />
                  </div>
                  <span className="text-[11px] font-medium text-[#9198b7] border border-[#3c4561] rounded-full px-2.5 py-0.5">
                    {o.tag}
                  </span>
                </div>
                <h3 className="font-bold text-[20px] text-[#edeef3]">{o.title}</h3>
                <div className="flex items-center gap-2 text-[13px] text-[#9198b7]">
                  <span>{o.version}</span>
                  {o.size && <><span>·</span><span>{o.size}</span></>}
                </div>
              </div>
              <p className="text-[14px] leading-[1.6] text-[#bec2d3] flex-1">{o.desc}</p>
              <a
                href={o.href}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-[15px] font-bold transition-all ${
                  o.primary
                    ? "bg-[#3364db] text-white hover:opacity-90"
                    : "bg-[#1d2440] text-[#bec2d3] hover:bg-[#232b50] border border-[#3c4561]"
                }`}
              >
                {o.cta} <ArrowRight size={15} />
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── DEMO ─────────────────────────────────────────────────────────────────────

function Demo() {
  const demoFeatures = [
    "Scan a simulated folder with pre-loaded files",
    "Watch the AI classify each file in real time",
    "Apply, skip, or undo any move decision",
    "Correct the AI and see it update its memory",
    "Try the AI chat agent with natural language commands",
    "Browse the full history and undo journal",
  ];

  return (
    <section id="demo" className="w-full bg-[#171c2f] py-16 md:py-24 px-5 sm:px-6 border-t border-[#3c4561]">
      <div className="flex flex-col items-center gap-12 max-w-[1204px] mx-auto">
        <div className="flex flex-col items-center gap-4 max-w-[640px] text-center">
          <span className="text-[12px] font-medium text-[#00E5FF] uppercase tracking-[0.15em]">Live Demo</span>
          <h2 className="font-bold text-[28px] sm:text-[34px] md:text-[42px] leading-[1.15] text-[#edeef3]">Experience Mini Manager</h2>
          <p className="text-[16px] leading-[1.65] text-[#bec2d3]">
            No install required. Launch our web version in guest mode and experience the full AI-powered interface directly in your browser.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 w-full items-start">
          {/* Feature list */}
          <div className="flex flex-col gap-4">
            <h3 className="font-bold text-[20px] text-[#edeef3]">What you can do in the demo</h3>
            <ul className="flex flex-col gap-3">
              {demoFeatures.map((f) => (
                <li key={f} className="flex items-start gap-3 text-[15px] text-[#bec2d3]">
                  <Check size={16} className="text-[#00E5FF] shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
            <p className="text-[13px] text-[#9198b7] mt-2">
              The web demo includes pre-loaded sample data. For device file scanning, download the Windows app.
            </p>
          </div>

          {/* Browser mockup */}
          <div className="bg-[#0c1120] border border-[#3c4561] rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[#3c4561] bg-[#0f1623]">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
              <span className="ml-2 text-[13px] text-[#9198b7] font-medium">demo.minimanager.app</span>
              <span className="ml-auto text-[12px] text-[#00E5FF] font-medium animate-pulse">● Live</span>
            </div>
            <div className="flex flex-col items-center justify-center gap-5 py-20 px-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#00E5FF]/20 to-[#7C4DFF]/20 flex items-center justify-center border border-[#3c4561]">
                <img src="/logo-white-icon.png" alt="Mini Manager" className="w-10 h-10 object-contain" />
              </div>
              <div>
                <p className="font-bold text-[22px] text-[#edeef3] mb-1">Interactive Demo</p>
                <p className="text-[14px] text-[#9198b7] max-w-[320px]">
                  Try the full Mini Manager UI — AI classification, organize, undo, corrections, and chat agent.
                </p>
              </div>
              <a
                href="#"
                className="bg-[#3364db] text-white font-bold text-[15px] px-8 py-3 rounded-xl hover:opacity-90 transition-opacity flex items-center gap-2"
              >
                Launch Demo <ArrowRight size={16} />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── AI SECTION ───────────────────────────────────────────────────────────────

function AISection() {
  const models = [
    {
      name: "Groq llama-3.3-70b",
      badge: "Speed",
      color: "#00E5FF",
      role: "Fast Classification at Scale",
      points: [
        "Classifies hundreds of files per second",
        "Assigns categories from filenames, extensions, and metadata",
        "Provides confidence scores for every classification",
        "Handles batch operations for large folder scans",
      ],
    },
    {
      name: "Google Gemini",
      badge: "Intelligence",
      color: "#7C4DFF",
      role: "Deep Understanding & Reasoning",
      points: [
        "Powers the AI chat agent for natural language commands",
        "Drives the conventions & rules engine",
        "Provides deep file content understanding",
        "Infers organizational style from your first scan",
      ],
    },
  ];

  return (
    <section id="gemini" className="w-full bg-[#0c1120] py-16 md:py-24 px-5 sm:px-6 border-t border-[#3c4561]">
      <div className="flex flex-col items-center gap-16 max-w-[1204px] mx-auto">
        <div className="flex flex-col items-center gap-4 max-w-[700px] text-center">
          <span className="text-[12px] font-medium text-[#00E5FF] uppercase tracking-[0.15em]">AI Intelligence</span>
          <h2 className="font-bold text-[28px] sm:text-[34px] md:text-[42px] leading-[1.15] text-[#edeef3]">Dual AI Intelligence Layer</h2>
          <p className="text-[16px] leading-[1.65] text-[#bec2d3]">
            Mini Manager uses two AI models working in tandem. Groq's llama-3.3-70b handles high-speed file classification at scale. Google Gemini provides deep understanding, powering the chat agent, rules engine, and onboarding inference.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
          {models.map((m) => (
            <div key={m.name} className="bg-[#171c2f] border border-[#3c4561] rounded-2xl p-7 flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: `${m.color}20` }}
                  >
                    <Zap size={20} style={{ color: m.color }} />
                  </div>
                  <div>
                    <p className="font-bold text-[16px] text-[#edeef3]">{m.name}</p>
                    <p className="text-[13px] text-[#9198b7]">{m.role}</p>
                  </div>
                </div>
                <span
                  className="text-[11px] font-bold px-2.5 py-1 rounded-full border"
                  style={{ color: m.color, borderColor: `${m.color}40`, background: `${m.color}15` }}
                >
                  {m.badge}
                </span>
              </div>
              <ul className="flex flex-col gap-2.5">
                {m.points.map((p) => (
                  <li key={p} className="flex items-start gap-2.5 text-[14px] text-[#bec2d3]">
                    <Check size={14} className="shrink-0 mt-0.5" style={{ color: m.color }} />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── ARCHITECTURE ─────────────────────────────────────────────────────────────

const techBadges = [
  { name: "Next.js", layer: "App" },
  { name: "FastAPI", layer: "API" },
  { name: "SQLite", layer: "Database" },
  { name: "Groq", layer: "AI" },
  { name: "Gemini", layer: "AI" },
  { name: "Electron", layer: "App" },
  { name: "Tailwind CSS", layer: "UI" },
  { name: "shadcn/ui", layer: "UI" },
  { name: "React", layer: "App" },
  { name: "TypeScript", layer: "App" },
  { name: "Python", layer: "API" },
  { name: "asyncpg", layer: "Database" },
];

const layerColors: Record<string, string> = {
  App: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  API: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  AI: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  Database: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  UI: "bg-pink-500/20 text-pink-400 border-pink-500/30",
};

function Architecture() {
  return (
    <section id="architecture" className="w-full bg-[#171c2f] py-16 md:py-24 px-5 sm:px-6 border-t border-[#3c4561]">
      <div className="flex flex-col items-center gap-16 max-w-[1204px] mx-auto">
        <div className="flex flex-col items-center gap-4 max-w-[640px] text-center">
          <span className="text-[12px] font-medium text-[#00E5FF] uppercase tracking-[0.15em]">Built On</span>
          <h2 className="font-bold text-[28px] sm:text-[34px] md:text-[42px] leading-[1.15] text-[#edeef3]">Modern Stack</h2>
          <p className="text-[16px] leading-[1.65] text-[#bec2d3]">
            A lean, performant architecture pairing an Electron desktop shell with a FastAPI backend and dual AI models for fast, accurate file organization.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 w-full">
          {techBadges.map((t) => (
            <div key={t.name} className="bg-[#0c1120] border border-[#3c4561] rounded-xl p-4 flex items-center gap-3">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border shrink-0 ${layerColors[t.layer]}`}>
                {t.layer}
              </span>
              <span className="font-bold text-[15px] text-[#edeef3]">{t.name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── SCREENSHOTS ──────────────────────────────────────────────────────────────

const screens = [
  {
    name: "Organize",
    desc: "Scan & apply AI moves",
    stats: [
      { label: "Documents", val: "12" },
      { label: "Finance", val: "5" },
      { label: "Photos", val: "9" },
    ],
    accent: "#00E5FF",
  },
  {
    name: "Insights",
    desc: "Duplicates & stale files",
    stats: [
      { label: "Duplicates", val: "3" },
      { label: "Stale (90d+)", val: "7" },
      { label: "Large files", val: "4" },
    ],
    accent: "#7C4DFF",
  },
  {
    name: "History",
    desc: "Full undo journal",
    stats: [
      { label: "Moved today", val: "18" },
      { label: "Undone", val: "2" },
      { label: "Total logged", val: "47" },
    ],
    accent: "#0891b2",
  },
  {
    name: "Settings",
    desc: "Rules, blocklist & prefs",
    stats: [
      { label: "Conventions", val: "4" },
      { label: "Blocked paths", val: "2" },
      { label: "Categories", val: "9" },
    ],
    accent: "#059669",
  },
];

function Screenshots() {
  const [active, setActive] = useState(0);
  const s = screens[active];

  return (
    <section className="w-full bg-[#0c1120] py-16 md:py-24 px-5 sm:px-6 border-t border-[#3c4561]">
      <div className="flex flex-col items-center gap-16 max-w-[1204px] mx-auto">
        <Reveal className="flex flex-col items-center gap-4 text-center">
          <span className="text-[12px] font-medium text-[#00E5FF] uppercase tracking-[0.15em]">Every Screen</span>
          <h2 className="font-bold text-[28px] sm:text-[34px] md:text-[42px] leading-[1.15] text-[#edeef3]">Every Screen Purpose-Built</h2>
          <p className="text-[16px] leading-[1.65] text-[#bec2d3] max-w-[520px]">
            Four focused views, no clutter. Just your files, organised.
          </p>
        </Reveal>

        <div className="w-full flex flex-col lg:flex-row gap-8 items-start">
          {/* Tab list */}
          <div className="flex flex-row lg:flex-col gap-2 lg:w-56 shrink-0 flex-wrap">
            {screens.map((sc, i) => (
              <button
                key={sc.name}
                onClick={() => setActive(i)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${
                  active === i
                    ? "bg-gradient-to-r from-[#00E5FF]/20 to-[#7C4DFF]/20 border border-[#00E5FF]/40 text-[#edeef3]"
                    : "bg-[#171c2f] border border-[#3c4561] text-[#bec2d3] hover:border-[#00E5FF]/30"
                }`}
              >
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: sc.accent }}
                />
                <div>
                  <p className="font-bold text-[14px]">{sc.name}</p>
                  <p className="text-[12px] text-[#9198b7]">{sc.desc}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Screen preview */}
          <div className="flex-1 bg-[#171c2f] border border-[#3c4561] rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-[#3c4561] bg-[#0f1623]">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
              <span className="ml-2 text-[12px] font-medium text-[#9198b7]">
                Mini Manager — {s.name}
              </span>
            </div>
            <div className="p-8 flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-[24px] text-[#edeef3]">{s.name}</h3>
                <button
                  className="flex items-center gap-1.5 text-[14px] font-medium px-3 py-1.5 rounded-lg transition-colors"
                  style={{ background: `${s.accent}20`, color: s.accent }}
                >
                  Open <ArrowRight size={13} />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {s.stats.map((st) => (
                  <div key={st.label} className="bg-[#0c1120] border border-[#3c4561] rounded-xl p-4 flex flex-col gap-1">
                    <span className="text-[28px] font-bold text-[#edeef3]">{st.val}</span>
                    <span className="text-[12px] text-[#9198b7]">{st.label}</span>
                  </div>
                ))}
              </div>
              <p className="text-[14px] text-[#9198b7]">{s.desc}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── ROADMAP ──────────────────────────────────────────────────────────────────

const roadmap = [
  {
    phase: "Phase 1",
    title: "Core Organizer",
    status: "complete" as const,
    items: [
      "Core architecture: Next.js + FastAPI + SQLite",
      "Groq llama-3.3-70b file classification",
      "Folder scanner & auto-organize engine",
      "Full undo journal & history log",
    ],
  },
  {
    phase: "Phase 2",
    title: "Intelligence Layer",
    status: "current" as const,
    items: [
      "Corrections memory (continuous learning)",
      "Natural-language conventions engine",
      "Sensitivity detection & flagging",
      "Blocklist & protected paths",
    ],
  },
  {
    phase: "Phase 3",
    title: "Expansion",
    status: "upcoming" as const,
    items: [
      "Cloud folder sync (Google Drive, OneDrive)",
      "Scheduled auto-organize with cron",
      "Multi-user workspace support",
      "CLI mode & public API",
    ],
  },
];

// ─── REVIEWS ──────────────────────────────────────────────────────────────────
//
// ⚠️  PLACEHOLDER CONTENT — these are not real customers. Replace with genuine
// quotes (with permission) before launch, or delete the <Reviews /> line in
// HomePage below. Keep this in sync with mini-manager-app/lib/reviews.ts.

const reviews = [
  {
    quote:
      'Cut my Downloads folder from 1,847 files to 12 clean folders in 20 minutes. Nothing else comes close.',
    name: 'Amara K.',
    role: 'Freelance Designer, Windhoek',
  },
  {
    quote:
      'The undo feature alone is worth it. I accidentally moved a whole project folder and got it back in one click.',
    name: 'Jürgen M.',
    role: 'Software Engineer, Berlin',
  },
  {
    quote: 'Finally understand my own file structure. The AI naming is scary accurate.',
    name: 'Thandiwe N.',
    role: 'Accountant, Johannesburg',
  },
]

function Reviews() {
  return (
    <section className="w-full bg-[#0c1120] py-16 md:py-24 px-5 sm:px-6 border-t border-[#3c4561]">
      <div className="flex flex-col items-center gap-12 md:gap-16 max-w-[1204px] mx-auto">
        <Reveal className="flex flex-col items-center gap-4 text-center">
          <span className="text-[12px] font-medium text-[#00E5FF] uppercase tracking-[0.15em]">
            Reviews
          </span>
          <h2 className="font-bold text-[28px] sm:text-[34px] md:text-[42px] leading-[1.15] text-[#edeef3]">
            What people say
          </h2>
          <p className="text-[16px] leading-[1.65] text-[#bec2d3] max-w-[520px]">
            From people who pointed Mini Manager at a folder they had given up on.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full">
          {reviews.map((r, i) => (
            <Reveal key={r.name} delay={i * 0.08}>
              <figure className="h-full bg-[#171c2f] border border-[#3c4561] rounded-2xl p-6 flex flex-col gap-5 transition-all duration-300 hover:border-[#00E5FF]/40 hover:-translate-y-1">
                <div className="flex gap-0.5" aria-label="5 out of 5">
                  {[...Array(5)].map((_, s) => (
                    <Star key={s} size={15} className="fill-[#3364db] text-[#3364db]" />
                  ))}
                </div>
                <blockquote className="text-[15px] leading-[1.65] text-[#edeef3] flex-1">
                  &ldquo;{r.quote}&rdquo;
                </blockquote>
                <figcaption className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#3364db] flex items-center justify-center shrink-0">
                    <span className="text-[13px] font-bold text-white">
                      {r.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[14px] font-bold text-[#edeef3] truncate">{r.name}</p>
                    <p className="text-[12px] text-[#9198b7] truncate">{r.role}</p>
                  </div>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

function Roadmap() {
  const statusStyle = {
    complete: { badge: "bg-green-500/15 text-green-400 border-green-500/30", label: "Complete", icon: Check },
    current: { badge: "bg-[#00E5FF]/15 text-[#00E5FF] border-[#00E5FF]/30", label: "In Progress", icon: Sparkles },
    upcoming: { badge: "bg-[#7C4DFF]/15 text-[#7C4DFF] border-[#7C4DFF]/30", label: "Upcoming", icon: ArrowRight },
  };

  return (
    <section className="w-full bg-[#171c2f] py-16 md:py-24 px-5 sm:px-6 border-t border-[#3c4561]">
      <div className="flex flex-col items-center gap-16 max-w-[1204px] mx-auto">
        <Reveal className="flex flex-col items-center gap-4 text-center">
          <span className="text-[12px] font-medium text-[#00E5FF] uppercase tracking-[0.15em]">Roadmap</span>
          <h2 className="font-bold text-[28px] sm:text-[34px] md:text-[42px] leading-[1.15] text-[#edeef3]">Project Roadmap</h2>
          <p className="text-[16px] leading-[1.65] text-[#bec2d3] max-w-[480px]">
            From hackathon prototype to a fully-featured AI file organizer.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full">
          {roadmap.map((r) => {
            const style = statusStyle[r.status];
            return (
              <div
                key={r.phase}
                className={`rounded-2xl border p-6 flex flex-col gap-5 ${
                  r.status === "current"
                    ? "bg-gradient-to-b from-[#00E5FF]/10 to-[#7C4DFF]/10 border-[#00E5FF]/30"
                    : "bg-[#0c1120] border-[#3c4561]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-[#9198b7] uppercase tracking-wider">{r.phase}</span>
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${style.badge}`}>
                    {style.label}
                  </span>
                </div>
                <h3 className="font-bold text-[20px] text-[#edeef3]">{r.title}</h3>
                <ul className="flex flex-col gap-2.5">
                  {r.items.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-[14px] text-[#bec2d3]">
                      <Check
                        size={14}
                        className="shrink-0 mt-0.5"
                        style={{
                          color:
                            r.status === "complete"
                              ? "#4ade80"
                              : r.status === "current"
                              ? "#00E5FF"
                              : "#7C4DFF",
                        }}
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────

const faqs = [
  {
    q: "Is Mini Manager free?",
    a: "There's a free plan that covers 250 file scans and 100 AI classifications per month, with unlimited undo and archive. If you need more, Pro lifts the scan and classification limits, and Business adds per-seat access for teams. The source is on GitHub either way.",
  },
  {
    q: "Does it work offline?",
    a: "The desktop app requires an internet connection to call the AI APIs for classification. File operations (moving, renaming, undo) work offline once classifications are cached.",
  },
  {
    q: "Is my data sent to the cloud?",
    a: "Only filenames, extensions, and basic metadata are sent to the AI APIs for classification. No file contents ever leave your machine.",
  },
  {
    q: "Can I undo mistakes?",
    a: "Yes — every file move and rename is logged in a journal. You can roll back any operation instantly from the History screen, with full timestamps.",
  },
  {
    q: "How does it learn my preferences?",
    a: "Through corrections memory — every time you correct an AI classification, Mini Manager records it and applies your preference to all future scans.",
  },
  {
    q: "What happens to sensitive files?",
    a: "Mini Manager flags files it detects as sensitive (financial, personal, identity documents) and holds them for your explicit approval before moving — they are never auto-organized.",
  },
];

function FAQ() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section className="w-full bg-[#0c1120] py-16 md:py-24 px-5 sm:px-6 border-t border-[#3c4561]">
      <div className="flex flex-col items-center gap-12 max-w-[800px] mx-auto">
        <Reveal className="flex flex-col items-center gap-4 text-center">
          <span className="text-[12px] font-medium text-[#00E5FF] uppercase tracking-[0.15em]">FAQ</span>
          <h2 className="font-bold text-[28px] sm:text-[34px] md:text-[42px] leading-[1.15] text-[#edeef3]">Frequently Asked Questions</h2>
        </Reveal>

        <div className="flex flex-col gap-3 w-full">
          {faqs.map((f, i) => (
            <div key={i} className="bg-[#171c2f] border border-[#3c4561] rounded-xl overflow-hidden">
              <button
                className="w-full flex items-center justify-between gap-4 px-6 py-4 text-left"
                onClick={() => setOpen(open === i ? null : i)}
              >
                <span className="font-bold text-[16px] text-[#edeef3]">{f.q}</span>
                <ChevronDown
                  size={18}
                  className={`shrink-0 text-[#9198b7] transition-transform duration-200 ${open === i ? "rotate-180" : ""}`}
                />
              </button>
              {open === i && (
                <div className="px-6 pb-5">
                  <p className="text-[15px] leading-[1.65] text-[#bec2d3]">{f.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── SUPPORT ──────────────────────────────────────────────────────────────────

function Support() {
  const channels = [
    {
      icon: GitBranch,
      title: "GitHub Issues",
      badge: "Bug Reports",
      desc: "Found a bug or unexpected behavior? Open an issue on GitHub. Include your OS version and steps to reproduce.",
      cta: "Open an Issue",
      href: "https://github.com/DrGitman/Mini-Manager/issues",
    },
    {
      icon: MessageCircle,
      title: "GitHub Discussions",
      badge: "Community",
      desc: "Questions, feature ideas, or want to show off your setup? GitHub Discussions is the place for it.",
      cta: "Join Discussion",
      href: "https://github.com/DrGitman/Mini-Manager/discussions",
    },
    {
      icon: Mail,
      title: "Email",
      badge: "Direct Support",
      desc: "For security concerns, privacy questions, or anything that needs direct human attention.",
      cta: "Send Email",
      href: "mailto:support@minimanager.app",
    },
  ];

  return (
    <section id="support" className="w-full bg-[#171c2f] py-16 md:py-24 px-5 sm:px-6 border-t border-[#3c4561]">
      <div className="flex flex-col items-center gap-16 max-w-[1204px] mx-auto">
        <Reveal className="flex flex-col items-center gap-4 text-center">
          <span className="text-[12px] font-medium text-[#00E5FF] uppercase tracking-[0.15em]">Support</span>
          <h2 className="font-bold text-[28px] sm:text-[34px] md:text-[42px] leading-[1.15] text-[#edeef3]">We've got you covered</h2>
          <p className="text-[16px] leading-[1.65] text-[#bec2d3] max-w-[500px]">
            Open source and community-driven. Multiple channels so you always have a way to get help.
          </p>
        </Reveal>

        {/* Channels */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full">
          {channels.map(({ icon: Icon, title, badge, desc, cta, href }) => (
            <div key={title} className="bg-[#0c1120] border border-[#3c4561] rounded-2xl p-6 flex flex-col gap-4 transition-all duration-300 hover:border-[#00E5FF]/40 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/30">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00E5FF]/20 to-[#7C4DFF]/20 flex items-center justify-center">
                  <Icon size={20} className="text-[#00E5FF]" />
                </div>
                <span className="text-[11px] font-bold text-[#00E5FF] bg-[#00E5FF]/15 px-2.5 py-1 rounded-full">
                  {badge}
                </span>
              </div>
              <div className="flex flex-col gap-1.5 flex-1">
                <h3 className="font-bold text-[17px] text-[#edeef3]">{title}</h3>
                <p className="text-[14px] leading-[1.6] text-[#bec2d3]">{desc}</p>
              </div>
              <a
                href={href}
                className="text-[14px] font-medium text-[#00E5FF] hover:text-[#7C4DFF] transition-colors"
              >
                {cta} →
              </a>
            </div>
          ))}
        </div>

        {/* Contact form */}
        <div className="w-full max-w-[620px] bg-[#0c1120] border border-[#3c4561] rounded-2xl p-8 flex flex-col gap-5">
          <h3 className="font-bold text-[20px] text-[#edeef3]">Send a message</h3>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-[#bec2d3]">Name</label>
              <input
                type="text"
                placeholder="Your name"
                className="bg-[#171c2f] border border-[#3c4561] rounded-xl px-4 py-2.5 text-[14px] text-[#edeef3] placeholder-[#9198b7] focus:outline-none focus:border-[#00E5FF] transition-colors"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-[#bec2d3]">Email</label>
              <input
                type="email"
                placeholder="you@email.com"
                className="bg-[#171c2f] border border-[#3c4561] rounded-xl px-4 py-2.5 text-[14px] text-[#edeef3] placeholder-[#9198b7] focus:outline-none focus:border-[#00E5FF] transition-colors"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-[#bec2d3]">Message</label>
              <textarea
                rows={4}
                placeholder="Describe your issue or question…"
                className="bg-[#171c2f] border border-[#3c4561] rounded-xl px-4 py-2.5 text-[14px] text-[#edeef3] placeholder-[#9198b7] focus:outline-none focus:border-[#00E5FF] transition-colors resize-none"
              />
            </div>
            <button className="bg-[#3364db] text-white font-bold text-[15px] py-3 rounded-xl hover:opacity-90 transition-opacity">
              Send Message
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── FOOTER ───────────────────────────────────────────────────────────────────

function Footer() {
  const links = {
    Product: [
      { label: "Features", href: "#features" },
      { label: "Downloads", href: "#downloads" },
      { label: "Demo", href: "#demo" },
    ],
    "Learn More": [
      { label: "AI Integration", href: "#gemini" },
      { label: "Architecture", href: "#architecture" },
      { label: "Roadmap", href: "#" },
    ],
  };

  return (
    <footer className="w-full bg-[#0c1120] border-t border-[#3c4561]">
      <div className="flex flex-col px-6 pt-16 pb-10 max-w-[1204px] mx-auto gap-12">
        <div className="flex flex-col lg:flex-row gap-12 w-full">
          {/* Brand */}
          <div className="flex flex-col gap-4 max-w-[300px]">
            <img src="/logo-white-full.png" alt="Mini Manager" className="h-12 w-auto object-contain object-left" />
            <p className="text-[14px] leading-[1.6] text-[#9198b7]">
              AI-powered file organizer for Windows and web. Scan, classify, and organize your files automatically — with full undo, sensitivity detection, and corrections memory.
            </p>
          </div>
          {/* Links */}
          <div className="flex flex-wrap gap-12 lg:ml-auto">
            {Object.entries(links).map(([group, items]) => (
              <div key={group} className="flex flex-col gap-3">
                <p className="font-bold text-[14px] text-[#edeef3]">{group}</p>
                {items.map((item) => (
                  <a
                    key={item.label}
                    href={item.href}
                    className="text-[14px] text-[#9198b7] hover:text-[#bec2d3] transition-colors"
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="w-full h-px bg-[#3c4561]" />

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-[14px] text-[#9198b7]">© 2026 Mini Manager. All rights reserved.</p>
          <p className="text-[14px] text-[#9198b7] flex items-center gap-1.5">
            Powered by{" "}
            <span className="font-bold text-[#00E5FF]">Groq</span>
            {" & "}
            <span className="font-bold text-[#7C4DFF]">Gemini</span>
          </p>
        </div>
      </div>
    </footer>
  );
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <div className="bg-[#0c1120] min-h-screen flex flex-col">
      <Navbar />
      <Hero />
      <Features />
      <Downloads />
      <Demo />
      <AISection />
      <Architecture />
      <Screenshots />
      <Reviews />
      <Roadmap />
      <FAQ />
      <Support />
      <Footer />
    </div>
  );
}
