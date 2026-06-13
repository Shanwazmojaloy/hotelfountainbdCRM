import type { Metadata } from "next";
import EditorialLanding from "@/components/site/EditorialLanding";

export const metadata: Metadata = {
  title: "Hotel Fountain — Dhaka's Finest Luxury Hotel",
  description:
    "An editorial stay in the heart of Dhaka — 28 premium rooms, rooftop dining and 24/7 concierge, minutes from the airport. Reserve your stay at Hotel Fountain.",
};

export default function HomePage() {
  return <EditorialLanding />;
}
