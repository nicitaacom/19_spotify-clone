import Header from "@/components/Header"
import SlowReverbEditor from "./components/SlowReverbEditor"
import Link from "next/link"

export const metadata = {
  title: "Slow & Reverb",
}

export default function SlowAndReverb() {
  return (
    <div
      className="relative h-full w-full overflow-x-hidden rounded-lg text-white transition-colors duration-300"
      style={{ backgroundColor: "var(--srv-bg, #111111)" }}>
      <Header className="relative z-10 bg-gradient-to-b from-[#0f1f14] via-[#0b0f0c] to-transparent">
        <div className="mt-10">
          <div className="flex flex-col gap-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-rose-100">Tools</p>
            <h1 className="text-4xl font-bold text-white sm:text-5xl lg:text-7xl">Slow & Reverb</h1>
            <p className="max-w-2xl text-sm text-neutral-400 sm:text-base">
              Upload a track, slow it down, add reverb — all in your browser.
            </p>
          </div>
        </div>
      </Header>
      <SlowReverbEditor />

      <div className="relative z-10 border-t border-white/5 mt-8" />
      <p className="relative z-10 text-center text-neutral-500 text-xs py-6">
        6$/mo ? WTF - Claude free + hermes (free xAI Grok trial) - WORK HARD - credit to&nbsp;
        <Link className="text-blue-400 hover:text-blue-500 duration-75" href="https://vizzy.io" target="_blank">
          vizzy.io
        </Link>
        <br />
        🚀 Done with speed in: ~1h 51m | talk to me&nbsp;
        <Link
          className="text-blue-400 hover:text-blue-500 duration-75"
          href="https://nicitaa.com/appointment"
          target="_blank">
          here
        </Link>
      </p>
    </div>
  )
}
