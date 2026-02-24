'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Send, Mic, MicOff, Volume2, Square, Loader2, MessageSquare, Phone } from 'lucide-react'

interface AgentInfo {
    name: string
    voice: string
}

interface Message {
    id: string
    role: 'user' | 'assistant' | 'system' | 'tool'
    content: string
}

export default function AgentPage({ params }: { params: { agentId: string } }) {
    const agentId = params.agentId

    const [sessionId, setSessionId] = useState('')
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [viewMode, setViewMode] = useState<'chat' | 'voice'>('voice')

    // Voice state
    const [isRecording, setIsRecording] = useState(false)
    const [isPlayingAudio, setIsPlayingAudio] = useState(false)
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const audioChunksRef = useRef<Blob[]>([])
    const currentAudioRef = useRef<HTMLAudioElement | null>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        // Generate a unique session ID for this browser session
        let sid = localStorage.getItem(`session_${agentId}`)
        if (!sid) {
            sid = uuidv4()
            localStorage.setItem(`session_${agentId}`, sid)
        }
        setSessionId(sid)

        // Fetch agent info immediately (just name/status, public)
        const fetchAgent = async () => {
            try {
                const res = await fetch(`/api/agent/info?id=${agentId}`)
                if (!res.ok) throw new Error('Agent not found or inactive')
                const data = await res.json()
                setAgentInfo(data)

                // Add initial greeting message
                setMessages([{
                    id: uuidv4(),
                    role: 'assistant',
                    content: `Hi! I'm ${data.name}. How can I help you today?`
                }])
            } catch (err: any) {
                setError(err.message)
            }
        }
        fetchAgent()

        // Cleanup audio on unmount
        return () => stopAudio()
    }, [agentId])

    useEffect(() => {
        if (viewMode === 'chat') {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }
    }, [messages, viewMode])

    const stopAudio = () => {
        if (currentAudioRef.current) {
            currentAudioRef.current.pause()
            currentAudioRef.current.currentTime = 0
            setIsPlayingAudio(false)
        }
    }

    // --- CHAT LOGIC ---
    const handleSendChat = async (e?: React.FormEvent) => {
        e?.preventDefault()
        if (!input.trim() || isLoading) return

        const userMessage = input.trim()
        setInput('')
        await processUserMessage(userMessage)
    }

    const processUserMessage = async (text: string) => {
        stopAudio() // Stop any currently playing audio when user speaks/types
        setIsLoading(true)

        const newMsg: Message = { id: uuidv4(), role: 'user', content: text }
        setMessages(prev => [...prev, newMsg])

        try {
            const res = await fetch('/api/agent/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ agentId, sessionId, message: text })
            })

            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.error || 'Failed to get response')
            }

            const data = await res.json()

            const assistantMsg: Message = { id: uuidv4(), role: 'assistant', content: data.reply }
            setMessages(prev => [...prev, assistantMsg])

        } catch (err: any) {
            setError(err.message)
        } finally {
            setIsLoading(false)
        }
    }

    // --- VOICE LOGIC ---
    const startRecording = async () => {
        stopAudio()
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            const mediaRecorder = new MediaRecorder(stream)
            mediaRecorderRef.current = mediaRecorder
            audioChunksRef.current = []

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data)
                }
            }

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
                stream.getTracks().forEach(track => track.stop()) // Stop microphone
                await handleVoiceSubmit(audioBlob)
            }

            mediaRecorder.start()
            setIsRecording(true)
        } catch (err) {
            console.error("Error accessing microphone:", err)
            setError("Microphone access denied or unavailable.")
        }
    }

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop()
            setIsRecording(false)
        }
    }

    const handleVoiceSubmit = async (audioBlob: Blob) => {
        setIsLoading(true)
        try {
            // 1. Send to Sarvam STT
            const formData = new FormData()
            formData.append('audio', audioBlob, 'recording.webm')
            formData.append('agentId', agentId)

            const sttRes = await fetch('/api/agent/stt', {
                method: 'POST',
                body: formData
            })

            if (!sttRes.ok) throw new Error('Speech recognition failed')

            const { transcript } = await sttRes.json()

            if (!transcript || transcript.trim() === '') {
                throw new Error("Couldn't hear anything. Please try again.")
            }

            // 2. Add to chat history
            const newMsg: Message = { id: uuidv4(), role: 'user', content: transcript }
            setMessages(prev => [...prev, newMsg])

            // 3. Send to Groq Chat API
            const chatRes = await fetch('/api/agent/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ agentId, sessionId, message: transcript })
            })

            if (!chatRes.ok) throw new Error('Chat generation failed')

            const { reply } = await chatRes.json()

            const assistantMsg: Message = { id: uuidv4(), role: 'assistant', content: reply }
            setMessages(prev => [...prev, assistantMsg])

            // 4. Send reply to Sarvam TTS and play audio
            await playTTS(reply)

        } catch (err: any) {
            setError(err.message)
            setIsLoading(false)
        }
    }

    const playTTS = async (text: string) => {
        setIsLoading(true)
        try {
            const ttsRes = await fetch('/api/agent/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ agentId, text })
            })

            if (!ttsRes.ok) throw new Error('Text-to-speech failed')

            const audioBlob = await ttsRes.blob()
            const audioUrl = URL.createObjectURL(audioBlob)

            if (currentAudioRef.current) {
                currentAudioRef.current.pause()
            }

            const audio = new Audio(audioUrl)
            currentAudioRef.current = audio

            audio.onplay = () => setIsPlayingAudio(true)
            audio.onended = () => setIsPlayingAudio(false)
            audio.onerror = () => setIsPlayingAudio(false)

            await audio.play()
        } catch (err: any) {
            setError(err.message)
        } finally {
            setIsLoading(false)
        }
    }

    if (error && !agentInfo) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-4 bg-black text-white min-h-[100dvh]">
                <div className="text-center">
                    <h2 className="text-4xl font-light mb-4">Error</h2>
                    <p className="text-zinc-400 max-w-sm">{error}</p>
                </div>
            </div>
        )
    }

    if (!agentInfo) {
        return (
            <div className="flex-1 flex items-center justify-center bg-black text-white min-h-[100dvh]">
                <Loader2 className="animate-spin h-12 w-12 text-zinc-500" />
            </div>
        )
    }

    return (
        <div className="flex-1 flex flex-col h-[100dvh] bg-black text-white relative overflow-hidden font-sans">
            <style jsx global>{`
                @keyframes pulse-ring {
                    0% { transform: scale(0.8); opacity: 0.5; }
                    50% { transform: scale(1.1); opacity: 0.8; }
                    100% { transform: scale(0.8); opacity: 0.5; }
                }
                .pulse-circle {
                    animation: pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                }
                .pulse-circle-fast {
                    animation: pulse-ring 1s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                }
            `}</style>

            {/* Header */}
            <header className="px-6 py-6 flex items-center justify-between z-20 shrink-0 border-b border-zinc-800/50 bg-black/80 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center text-xl font-bold">
                        {agentInfo.name.charAt(0)}
                    </div>
                    <div>
                        <h1 className="font-medium text-lg tracking-tight">{agentInfo.name}</h1>
                        <div className="flex items-center text-[10px] uppercase font-bold tracking-widest text-zinc-500 gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${isLoading ? 'bg-zinc-400' : 'bg-white'} ${isLoading ? 'animate-pulse' : ''}`}></span>
                            {isLoading ? 'Processing' : 'Active'}
                        </div>
                    </div>
                </div>

                <div className="flex bg-zinc-900/80 p-1 rounded-full border border-zinc-800">
                    <button
                        onClick={() => setViewMode('voice')}
                        className={`p-2 px-4 rounded-full flex items-center gap-2 text-xs font-semibold transition-all ${viewMode === 'voice' ? 'bg-white text-black shadow-lg' : 'text-zinc-500 hover:text-white'}`}
                    >
                        <Phone size={14} /> Voice
                    </button>
                    <button
                        onClick={() => setViewMode('chat')}
                        className={`p-2 px-4 rounded-full flex items-center gap-2 text-xs font-semibold transition-all ${viewMode === 'chat' ? 'bg-white text-black shadow-lg' : 'text-zinc-500 hover:text-white'}`}
                    >
                        <MessageSquare size={14} /> Chat
                    </button>
                </div>
            </header>

            {/* Content Area */}
            <main className="flex-1 flex flex-col relative overflow-hidden">
                {error && (
                    <div className="absolute top-4 left-6 right-6 z-50 animate-in slide-in-from-top-4 duration-500">
                        <div className="bg-zinc-900 border border-zinc-800 text-white p-4 rounded-2xl shadow-2xl flex justify-between items-center text-sm">
                            <span className="flex items-center gap-3">
                                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                {error}
                            </span>
                            <button onClick={() => setError(null)} className="text-zinc-500 hover:text-white uppercase text-[10px] font-bold tracking-wider">Dismiss</button>
                        </div>
                    </div>
                )}

                {viewMode === 'voice' ? (
                    /* VOICE VIEW */
                    <div className="flex-1 flex flex-col items-center justify-center relative p-8">
                        <div className="relative flex items-center justify-center">
                            {/* Layered Pulsing Rings */}
                            {(isPlayingAudio || isRecording) && (
                                <>
                                    <div className="absolute w-64 h-64 rounded-full border border-zinc-800 pulse-circle opacity-20"></div>
                                    <div className="absolute w-80 h-80 rounded-full border border-zinc-800 pulse-circle opacity-10" style={{ animationDelay: '0.4s' }}></div>
                                    <div className={`absolute w-48 h-48 rounded-full bg-zinc-900 border border-zinc-800 ${isPlayingAudio ? 'pulse-circle-fast' : 'pulse-circle'}`}></div>
                                </>
                            )}

                            {/* Main Circle */}
                            <div className={`w-40 h-40 rounded-full bg-white border-4 border-zinc-900 flex items-center justify-center transition-all duration-500 relative z-10 ${isPlayingAudio ? 'scale-110' : 'scale-100'}`}>
                                {isPlayingAudio ? (
                                    <Volume2 className="text-black h-12 w-12" />
                                ) : isRecording ? (
                                    <MicOff className="text-black h-12 w-12" />
                                ) : (
                                    <Mic className="text-zinc-200 h-12 w-12" />
                                )}
                            </div>
                        </div>

                        <div className="mt-20 text-center max-w-xs transition-opacity duration-300">
                            <h2 className="text-2xl font-light tracking-tight mb-2">
                                {isPlayingAudio ? 'Assistant Speaking' : isRecording ? 'Listening...' : 'Ready to talk'}
                            </h2>
                            <p className="text-zinc-500 text-sm leading-relaxed">
                                {isPlayingAudio
                                    ? 'The AI is currently responding to your request.'
                                    : isRecording
                                        ? 'Go ahead, I\'m listening. Tap to stop.'
                                        : 'Tap the button below to start a voice conversation.'}
                            </p>
                        </div>

                        <div className="absolute bottom-16 flex flex-col items-center gap-4">
                            <button
                                onClick={isRecording ? stopRecording : startRecording}
                                disabled={isLoading && !isRecording}
                                className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl ${isRecording
                                        ? 'bg-zinc-800 scale-110 border border-zinc-700'
                                        : 'bg-white hover:bg-zinc-200 scale-100'
                                    }`}
                            >
                                {isRecording ? (
                                    <div className="w-6 h-6 bg-white rounded-sm"></div>
                                ) : (
                                    <Mic className="text-black h-8 w-8" />
                                )}
                            </button>
                            {isPlayingAudio && (
                                <button
                                    onClick={stopAudio}
                                    className="text-zinc-500 hover:text-white uppercase text-[10px] font-bold tracking-[0.2em] transition-colors"
                                >
                                    Stop Playback
                                </button>
                            )}
                        </div>
                    </div>
                ) : (
                    /* CHAT VIEW */
                    <div className="flex-1 flex flex-col h-full overflow-hidden">
                        <div className="flex-1 overflow-y-auto px-6 py-8 space-y-8 scrollbar-hide">
                            {messages.map((msg) => (
                                <div
                                    key={msg.id}
                                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-4 duration-500`}
                                >
                                    <div className={`max-w-[85%] ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                                        <div className="text-[10px] uppercase font-bold tracking-widest text-zinc-600 mb-2">
                                            {msg.role === 'user' ? 'You' : agentInfo.name}
                                        </div>
                                        <div className={`rounded-2xl px-5 py-4 inline-block text-sm leading-relaxed ${msg.role === 'user'
                                                ? 'bg-white text-black'
                                                : 'bg-zinc-900 border border-zinc-800 text-zinc-100'
                                            }`}>
                                            <p className="whitespace-pre-wrap">{msg.content}</p>
                                        </div>
                                        {msg.role === 'assistant' && (
                                            <button
                                                onClick={() => playTTS(msg.content)}
                                                className="mt-3 text-[10px] text-zinc-500 hover:text-white flex items-center gap-1.5 uppercase font-bold tracking-wider transition-colors"
                                            >
                                                <Volume2 size={10} /> Speak message
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="p-6 pb-10 bg-gradient-to-t from-black via-black to-transparent">
                            <form onSubmit={handleSendChat} className="flex gap-3 items-end max-w-2xl mx-auto w-full">
                                <div className="relative flex-1">
                                    <textarea
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                handleSendChat();
                                            }
                                        }}
                                        placeholder="Message AI Assistant..."
                                        className="w-full bg-zinc-900/50 border border-zinc-800 rounded-2xl pl-5 pr-14 py-4 max-h-32 min-h-[58px] resize-none focus:outline-none focus:border-white focus:ring-0 transition-all text-sm scrollbar-hide"
                                        disabled={isLoading}
                                        rows={1}
                                    />
                                    <button
                                        type="submit"
                                        disabled={isLoading || !input.trim()}
                                        className="absolute right-3 bottom-3 p-2 bg-white text-black rounded-xl hover:bg-zinc-200 transition disabled:opacity-0 disabled:scale-90"
                                    >
                                        <ArrowUp size={18} />
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </main>
        </div>
    )
}

function ArrowUp({ size, className }: { size?: number, className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width={size || 24} height={size || 24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="m5 12 7-7 7 7" /><path d="M12 19V5" />
        </svg>
    )
}
