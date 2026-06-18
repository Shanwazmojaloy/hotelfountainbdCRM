import type { ReactNode } from "react";

/**
 * Shared section heading: eyebrow + display title with a highlighted word.
 * Pass the title with the emphasized word wrapped in <em> for the teal accent.
 */
export default function SectionHeading({
  eyebrow,
  title,
  intro,
  center = false,
}: {
  eyebrow: string;
  title: ReactNode;
  intro?: string;
  center?: boolean;
}) {
  return (
    <div className={center ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-3 font-display text-3xl font-medium leading-tight text-white sm:text-4xl md:text-5xl [&_em]:italic [&_em]:text-neon-teal">
        {title}
      </h2>
      {intro && <p className="mt-4 text-base leading-relaxed text-white/60">{intro}</p>}
    </div>
  );
}
