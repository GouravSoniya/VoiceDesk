'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { ArrowLeft, ArrowRight, Check, Loader2, PlusCircle, Trash2 } from 'lucide-react'

// Defined Sarvam voices
const SARVAM_VOICES = [
    { id: 'anushka', name: 'Anushka (Female)' },
    { id: 'vidya', name: 'Vidya (Female)' },
    { id: 'priya', name: 'Priya (Female)' },
    { id: 'abha', name: 'Abha (Female)' },
    { id: 'aditya', name: 'Aditya (Male)' },
    { id: 'rahul', name: 'Rahul (Male)' },
    { id: 'arvind', name: 'Arvind (Male)' },
    { id: 'ajit', name: 'Ajit (Male)' }
]

export default function AgentBuilder() {
    return (
        <Suspense fallback={
            <div className="flex-1 flex items-center justify-center bg-black text-white min-h-[100dvh]">
                <Loader2 className="animate-spin h-12 w-12 text-zinc-500" />
            </div>
        }>
            <AgentBuilderContent />
        </Suspense>
    )
}

function AgentBuilderContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const agentId = searchParams.get('agentId')
    const supabase = createClient()

    const [step, setStep] = useState(1)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isLoading, setIsLoading] = useState(!!agentId)
    const [error, setError] = useState<string | null>(null)

    // Form State
    const [basicInfo, setBasicInfo] = useState({ name: '', system_prompt: '' })
    const [voice, setVoice] = useState(SARVAM_VOICES[0].id)
    const [dataTable, setDataTable] = useState<{
        instructions: string;
        columns: { id: string; key: string }[];
        rows: { id: string; cells: Record<string, string> }[];
    }>({
        instructions: '',
        columns: [{ id: 'col1', key: 'product_name' }, { id: 'col2', key: 'price' }],
        rows: [
            { id: 'row1', cells: { col1: 'Premium Plan', col2: '$99/mo' } },
            { id: 'row2', cells: { col1: 'Basic Plan', col2: '$29/mo' } }
        ]
    })
    const [apiKeys, setApiKeys] = useState({ groq: '', sarvam: '' })

    useEffect(() => {
        if (agentId) {
            fetchAgentData()
        }
    }, [agentId])

    const fetchAgentData = async () => {
        try {
            // 1. Fetch agent basic info
            const { data: agent, error: agentError } = await supabase
                .from('agents')
                .select('*, profiles(groq_api_key, sarvam_api_key)')
                .eq('id', agentId)
                .single()

            if (agentError) throw agentError

            setBasicInfo({ name: agent.name, system_prompt: agent.system_prompt })
            setVoice(agent.voice || SARVAM_VOICES[0].id)

            const profile = Array.isArray(agent.profiles) ? agent.profiles[0] : agent.profiles;
            setApiKeys({
                groq: profile?.groq_api_key || '',
                sarvam: profile?.sarvam_api_key || ''
            })

            // 2. Fetch agent table data
            const { data: rows, error: rowsError } = await supabase
                .from('agent_data')
                .select('*')
                .eq('agent_id', agentId)
                .order('row_index', { ascending: true })

            if (rowsError) throw rowsError

            if (rows && rows.length > 0) {
                // Reconstruct columns
                const uniqueKeys = Array.from(new Set(rows.map(r => r.column_key)))
                const columns = uniqueKeys.map((key, i) => ({ id: `col${i + 1}`, key }))

                // Reconstruct rows
                const rowMap: Record<number, Record<string, string>> = {}
                rows.forEach(r => {
                    if (!rowMap[r.row_index]) rowMap[r.row_index] = {}
                    const colId = columns.find(c => c.key === r.column_key)?.id || ''
                    rowMap[r.row_index][colId] = r.cell_value
                })

                const tableRows = Object.entries(rowMap).map(([index, cells]) => ({
                    id: `row${parseInt(index) + 1}`,
                    cells
                }))

                setDataTable({
                    instructions: agent.table_instructions || '',
                    columns: columns.length > 0 ? columns : dataTable.columns,
                    rows: tableRows.length > 0 ? tableRows : dataTable.rows
                })
            }

        } catch (err: any) {
            setError(`Failed to load agent: ${err.message}`)
        } finally {
            setIsLoading(false)
        }
    }

    const handleNext = () => setStep((s) => Math.min(s + 1, 5))
    const handleBack = () => setStep((s) => Math.max(s - 1, 1))

    const addColumn = () => {
        const newColId = `col${dataTable.columns.length + 1}`
        setDataTable(prev => ({
            ...prev,
            columns: [...prev.columns, { id: newColId, key: `column_${prev.columns.length + 1}` }]
        }))
    }

    const addRow = () => {
        const newRowId = `row${dataTable.rows.length + 1}`
        setDataTable(prev => ({
            ...prev,
            rows: [...prev.rows, { id: newRowId, cells: {} }]
        }))
    }

    const deleteRow = (rowId: string) => {
        setDataTable(prev => ({
            ...prev,
            rows: prev.rows.filter(r => r.id !== rowId)
        }))
    }

    const updateCell = (rowId: string, colId: string, value: string) => {
        setDataTable(prev => ({
            ...prev,
            rows: prev.rows.map(row =>
                row.id === rowId ? { ...row, cells: { ...row.cells, [colId]: value } } : row
            )
        }))
    }

    const updateColumnKey = (colId: string, newKey: string) => {
        setDataTable(prev => ({
            ...prev,
            columns: prev.columns.map(col =>
                col.id === colId ? { ...col, key: newKey } : col
            )
        }))
    }

    const handleSaveAgent = async () => {
        setIsSubmitting(true)
        setError(null)
        try {
            const { data: { user }, error: userError } = await supabase.auth.getUser()
            if (userError || !user) throw new Error('You must be logged in.')

            // 1. Update Profile API Keys
            await supabase.from('profiles').update({
                groq_api_key: apiKeys.groq,
                sarvam_api_key: apiKeys.sarvam
            }).eq('id', user.id)

            let finalAgentId = agentId

            if (agentId) {
                // 2a. Update existing agent
                const { error: updateError } = await supabase
                    .from('agents')
                    .update({
                        name: basicInfo.name,
                        system_prompt: basicInfo.system_prompt,
                        voice: voice,
                        table_instructions: dataTable.instructions
                    })
                    .eq('id', agentId)

                if (updateError) throw updateError

                // 2b. Delete old table data and re-insert (simplest way to sync)
                await supabase.from('agent_data').delete().eq('agent_id', agentId)
            } else {
                // 3a. Create new agent
                const { data: freshAgent, error: createError } = await supabase
                    .from('agents')
                    .insert({
                        owner_id: user.id,
                        name: basicInfo.name,
                        system_prompt: basicInfo.system_prompt,
                        voice: voice,
                        table_instructions: dataTable.instructions,
                        is_active: true
                    })
                    .select('id')
                    .single()

                if (createError) throw createError
                finalAgentId = freshAgent.id
            }

            // 4. Insert table data
            const dataToInsert: any[] = []
            dataTable.rows.forEach((row, rIndex) => {
                dataTable.columns.forEach(col => {
                    dataToInsert.push({
                        agent_id: finalAgentId,
                        row_index: rIndex,
                        column_key: col.key,
                        cell_value: row.cells[col.id] || ''
                    })
                })
            })

            if (dataToInsert.length > 0) {
                const { error: dataError } = await supabase.from('agent_data').insert(dataToInsert)
                if (dataError) throw dataError
            }

            router.push(`/dashboard?${agentId ? 'updated' : 'new'}=${finalAgentId}`)
            router.refresh()

        } catch (err: any) {
            setError(err.message || 'An error occurred.')
            setIsSubmitting(false)
        }
    }

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-black text-white min-h-[100dvh]">
                <Loader2 className="animate-spin h-12 w-12 text-zinc-500" />
            </div>
        )
    }

    return (
        <div className="flex-1 w-full bg-black text-white min-h-[100dvh]">
            <nav className="w-full border-b border-zinc-800 h-16 sticky top-0 bg-black/80 backdrop-blur-md z-30 flex items-center justify-center">
                <div className="w-full max-w-5xl px-6 flex justify-between items-center">
                    <button onClick={() => router.back()} className="text-zinc-400 hover:text-white flex items-center gap-2 text-sm transition">
                        <ArrowLeft size={16} /> Back
                    </button>
                    <div className="font-bold text-lg tracking-tight">
                        {agentId ? 'Edit AI Agent' : 'Agent Builder'}
                    </div>
                    <div className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">
                        Step {step} of 5
                    </div>
                </div>
            </nav>

            <div className="max-w-4xl mx-auto px-6 py-12">
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-8 sm:p-12 shadow-2xl backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4 duration-700">
                    {error && (
                        <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 text-red-500 text-sm rounded-xl flex items-center gap-3">
                            <span className="w-2 h-2 rounded-full bg-red-500"></span>
                            {error}
                        </div>
                    )}

                    {/* Step Content */}
                    <div className="min-h-[400px]">
                        {step === 1 && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-right-4">
                                <header>
                                    <h2 className="text-3xl font-bold tracking-tight mb-2">Basic Identity</h2>
                                    <p className="text-zinc-500">Define how your agent identifies itself and behaves.</p>
                                </header>
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-xs uppercase tracking-widest font-bold text-zinc-600 ml-1">Agent Identity Name</label>
                                        <input
                                            type="text"
                                            value={basicInfo.name}
                                            onChange={(e) => setBasicInfo({ ...basicInfo, name: e.target.value })}
                                            className="w-full bg-black border border-zinc-800 rounded-2xl px-5 py-4 focus:border-white transition outline-none text-sm"
                                            placeholder="e.g. Luna Highgrove"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs uppercase tracking-widest font-bold text-zinc-600 ml-1">Brain & Personality System Prompt</label>
                                        <textarea
                                            value={basicInfo.system_prompt}
                                            onChange={(e) => setBasicInfo({ ...basicInfo, system_prompt: e.target.value })}
                                            className="w-full bg-black border border-zinc-800 rounded-2xl px-5 py-4 focus:border-white transition outline-none text-sm min-h-[200px] leading-relaxed"
                                            placeholder="You are Luna, a professional concierge..."
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {step === 2 && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-right-4">
                                <header>
                                    <h2 className="text-3xl font-bold tracking-tight mb-2">Vocal Profile</h2>
                                    <p className="text-zinc-500">Choose a voice that matches your agent's personality.</p>
                                </header>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {SARVAM_VOICES.map(v => (
                                        <button
                                            key={v.id}
                                            onClick={() => setVoice(v.id)}
                                            className={`p-6 rounded-2xl border text-left transition-all duration-300 ${voice === v.id ? 'bg-white text-black border-white shadow-xl scale-[1.02]' : 'bg-black text-white border-zinc-800 hover:border-zinc-600'}`}
                                        >
                                            <div className="font-bold text-lg mb-1">{v.name}</div>
                                            <div className={`text-[10px] uppercase tracking-widest font-bold ${voice === v.id ? 'text-zinc-500' : 'text-zinc-600'}`}>{v.id}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {step === 3 && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-right-4">
                                <header>
                                    <h2 className="text-3xl font-bold tracking-tight mb-2">Data Intelligence</h2>
                                    <p className="text-zinc-500">Enable the agent to read and modify its own internal knowledge table.</p>
                                </header>

                                <div className="overflow-hidden border border-zinc-800 rounded-2xl bg-black">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs text-left border-collapse">
                                            <thead>
                                                <tr className="border-b border-zinc-800 bg-zinc-900/40">
                                                    <th className="px-5 py-4 w-12 text-zinc-600">ID</th>
                                                    {dataTable.columns.map(col => (
                                                        <th key={col.id} className="px-5 py-4 border-l border-zinc-800 min-w-[140px]">
                                                            <input
                                                                type="text"
                                                                value={col.key}
                                                                onChange={(e) => updateColumnKey(col.id, e.target.value)}
                                                                className="bg-transparent font-bold border-none outline-none w-full text-white placeholder:text-zinc-700"
                                                                placeholder="Key"
                                                                title="Column Key (Must be unique)"
                                                            />
                                                        </th>
                                                    ))}
                                                    <th className="px-5 py-4 border-l border-zinc-800 w-12">
                                                        <button onClick={addColumn} className="text-white hover:scale-120 transition">
                                                            <PlusCircle size={16} />
                                                        </button>
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {dataTable.rows.map((row, rIdx) => (
                                                    <tr key={row.id} className="border-b border-zinc-800/50 hover:bg-zinc-900/20 group">
                                                        <td className="px-5 py-4 text-zinc-600">{rIdx + 1}</td>
                                                        {dataTable.columns.map(col => (
                                                            <td key={col.id} className="border-l border-zinc-800 px-0 py-0">
                                                                <input
                                                                    type="text"
                                                                    value={row.cells[col.id] || ''}
                                                                    onChange={(e) => updateCell(row.id, col.id, e.target.value)}
                                                                    className="w-full h-full px-5 py-4 bg-transparent border-none outline-none focus:bg-white/5 transition text-zinc-300"
                                                                    placeholder="..."
                                                                />
                                                            </td>
                                                        ))}
                                                        <td className="border-l border-zinc-800 px-3">
                                                            <button onClick={() => deleteRow(row.id)} className="text-zinc-700 hover:text-red-500 opacity-0 group-hover:opacity-100 transition">
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <button onClick={addRow} className="text-xs font-bold uppercase tracking-widest flex items-center gap-2 hover:text-zinc-400 transition">
                                    <PlusCircle size={14} /> Add New Entry
                                </button>

                                <div className="space-y-4 pt-4 border-t border-zinc-800">
                                    <div className="space-y-2">
                                        <label className="text-xs uppercase tracking-widest font-bold text-zinc-600 ml-1">Operational Instructions</label>
                                        <p className="text-[10px] text-zinc-600 ml-1 italic">Explain to the AI how to interpret and modify this table.</p>
                                        <textarea
                                            value={dataTable.instructions}
                                            onChange={(e) => setDataTable({ ...dataTable, instructions: e.target.value })}
                                            className="w-full bg-black border border-zinc-800 rounded-2xl px-5 py-4 focus:border-white transition outline-none text-sm min-h-[120px]"
                                            placeholder="Example: Search this table for prices..."
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {step === 4 && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-right-4">
                                <header>
                                    <h2 className="text-3xl font-bold tracking-tight mb-2">API Connectivity</h2>
                                    <p className="text-zinc-500">Provide your environment keys. These are stored on your secure private profile.</p>
                                </header>

                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-xs uppercase tracking-widest font-bold text-zinc-600 ml-1">Groq Intelligence Key</label>
                                        <input
                                            type="password"
                                            value={apiKeys.groq}
                                            onChange={(e) => setApiKeys({ ...apiKeys, groq: e.target.value })}
                                            className="w-full bg-black border border-zinc-800 rounded-2xl px-5 py-4 focus:border-white transition outline-none text-sm font-mono"
                                            placeholder="gsk_..."
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs uppercase tracking-widest font-bold text-zinc-600 ml-1">Sarvam Vocal Key</label>
                                        <input
                                            type="password"
                                            value={apiKeys.sarvam}
                                            onChange={(e) => setApiKeys({ ...apiKeys, sarvam: e.target.value })}
                                            className="w-full bg-black border border-zinc-800 rounded-2xl px-5 py-4 focus:border-white transition outline-none text-sm font-mono"
                                            placeholder="sk_..."
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {step === 5 && (
                            <div className="space-y-10 animate-in fade-in slide-in-from-right-4">
                                <header>
                                    <h2 className="text-3xl font-bold tracking-tight mb-2">Finalization</h2>
                                    <p className="text-zinc-500">Review your configuration before updating the agent neural node.</p>
                                </header>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 border-y border-zinc-800 py-10">
                                    <div className="space-y-1">
                                        <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-zinc-600">Identity</span>
                                        <p className="text-xl font-medium">{basicInfo.name || 'Anonymous'}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-zinc-600">Vocal</span>
                                        <p className="text-xl font-medium">{SARVAM_VOICES.find(v => v.id === voice)?.name || 'Default'}</p>
                                    </div>
                                    <div className="space-y-1 sm:col-span-2">
                                        <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-zinc-600">Cognitive Capacity</span>
                                        <p className="text-sm text-zinc-400 line-clamp-3 leading-relaxed mt-2">{basicInfo.system_prompt || 'No brain defined.'}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-zinc-600">Data Grid</span>
                                        <p className="text-xl font-medium">{dataTable.rows.length} Configured Rows</p>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-zinc-600">API Handshake</span>
                                        <p className="text-xl font-medium">{apiKeys.groq && apiKeys.sarvam ? 'Verified ✅' : 'Incomplete ❌'}</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Navigation */}
                    <footer className="mt-16 flex justify-between items-center bg-black/40 p-1 rounded-full border border-zinc-800">
                        <button
                            onClick={handleBack}
                            disabled={step === 1 || isSubmitting}
                            className={`flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold transition ${step === 1 || isSubmitting ? 'text-zinc-700 pointer-events-none' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
                        >
                            <ArrowLeft size={16} /> Back
                        </button>

                        <div className="hidden sm:flex gap-1.5">
                            {[1, 2, 3, 4, 5].map(i => (
                                <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${step === i ? 'bg-white w-4' : 'bg-zinc-800'}`}></div>
                            ))}
                        </div>

                        {step < 5 ? (
                            <button
                                onClick={handleNext}
                                className="bg-white text-black py-3 px-8 rounded-full flex items-center gap-2 transition hover:bg-zinc-200 font-bold text-sm"
                            >
                                Next <ArrowRight size={16} />
                            </button>
                        ) : (
                            <button
                                onClick={handleSaveAgent}
                                disabled={isSubmitting || !basicInfo.name || !apiKeys.groq || !apiKeys.sarvam}
                                className="bg-white text-black py-3 px-8 rounded-full flex items-center gap-2 transition hover:bg-green-100 disabled:opacity-50 font-black text-sm shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                            >
                                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                {isSubmitting ? 'Processing...' : agentId ? 'Update Agent' : 'Launch Agent'}
                            </button>
                        )}
                    </footer>
                </div>
            </div>
        </div>
    )
}
