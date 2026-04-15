import { useState } from 'react'
import { motion } from 'framer-motion'

interface Particle {
  id: number
  x: number
  delay: number
  duration: number
  size: number
  color: string
}

interface CelebrationParticlesProps {
  /** Number of particles per burst (default 18). Pass a smaller value for
   * more frequent, lighter bursts (e.g. one per incoming vote). */
  count?: number
}

function createParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 0.4,
    duration: 0.7 + Math.random() * 0.5,
    size: 4 + Math.random() * 8,
    color: i % 3 === 0 ? 'bg-primary/60' : i % 3 === 1 ? 'bg-neon/50' : 'bg-ember/50',
  }))
}

/**
 * Sparkle particles that burst upward from the parent's bottom edge.
 *
 * Place inside a `relative` container — the particles are absolutely
 * positioned within `inset-0`. To trigger a fresh burst (e.g. each time a
 * new vote comes in), pass a changing `key` prop so React remounts the
 * component and the lazy initializer recomputes random positions.
 */
export function CelebrationParticles({ count = 18 }: CelebrationParticlesProps = {}) {
  // Lazy state initializer so Math.random is only called once on mount
  // (React Compiler rejects calls to impure functions during render).
  const [particles] = useState<Particle[]>(() => createParticles(count))

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden" aria-hidden="true">
      {particles.map(p => (
        <motion.div
          key={p.id}
          className={`absolute rounded-full ${p.color}`}
          style={{ left: `${p.x}%`, width: p.size, height: p.size }}
          initial={{ y: '50%', opacity: 1, scale: 0 }}
          animate={{ y: '-120%', opacity: 0, scale: 1.2 }}
          transition={{ delay: p.delay, duration: p.duration, ease: 'easeOut' }}
        />
      ))}
    </div>
  )
}
