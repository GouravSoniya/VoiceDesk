import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

export async function POST(request: Request) {
    try {
        const { agentId, text } = await request.json()

        if (!agentId || !text) {
            return NextResponse.json({ error: 'Missing text or agent ID' }, { status: 400 })
        }

        const supabase = createAdminClient()

        // Fetch Agent & Profile for Sarvam API Key and Voice ID
        const { data: agent, error: agentError } = await supabase
            .from('agents')
            .select('voice, profiles(sarvam_api_key)')
            .eq('id', agentId)
            .single()

        if (agentError || !agent) {
            return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
        }

        const profile = Array.isArray(agent.profiles) ? agent.profiles[0] : agent.profiles;

        if (!profile || !(profile as any).sarvam_api_key) {
            return NextResponse.json({ error: 'Agent configuration missing Sarvam API key' }, { status: 400 })
        }

        const sarvamKey = Array.isArray(agent.profiles)
            ? agent.profiles[0]?.sarvam_api_key
            : (agent.profiles as any)?.sarvam_api_key
        const voiceId = agent.voice

        // Call Sarvam TTS API
        // NOTE: The exact Sarvam API endpoint and payload structure depends on their current GA API specs.
        const sarvamRes = await fetch('https://api.sarvam.ai/text-to-speech', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-subscription-key': sarvamKey,
            },
            body: JSON.stringify({
                inputs: [text],
                target_language_code: 'hi-IN', // You might infer this from voice ID if needed
                speaker: voiceId,
                pace: 1.0,
                speech_sample_rate: 8000, // Or 16000, 24000
                enable_preprocessing: true,
                model: "bulbul:v3", // Updated model to v3 for Priya and others
            })
        })

        if (!sarvamRes.ok) {
            const errText = await sarvamRes.text()
            console.error("Sarvam TTS Error:", errText)
            throw new Error(`Sarvam TTS API failed: ${sarvamRes.statusText}`)
        }

        const data = await sarvamRes.json();
        const base64Audio = data.audios[0];
        const audioBuffer = Buffer.from(base64Audio, 'base64');

        return new NextResponse(audioBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'audio/mpeg',
            }
        })

    } catch (error: any) {
        console.error("TTS API Error:", error)
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
    }
}
