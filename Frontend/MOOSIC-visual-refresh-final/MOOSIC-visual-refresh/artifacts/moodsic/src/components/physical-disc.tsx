import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import type { CSSProperties } from 'react';
export function PhysicalDisc({ name, art, color, playing = false }: { name: string; art: string; color: string; playing?: boolean }) {
  const reduced = useReducedMotion();
  const x = useMotionValue(0), y = useMotionValue(0);
  const pitch = useSpring(y, { stiffness: 90, damping: 24 });
  const yaw = useSpring(x, { stiffness: 90, damping: 24 });
  const shine = useTransform(yaw, value => value * 5);
  return <motion.div className="physical-disc" style={{ '--disc-ink': color, rotateX: pitch, rotateY: yaw } as CSSProperties}
    onPointerMove={event => {
      if (reduced || event.pointerType === 'touch') return;
      const rect = event.currentTarget.getBoundingClientRect();
      x.set(((event.clientX - rect.left) / rect.width - .5) * 16);
      y.set(-((event.clientY - rect.top) / rect.height - .5) * 12);
    }} onPointerLeave={() => { x.set(0); y.set(0); }}>
    <div className="physical-disc-spin" style={{ animationPlayState: playing && !reduced ? 'running' : 'paused' }}>
      <img className="physical-disc-art" src={art} alt="" draggable={false} />
      <div className="physical-disc-print"><span>MOOSIC RECORDINGS / COLLECTION</span><strong>{name}</strong><small>FOR YOUR CURRENT SELF · STEREO</small></div>
      <div className="physical-disc-grooves" />
    </div>
    <motion.div className="physical-disc-reflection" style={{ x: shine }} />
    <div className="physical-disc-metal" /><div className="physical-disc-spindle" />
  </motion.div>;
}
