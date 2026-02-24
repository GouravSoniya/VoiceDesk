import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function DELETE(
    request: Request,
    { params }: { params: { agentId: string } }
) {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const agentId = params.agentId

        // Supabase RLS ensures they can only delete their own agent.
        // However, for explicit checking we can verify owner_id.
        const { data: agent, error: fetchError } = await supabase
            .from('agents')
            .select('owner_id')
            .eq('id', agentId)
            .single()

        if (fetchError || !agent) {
            return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
        }

        if (agent.owner_id !== user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const { error: deleteError } = await supabase
            .from('agents')
            .delete()
            .eq('id', agentId)

        if (deleteError) {
            throw new Error(`Failed to delete agent: ${deleteError.message}`)
        }

        // Related data (agent_data, conversations) will be deleted via ON DELETE CASCADE in Postgres schema

        return NextResponse.json({ success: true })

    } catch (error: any) {
        console.error("Delete Agent Error:", error)
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
    }
}
