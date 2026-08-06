import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT, waLink } from "@/lib/site";
import GlassCard from "@/components/site/GlassCard";
import FadeIn from "@/components/site/FadeIn";
import JsonLd from "@/components/site/JsonLd";

// SEO batch 3 (2026-08-07): FIRST BANGLA PAGE — the bn variant of
// /airport-hotel-dhaka, hreflang-paired both directions. Bangla copy was
// OWNER-REVIEWED before ship (house rule: no machine-Bangla goes live without
// Shan's read). Content wrapped in <div lang="bn"> since the root <html> stays
// lang="en". Facts identical to the EN page — never let the two diverge.

const breadcrumb = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "হোম", item: "https://fountainbd.com/" },
    { "@type": "ListItem", position: 2, name: "ঢাকা এয়ারপোর্টের কাছে হোটেল", item: "https://fountainbd.com/bn/airport-hotel-dhaka" },
  ],
};

export const metadata: Metadata = {
  title: "ঢাকা এয়ারপোর্টের কাছে হোটেল — হোটেল ফাউন্টেন, নিকুঞ্জ",
  description:
    "হযরত শাহজালাল আন্তর্জাতিক বিমানবন্দর থেকে মাত্র ৮ মিনিটের দূরত্বে বুটিক হোটেল। ২৪/৭ ফ্রন্ট ডেস্ক, এয়ারপোর্ট পিকআপ, রুম ৳৪,০০০ থেকে। সরাসরি বুক করুন।",
  alternates: {
    canonical: "https://fountainbd.com/bn/airport-hotel-dhaka",
    languages: {
      en: "https://fountainbd.com/airport-hotel-dhaka",
      bn: "https://fountainbd.com/bn/airport-hotel-dhaka",
      "x-default": "https://fountainbd.com/airport-hotel-dhaka",
    },
  },
  openGraph: {
    title: "ঢাকা এয়ারপোর্টের কাছে হোটেল — ৮ মিনিটের দূরত্বে | হোটেল ফাউন্টেন",
    description:
      "বিমানবন্দর থেকে ৮ মিনিট, নিকুঞ্জ-২-এর শান্ত পরিবেশে। ২৪/৭ ফ্রন্ট ডেস্ক, এয়ারপোর্ট ট্রান্সফার, রুম প্রতি রাত ৳৪,০০০ থেকে।",
    url: "https://fountainbd.com/bn/airport-hotel-dhaka",
    siteName: "Hotel Fountain",
    type: "website",
    images: [{ url: "/images/hero-exterior.webp", width: 1200, height: 630, alt: "হোটেল ফাউন্টেন, নিকুঞ্জ-২, ঢাকা" }],
  },
  twitter: { card: "summary_large_image" },
};

const FAQS: { q: string; a: string }[] = [
  {
    q: "হোটেল ফাউন্টেন ঢাকা এয়ারপোর্ট থেকে কত দূরে?",
    a: "হযরত শাহজালাল আন্তর্জাতিক বিমানবন্দর (DAC) থেকে গাড়িতে প্রায় ৮ মিনিটের দূরত্বে, নিকুঞ্জ-২-এর শান্ত আবাসিক এলাকায় হোটেলটি অবস্থিত — ঠিকানা: হাউজ-০৫, রোড-০২, নিকুঞ্জ-২, ঢাকা ১২২৯।",
  },
  {
    q: "হোটেল কি এয়ারপোর্ট পিকআপের ব্যবস্থা করে?",
    a: "হ্যাঁ। স্যুট গেস্টদের জন্য এয়ারপোর্ট পিকআপ ও ড্রপ-অফ কমপ্লিমেন্টারি, আর অন্য সব গেস্টের জন্য ২৪/৭ ফ্রন্ট ডেস্ক ট্রান্সফারের ব্যবস্থা করে দেয়। ফ্লাইটের সময় জানিয়ে " + CONTACT.phone + " নম্বরে কল করুন বা হোয়াটসঅ্যাপে মেসেজ করুন।",
  },
  {
    q: "গভীর রাতের ফ্লাইটের পরে কি চেক-ইন করা যায়?",
    a: "যায়। ফ্রন্ট ডেস্ক ২৪ ঘণ্টাই খোলা, তাই গভীর রাত বা দেরি হওয়া ফ্লাইটের অতিথিদের সবসময়ই স্বাগত জানানো হয়। সাধারণ চেক-ইন দুপুর ১২টায়; রুম খালি থাকা সাপেক্ষে আর্লি চেক-ইনের অনুরোধও করা যায়।",
  },
  {
    q: "এয়ারপোর্টের কাছে হোটেল ফাউন্টেনে রুমের ভাড়া কত?",
    a: "ফাউন্টেন ডিলাক্স রুম প্রতি রাত ৳৪,০০০ থেকে শুরু, আর রয়্যাল স্যুট ৳৯,০০০ পর্যন্ত। সব রুমে ফাইবার ওয়াই-ফাই ফ্রি; প্রিমিয়াম ডিলাক্স ও তার উপরের ক্যাটাগরিতে সকালের নাস্তা অন্তর্ভুক্ত।",
  },
];

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  inLanguage: "bn",
  mainEntity: FAQS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

const FACTS = [
  { k: "৮ মিনিট", v: "হযরত শাহজালাল আন্তর্জাতিক বিমানবন্দর (DAC) থেকে গাড়িতে" },
  { k: "২৪/৭", v: "ফ্রন্ট ডেস্ক — গভীর রাতের আগমনেও স্বাগতম" },
  { k: "৳৪,০০০", v: "রুম প্রতি রাত ৳৪,০০০ থেকে, রয়্যাল স্যুট ৳৯,০০০" },
  { k: "পিকআপ", v: "এয়ারপোর্ট ট্রান্সফার — স্যুট গেস্টদের জন্য ফ্রি" },
] as const;

