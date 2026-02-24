'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ExternalLink, Edit, Trash2, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function AgentList({ initialAgents }: { initialAgents: any[] }) {
    const router = useRouter()
    const [agents, setAgents] = useState(initialAgents)
    const [deletingId, setDeletingId] = useState<string | null>(null)

    const handleDelete = async (agentId: string, agentName: string) => {
        if (!confirm(`Are you sure you want to delete "${agentName}"? This action cannot be undone.`)) {
            return
        }

        setDeletingId(agentId)
        try {
            const res = await fetch(`/api/agent/${agentId}`, {
                method: 'DELETE'
            })

            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.error || 'Failed to delete agent')
            }

            // Update local state
            setAgents(prev => prev.filter(a => a.id !== agentId))
            router.refresh()
        } catch (err: any) {
            alert(err.message)
        } finally {
            setDeletingId(null)
        }
    }

    if (agents.length === 0) {
        return (
            <div className="text-center py-12 border border-dashed border-foreground/20 rounded-lg">
                <h3 className="text-xl mb-2 text-white">No agents yet</h3>
                <p className="text-zinc-500 mb-6">Create your first AI voice agent to get started.</p>
                <Link
                    href="/builder"
                    className="bg-white text-black py-2 px-6 rounded-md inline-flex items-center gap-2 hover:bg-zinc-200 transition font-medium"
                >
                    Build an Agent
                </Link>
            </div>
        )
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {agents.map((agent) => (
                <div key={agent.id} className="border border-zinc-800 rounded-xl p-6 flex flex-col gap-4 shadow-sm hover:shadow-md transition bg-zinc-900/50 group">
                    <div className="flex justify-between items-start">
                        <h2 className="text-xl font-semibold truncate text-white" title={agent.name}>{agent.name}</h2>
                        <span className={`text-[10px] uppercase font-bold tracking-widest px-2 py-1 rounded-full ${agent.is_active ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500'}`}>
                            {agent.is_active ? 'Active' : 'Inactive'}
                        </span>
                    </div>

                    <p className="text-sm text-zinc-500 line-clamp-2 min-h-[40px]" title={agent.system_prompt}>
                        {agent.system_prompt || 'No system prompt defined.'}
                    </p>

                    <div className="pt-4 mt-auto flex justify-between items-center border-t border-zinc-800/50">
                        <Link
                            href={`/agent/${agent.id}`}
                            target="_blank"
                            className="text-white hover:underline text-sm flex items-center gap-1.5 transition"
                        >
                            <ExternalLink size={14} /> Public Link
                        </Link>

                        <div className="flex gap-2">
                            <Link
                                href={`/builder?agentId=${agent.id}`}
                                className="text-zinc-500 hover:text-white p-2 transition rounded-lg hover:bg-zinc-800"
                                title="Edit Agent"
                            >
                                <Edit size={16} />
                            </Link>
                            <button
                                onClick={() => handleDelete(agent.id, agent.name)}
                                disabled={deletingId === agent.id}
                                className="text-zinc-500 hover:text-red-500 p-2 transition rounded-lg hover:bg-red-500/10 disabled:opacity-50"
                                title="Delete Agent"
                            >
                                {deletingId === agent.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                            </button>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}
