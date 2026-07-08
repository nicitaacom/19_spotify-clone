import Header from "@/components/Header"
import SlowReverbEditor from "./components/SlowReverbEditor"

export const metadata = {
  title: "Slow & Reverb",
}

export default function SlowAndReverb() {
  return (
    <div className="h-full w-full overflow-x-hidden rounded-lg bg-surface text-white">
      <Header className="bg-gradient-to-b from-[#0f1f14] via-[#0b0f0c] to-transparent">
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
    </div>
  )
}
