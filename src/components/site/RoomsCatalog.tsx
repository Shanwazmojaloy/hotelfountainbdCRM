"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ROOMS, ROOM_FILTERS } from "@/lib/rooms";
import RoomCard from "./RoomCard";

type FilterId = (typeof ROOM_FILTERS)[number]["id"];

/**
 * Room catalog with animated filters. Filtering is instant (local state); the URL
 * is kept in sync via history.replaceState so links are shareable (?type=suite)
 * without triggering a Next navigation / page-transition re-fire.
 */
export default function RoomsCatalog() {
  const searchParams = useSearchParams();
  const initial = searchParams?.get("type") ?? null;
  const seed: FilterId = (ROOM_FILTERS.some((f) => f.id === initial) ? initial : "all") as FilterId;
  const [filter, setFilter] = useState<FilterId>(seed);

  const rooms = filter === "all" ? ROOMS : ROOMS.filter((r) => r.tier === filter);

  function selectFilter(id: FilterId) {
    setFilter(id);
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (id === "all") params.delete("type");
      else params.set("type", id);
      const qs = params.toString();
      window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
    }
  }

  return (
    <>
      {/* Filter chips */}
      <div className="mt-8 flex flex-wrap gap-2" role="tablist" aria-label="Filter rooms by type">
        {ROOM_FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => selectFilter(f.id)}
              role="tab"
              aria-selected={active}
              className={`relative rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                active ? "text-abyss" : "text-white/70 hover:text-white"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="room-filter-active"
                  className="absolute inset-0 -z-10 rounded-full bg-gradient-to-r from-neon-teal to-neon-cyan"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              {!active && (
                <span className="absolute inset-0 -z-10 rounded-full border border-white/12 bg-white/5" />
              )}
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Grid */}
      <motion.div layout className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {rooms.map((room) => (
            <motion.div
              key={room.slug}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
            >
              <RoomCard room={room} />
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    </>
  );
}
