import React from 'react';

/**
 * The sphere is the logo (docs/maties/design.md, section 2).
 *
 * Not an image: a circle clipped over three blurred gradient layers and a
 * glint, exactly as the founder built it. `still` freezes the layers, for
 * the small mark beside every assistant turn, so a long conversation does
 * not shimmer.
 */
export interface SphereProps {
  size?: number;
  still?: boolean;
  className?: string;
  title?: string;
}

const layerBase: React.CSSProperties = { position: 'absolute', borderRadius: '50%' };

const Sphere: React.FC<SphereProps> = ({ size = 48, still = false, className, title }) => {
  const animate = (name: string, duration: string, timing = 'linear'): React.CSSProperties => (
    still ? {} : { animation: `${name} ${duration} ${timing} infinite` }
  );
  return (
    <span
      className={`maties-sphere ${className ?? ''}`.trim()}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{
        flex: '0 0 auto',
        position: 'relative',
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        boxShadow: [
          '0 1px 2px rgba(24,74,68,.10)',
          `0 ${Math.round(size * 0.2)}px ${Math.round(size * 0.46)}px rgba(24,74,68,.18)`,
          `inset 0 -${Math.round(size * 0.15)}px ${Math.round(size * 0.25)}px rgba(14,58,54,.22)`,
          `inset 0 ${Math.round(size * 0.1)}px ${Math.round(size * 0.2)}px rgba(255,255,255,.6)`,
          'inset 0 0 0 .5px rgba(255,255,255,.5)',
        ].join(', '),
      }}
    >
      <span
        style={{
          ...layerBase,
          inset: '-40%',
          background: [
            'radial-gradient(44% 46% at 30% 24%, #f2f6d2 0%, rgba(242,246,210,0) 60%)',
            'radial-gradient(50% 52% at 74% 20%, #7fdcc6 0%, rgba(127,220,198,0) 66%)',
            'radial-gradient(54% 56% at 22% 76%, #a9de5c 0%, rgba(169,222,92,0) 68%)',
            'linear-gradient(160deg, #d8f0b4 0%, #6fcbb8 55%, #3aa0c4 100%)',
          ].join(', '),
          filter: `blur(${Math.max(1, size / 9.6)}px)`,
          ...animate('maties-sphere-a', '7s'),
        }}
      />
      <span
        style={{
          ...layerBase,
          inset: '-34%',
          opacity: 0.85,
          background: [
            'radial-gradient(40% 42% at 72% 74%, #2aa6c6 0%, rgba(42,166,198,0) 64%)',
            'radial-gradient(26% 26% at 56% 56%, #f2a45e 0%, rgba(242,164,94,0) 58%)',
            'radial-gradient(34% 36% at 20% 40%, #cfeeb0 0%, rgba(207,238,176,0) 62%)',
          ].join(', '),
          filter: `blur(${Math.max(1, size / 6.9)}px)`,
          ...animate('maties-sphere-b', '11s'),
        }}
      />
      <span
        style={{
          ...layerBase,
          inset: '-20%',
          background: [
            'radial-gradient(32% 34% at 50% 50%, #f6b26b 0%, rgba(246,178,107,0) 62%)',
            'radial-gradient(30% 32% at 24% 62%, #8ee06a 0%, rgba(142,224,106,0) 64%)',
          ].join(', '),
          filter: `blur(${Math.max(1, size / 8)}px)`,
          ...animate('maties-sphere-c', '9s', 'ease-in-out'),
        }}
      />
      <span
        style={{
          ...layerBase,
          left: '16%',
          top: '12%',
          width: '34%',
          height: '24%',
          background: 'radial-gradient(closest-side, rgba(255,255,255,.95), rgba(255,255,255,0))',
          filter: 'blur(1.5px)',
          ...animate('maties-sphere-glint', '5.5s', 'ease-in-out'),
        }}
      />
      <span
        style={{
          ...layerBase,
          left: '-10%',
          bottom: '-14%',
          width: '70%',
          height: '44%',
          background: 'radial-gradient(closest-side, rgba(255,255,255,.55), rgba(255,255,255,0))',
          filter: 'blur(3px)',
        }}
      />
    </span>
  );
};

export default Sphere;
