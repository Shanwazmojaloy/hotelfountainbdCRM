"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import type { Room } from "@/lib/rooms";
import { openReservation } from "@/lib/reserve";
import { revealItem } from "./ScrollReveal";

/**
 * Glassmorphic room card: image, price badge, feature tags, Book Now.
 * Designed to sit inside a `stagger` ScrollReveal grid (uses revealItem variant).
 */
export default function RoomCard({ room }: { room: Room }) {
  return (
    <motion.article
      variants={revealItem}
      whileHover={{ y: -8 }}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      className="glass glass-sheen group flex h-full flex-col overflow-hidden transition-[box-shadow,border-color] duration-300 ease-fluid hover:border-neon-teal/45 hover:shadow-glow-teal"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <Image
          src={room.image}
          alt={room.name}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className="object-cover transition-transform duration-700 ease-fluid group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-abyss/85 via-abyss/10 to-transparent" />
        <span className="pill absolute left-4 top-4">{room.capacityLabel}</span>
        <span className="absolute bottom-4 right-4 rounded-full border border-gold/40 bg-abyss/60 px-3 py-1 font-mono text-sm font-semibold text-gold-soft backdrop-blur">
          {room.priceLabel}
          <span className="text-ink-dim"> / night</span>
        </span>
      </div>

      <div className="flex flex-1 flex-col p-6">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="font-display text-xl font-semibold text-white">{room.name}</h3>
          {room.variant && (
            <span className="rounded-full border border-neon-teal/30 bg-neon-teal/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neon-teal">
              {room.variant}
            </span>
          )}
        </div>
        <p className="mt-2 text-sm leading-relaxed text-white/60">{room.blurb}</p>

        <ul className="mt-4 flex flex-wrap gap-2">
          {room.features.map((f) => (
            <li
              key={f}
              className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/70"
            >
              {f}
            </li>
          ))}
        </ul>

        <div className="mt-auto flex items-center justify-between pt-6">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-white/40">Starting from</p>
            <p className="font-mono text-lg font-semibold text-white">
              {room.priceLabel} <span className="text-sm font-normal text-white/50">/ night</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => openReservation({ roomType: room.name })}
            className="btn-neon !px-5 !py-2.5"
            aria-label={`Book the ${room.name}`}
          >
            Book Now
          </button>
        </div>
      </div>
    </motion.article>
  );
}
