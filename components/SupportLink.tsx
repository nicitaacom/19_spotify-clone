import { FiHeart, FiArrowUpRight } from "react-icons/fi"

export default function SupportLink() {
  return (
    <a
      href="https://www.paypal.com/ncp/payment/DUJSP5KTB3ZBG"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs text-neutral-300 transition hover:border-white/25 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon">
      <FiHeart size={14} /> Support with PayPal <FiArrowUpRight size={14} />
    </a>
  )
}
