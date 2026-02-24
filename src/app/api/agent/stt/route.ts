import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

export async function POST(request: Request) {
    try {
        const formData = await request.formData()
        const audioBlob = formData.get('audio') as Blob
        const agentId = formData.get('agentId') as string

        if (!audioBlob || !agentId) {
            return NextResponse.json({ error: 'Missing audio or agent ID' }, { status: 400 })
        }

        const supabase = createAdminClient()

        // Fetch Agent & Profile for Sarvam API Key
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

        // Call Sarvam STT API
        // NOTE: The exact Sarvam API endpoint and payload structure depends on their current GA API specs.
        // Assuming a standard multipart/form-data upload to a /speech-to-text endpoint based on common patterns.
        const sarvamFormData = new FormData()
        sarvamFormData.append('file', audioBlob, 'audio.webm')
        sarvamFormData.append('model', 'saarika:v2.5') // Updated model

        const sarvamRes = await fetch('https://api.sarvam.ai/speech-to-text', {
            method: 'POST',
            headers: {
                'api-subscription-key': sarvamKey,
                // Do not set Content-Type manually when sending FormData, fetch handles the boundary
            },
            body: sarvamFormData
        })

        if (!sarvamRes.ok) {
            const errText = await sarvamRes.text()
            console.error("Sarvam STT Error:", errText)
            throw new Error(`Sarvam STT API failed: ${sarvamRes.statusText}`)
        }

        const data = await sarvamRes.json()

        // Assuming the response structure has a transcript field. Adapt to actual Sarvam response.
        const transcript = data.transcript || data.text || ''

        return NextResponse.json({ transcript })

    } catch (error: any) {
        console.error("STT API Error:", error)
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
    }
}
