import { useState } from 'react'
import { m } from 'framer-motion'

interface Particle {
  id: number
  x: number
  delay: number
  duration: number
  size: number
  color: string
}

interface CelebrationParticlesProps {
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

export function CelebrationParticles({ count = 18 }: CelebrationParticlesProps = {}) {
  const [particles] = useState<Particle[]>(() => createParticles(count))

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden" aria-hidden="true">
      {particles.map(p => (
        <m.div
          key={p.id}
          className={`absolute rounded-full ${p.color}`}
          style={{ left: `${p.x}%`, width: p.size, height: p.size }}
          initial={{ y: '50%', opacity: 1, scale: 0.95 }}
          animate={{ y: '-120%', opacity: 0, scale: 1.2 }}
          transition={{ delay: p.delay, duration: p.duration, ease: 'easeOut' }}
        />
      ))}
    </div>
  )
}
