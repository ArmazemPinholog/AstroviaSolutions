/* Variants compartilhadas do Framer Motion */

export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1];

export const reveal = {
  hidden: { opacity: 0, y: 26, filter: "blur(8px)" },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      duration: 0.9,
      delay: 0.15 + i * 0.09,
      ease: EASE_OUT_EXPO,
    },
  }),
};

export const springSoft = { type: "spring", stiffness: 300, damping: 22 };
