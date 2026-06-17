import Header from "@/components/Header"
import AccountContent from "./components/AccountContent"

export default function Page() {
  return (
    <div className="bg-surface rounded-lg w-full h-full overflow-x-hidden">
      <Header className="from-[#0f1f14] via-[#0b0f0c]">
        <div className="mb-2 flex flex-col gap-y-6">
          <h1 className="text-white text-3xl font-semibold">Account Settings</h1>
        </div>
      </Header>
      <AccountContent />
    </div>
  )
}
