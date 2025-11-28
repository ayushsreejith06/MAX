import DiscussionDetailClient from './DiscussionDetailClient';

// For static export, we must provide generateStaticParams
// Return a placeholder ID - the actual routing will be handled client-side
export async function generateStaticParams() {
  // Return a single placeholder entry to satisfy static export requirements
  // The client-side router will handle all actual IDs at runtime
  return [{ id: 'placeholder' }];
}

// Server component wrapper that renders the client component
// This is required for static export with dynamic routes
export default function DiscussionDetailPage() {
  return <DiscussionDetailClient />;
}