export default function AirportHotelBanglaPage() {
  return (
    <div lang="bn">
      <JsonLd data={faqSchema} />
      <JsonLd data={breadcrumb} />

      {/* ───────────────── PAGE HEADER ───────────────── */}
      <section className="section pb-12 pt-10">
        <FadeIn className="mx-auto max-w-2xl text-center" whileInView={false}>
          <p className="eyebrow">এয়ারপোর্ট করিডোর · নিকুঞ্জ-২</p>
          <h1 className="mt-4 font-display text-4xl font-medium leading-[1.15] text-white sm:text-5xl lg:text-6xl">
            ঢাকা এয়ারপোর্টের কাছে <span className="italic text-neon-teal">হোটেল</span>
          </h1>
          {/* AEO: সরাসরি, উদ্ধৃতিযোগ্য উত্তর। */}
          <p className="mt-5 text-base leading-relaxed text-white/60">
            হোটেল ফাউন্টেন হযরত শাহজালাল আন্তর্জাতিক বিমানবন্দর থেকে গাড়িতে মাত্র ৮ মিনিটের
            দূরত্বে, ঢাকার শান্ত নিকুঞ্জ-২ এলাকার একটি বুটিক হোটেল। ২৪/৭ ফ্রন্ট ডেস্ক,
            এয়ারপোর্ট ট্রান্সফার এবং প্রতি রাত ৳৪,০০০ থেকে রুম — ভোরের ফ্লাইট, গভীর রাতের
            আগমন কিংবা ব্যবসায়িক যাত্রাবিরতির জন্য আদর্শ।
          </p>
        </FadeIn>
      </section>

      {/* ───────────────── FACT GRID ───────────────── */}
      <section className="section pb-16">
        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-4 lg:grid-cols-4">
          {FACTS.map((f, i) => (
            <FadeIn key={f.k} delay={i * 0.05}>
              <GlassCard className="h-full p-6 text-center">
                <p className="font-display text-3xl font-medium text-neon-teal">{f.k}</p>
                <p className="mt-2 text-xs leading-relaxed text-white/60">{f.v}</p>
              </GlassCard>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ───────────────── WHY STAY HERE ───────────────── */}
      <section className="section pb-16">
        <div className="mx-auto max-w-3xl">
          <GlassCard className="p-7 sm:p-9">
            <h2 className="font-display text-2xl font-semibold text-white">
              DAC-এর যাত্রীদের জন্যই সাজানো
            </h2>
            <div className="mt-4 space-y-4 text-sm leading-relaxed text-white/70">
              <p>
                নিকুঞ্জ-২ এয়ারপোর্ট করিডোরের ঠিক পাশে — ফ্লাইট দেরি হলেও কয়েক মিনিটেই
                বিছানায়, আবার আবাসিক এলাকার ভেতরে বলে রানওয়ের শব্দ ছাড়াই ঘুম। ফ্রন্ট ডেস্ক
                ২৪ ঘণ্টা খোলা — রাত ৩টার অতিথি রিসিভ করা, ফ্লাইটের ফাঁকে লাগেজ রাখা কিংবা
                ভোরের ফ্লাইটের জন্য ওয়েক-আপ কল, সবই এখানকার প্রতিদিনের কাজ।
              </p>
              <p>
                প্রতিটি রুমে ফাইবার ওয়াই-ফাই, আর রুফটপ রেস্টুরেন্ট খোলা সকাল ৭টা থেকে রাত
                ১১টা পর্যন্ত — ইন-রুম ডাইনিং চলে সারাক্ষণ।{" "}
                <Link href="/rooms" className="text-neon-teal transition hover:text-white">
                  ৳৪,০০০ থেকে শুরু পাঁচটি রুম ক্যাটাগরি দেখুন
                </Link>{" "}
                — অথবা ইংরেজিতে পড়তে চাইলে{" "}
                <Link href="/airport-hotel-dhaka" className="text-neon-teal transition hover:text-white">
                  English version
                </Link>
                ।
              </p>
            </div>
          </GlassCard>
        </div>
      </section>

      {/* ───────────────── FAQ ───────────────── */}
      <section className="section pb-16">
        <div className="mx-auto max-w-3xl">
          <GlassCard className="p-7 sm:p-9">
            <h2 className="font-display text-2xl font-semibold text-white">সচরাচর জিজ্ঞাসা</h2>
            <dl className="mt-4">
              {FAQS.map((f, i) => (
                <FadeIn key={f.q} delay={i * 0.04}>
                  <div className="border-t border-white/8 py-6 first:border-t-0 first:pt-2">
                    <dt className="font-display text-lg font-semibold text-white">{f.q}</dt>
                    <dd className="mt-2 text-sm leading-relaxed text-white/70">{f.a}</dd>
                  </div>
                </FadeIn>
              ))}
            </dl>
          </GlassCard>

          <FadeIn>
            <p className="mt-8 text-center text-sm text-white/50">
              শিগগিরই ল্যান্ড করছেন?{" "}
              <a href={CONTACT.phoneHref} className="text-neon-teal transition hover:text-white">
                {CONTACT.phone} নম্বরে কল করুন
              </a>{" "}
              অথবা ফ্লাইটের সময় জানিয়ে{" "}
              <a
                href={waLink("আসসালামু আলাইকুম! আমি ঢাকা এয়ারপোর্টে নামছি — একটি রুম বুক করতে চাই।")}
                className="text-neon-teal transition hover:text-white"
                target="_blank"
                rel="noopener noreferrer"
              >
                হোয়াটসঅ্যাপে মেসেজ করুন
              </a>
              ।
            </p>
          </FadeIn>
        </div>
      </section>
    </div>
  );
}
