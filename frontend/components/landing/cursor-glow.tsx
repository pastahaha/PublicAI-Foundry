"use client";

import { useEffect } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

export function CursorGlow() {
  const mouseX = useMotionValue(-1000);
  const mouseY = useMotionValue(-1000);

  const springX = useSpring(mouseX, { stiffness: 120, damping: 20, mass: 0.8 });
  const springY = useSpring(mouseY, { stiffness: 120, damping: 20, mass: 0.8 });

  useEffect(() => {
    const move = (e: MouseEvent) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
    };
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, [mouseX, mouseY]);

  return (
    <motion.div
      className="pointer-events-none fixed inset-0 z-20 overflow-hidden"
      aria-hidden
    >
      {/* Primary glow — large, soft */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 700,
          height: 700,
          x: springX,
          y: springY,
          translateX: "-50%",
          translateY: "-50%",
          background:
            "radial-gradient(circle, rgba(99,102,241,0.07) 0%, rgba(139,92,246,0.04) 35%, transparent 65%)",
        }}
      />
      {/* Secondary glow — smaller, brighter core */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 200,
          height: 200,
          x: springX,
          y: springY,
          translateX: "-50%",
          translateY: "-50%",
          background:
            "radial-gradient(circle, rgba(129,120,255,0.06) 0%, transparent 70%)",
        }}
      />
    </motion.div>
  );
}
