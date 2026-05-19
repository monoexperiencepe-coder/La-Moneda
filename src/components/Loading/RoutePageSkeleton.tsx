import React from 'react';
import SkeletonCard from './SkeletonCard';
import SkeletonTableRows from './SkeletonTableRows';

/** Fallback premium para lazy routes / Suspense. */
const RoutePageSkeleton: React.FC = () => (
  <div className="animate-fade-in space-y-5 p-4 sm:p-6" aria-busy="true" aria-label="Cargando sección">
    <div className="space-y-2">
      <div className="h-7 w-48 max-w-[70%] rounded-lg shimmer-bg" />
      <div className="h-4 w-64 max-w-[90%] rounded-md shimmer-bg" />
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <SkeletonCard lines={2} />
      <SkeletonCard lines={2} />
      <SkeletonCard lines={2} className="hidden sm:block" />
    </div>
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-soft">
      <div className="mb-4 h-9 w-full max-w-md rounded-lg shimmer-bg" />
      <SkeletonTableRows rows={5} cols={4} />
    </div>
  </div>
);

export default RoutePageSkeleton;
