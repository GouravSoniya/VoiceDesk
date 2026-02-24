import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) return NextResponse.json({ error: 'Missing agent ID' }, { status: 400 })

    const supabase = createClient()

    // Using service role to fetch active agent info for public view if needed, 
    // but the RLS policy "Public can view active agents" allows this anyway.
    const { data: agent, error } = await supabase
        .from('agents')
        .select('name, is_active')
        .eq('id', id)
        .eq('is_active', true)
        .single()

    if (error || !agent) {
        return NextResponse.json({ error: 'Agent not found or inactive' }, { status: 404 })
    }

    return NextResponse.json(agent)
}
