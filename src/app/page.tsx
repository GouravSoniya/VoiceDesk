import Link from "next/link";
import { PlusCircle } from "lucide-react";

export default function Home() {
  return (
    <div className="flex-col flex items-center justify-center min-h-screen relative w-full overflow-hidden bg-background">
      {/* Background decorations */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-green-500/20 blur-[120px] pointer-events-none" />

      <main className="z-10 flex flex-col items-center max-w-4xl px-6 text-center">
        <div className="inline-flex items-center justify-center px-4 py-1.5 mb-8 text-sm font-medium tracking-wide border rounded-full border-foreground/20 text-foreground">
          <span className="mr-2">✨</span> Meet VoiceDesk
        </div>

        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8">
          Build No-Code <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-green-500">
            Voice AI Agents
          </span>
        </h1>

        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-12">
          Create AI agents with custom personalities, voices, and internal data. Share a public link and let anyone talk to your agent. Typeform meets ChatGPT meets Airtable.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
          <Link
            href="/signup"
            className="flex items-center justify-center px-8 py-4 text-base font-semibold text-white bg-foreground rounded-lg hover:bg-foreground/90 transition-all shadow-lg hover:shadow-xl hover:-translate-y-1"
          >
            Start Building for Free
            <PlusCircle className="ml-2 w-5 h-5" />
          </Link>
          <Link
            href="/login"
            className="flex items-center justify-center px-8 py-4 text-base font-semibold border border-foreground/20 rounded-lg md:hover:bg-foreground/5 transition-all text-foreground"
          >
            Log In
          </Link>
        </div>
      </main>

      <footer className="absolute bottom-8 text-sm text-muted-foreground">
        Powered by Groq & Sarvam AI
      </footer>
    </div>
  );
}
