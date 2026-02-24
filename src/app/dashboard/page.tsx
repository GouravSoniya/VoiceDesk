import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { PlusCircle } from 'lucide-react'
import { signout } from '../login/actions'
import AgentList from './AgentList'

export default async function Dashboard() {
    const supabase = createClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return redirect('/login')
    }

    // Fetch the user's agents
    const { data: agents, error } = await supabase
        .from('agents')
        .select('*')
        .order('created_at', { ascending: false })

    return (
        <div className="flex-1 w-full flex flex-col items-center bg-black min-h-[100dvh] text-white">
            <nav className="w-full flex justify-center border-b border-zinc-800 h-16 sticky top-0 bg-black/80 backdrop-blur-md z-30">
                <div className="w-full max-w-5xl flex justify-between items-center p-4 text-sm">
                    <div className="font-bold text-xl flex items-center gap-2 tracking-tighter">
                        <span className="bg-white text-black w-8 h-8 flex items-center justify-center rounded-lg">V</span>
                        <span>VoiceDesk</span>
                    </div>
                    <div className="flex flex-row items-center gap-6">
                        <span className="text-zinc-500 hidden sm:inline-block">{user.email}</span>
                        <form action={signout}>
                            <button className="py-2 px-4 rounded-full text-zinc-400 hover:text-white transition font-medium border border-zinc-800 hover:bg-zinc-900">
                                Logout
                            </button>
                        </form>
                    </div>
                </div>
            </nav>

            <div className="animate-in flex-1 flex flex-col gap-12 w-full max-w-5xl px-4 pt-16 pb-20">

                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-4xl font-bold tracking-tight mb-2">Workspace</h1>
                        <p className="text-zinc-500">Manage and monitor your AI voice agents.</p>
                    </div>
                    <Link
                        href="/builder"
                        className="bg-white hover:bg-zinc-200 text-black py-3 px-6 rounded-full flex items-center gap-2 transition shadow-xl font-bold text-sm"
                    >
                        <PlusCircle size={18} />
                        Create New Agent
                    </Link>
                </div>

                {error ? (
                    <div className="p-6 bg-red-500/5 border border-red-500/20 rounded-2xl">
                        <p className="text-red-500 text-sm">Error loading agents: {error.message}</p>
                    </div>
                ) : (
                    <AgentList initialAgents={agents || []} />
                )}
            </div>
        </div>
    )
}
