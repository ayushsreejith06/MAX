import SectorDetailClient from './SectorDetailClient';

// For static export, we must provide generateStaticParams
// Return a placeholder ID - the actual routing will be handled client-side
export async function generateStaticParams() {
  // Return a single placeholder entry to satisfy static export requirements
  // The client-side router will handle all actual IDs at runtime
  return [{ id: 'placeholder' }];
}

export default function SectorDetailPage() {
  return <SectorDetailClient />;
}

