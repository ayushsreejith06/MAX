import { getDebateById } from "@/lib/api";

export default async function DebatePage({ params }: { params: { id: string } }) {
  const debateId = params.id;
  const debate = await getDebateById(debateId);

  return (
    <main className="p-8 text-gray-100">
      <h1 className="text-3xl font-bold mb-4">{debate.title}</h1>

      <div className="text-gray-400 text-sm mb-6">
        <p>Status: {debate.status}</p>
        <p>Created: {new Date(debate.createdAt).toLocaleString()}</p>
        <p>Updated: {new Date(debate.updatedAt).toLocaleString()}</p>
      </div>

      <h2 className="text-xl font-semibold mb-3">Messages</h2>

      {debate.messages.length === 0 ? (
        <p className="text-gray-500">No messages yet.</p>
      ) : (
        <div className="space-y-4">
          {debate.messages.map((msg, idx) => (
            <div key={idx} className="p-4 bg-gray-800 rounded-md">
              <div className="text-sm text-gray-400 mb-1">
                {msg.role} • {msg.agentId}
              </div>
              <p>{msg.content}</p>
              <div className="text-xs text-gray-500 mt-2">
                {new Date(msg.createdAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
