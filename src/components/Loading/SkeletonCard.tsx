import React from 'react';

type Props = {
  className?: string;
  lines?: number;
};

const SkeletonCard: React.FC<Props> = ({ className = '', lines = 3 }) => (
  <div
    className={`rounded-xl border border-gray-100 bg-white p-4 shadow-soft animate-pulse ${className}`}
    aria-hidden
  >
    <div className="h-4 w-2/5 max-w-[12rem] rounded-md shimmer-bg mb-4" />
    {Array.from({ length: lines }, (_, i) => (
      <div
        key={i}
        className={`h-3 rounded-md shimmer-bg ${i < lines - 1 ? 'mb-2.5' : ''} ${
          i === lines - 1 ? 'w-3/5' : 'w-full'
        }`}
      />
    ))}
  </div>
);

export default SkeletonCard;
