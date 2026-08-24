import Link from "next/link";
import { Ambulance, Hospital } from "lucide-react";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-gray-950">
      <div className="text-center">
        <h1 className="text-5xl font-black tracking-tight text-white">
          Pulse<span className="text-red-500">Route</span> <span className="text-red-400 text-3xl">AI</span>
        </h1>
        <p className="mt-2 text-gray-400 text-sm">AI-assisted local-first emergency coordination</p>
      </div>
      <div className="flex gap-6">
        <Link
          href="/paramedic"
          className="flex items-center gap-3 rounded-2xl bg-red-600 hover:bg-red-500 px-8 py-5 font-semibold text-white transition-all shadow-lg shadow-red-900/40"
        >
          <Ambulance size={22} /> Paramedic View
        </Link>
        <Link
          href="/hospital"
          className="flex items-center gap-3 rounded-2xl bg-gray-800 hover:bg-gray-700 px-8 py-5 font-semibold text-white transition-all shadow-lg"
        >
          <Hospital size={22} /> Hospital ER Dashboard
        </Link>
      </div>
    </main>
  );
}
