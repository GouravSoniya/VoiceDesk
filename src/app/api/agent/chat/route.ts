import { NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import { createAdminClient } from '@/utils/supabase/admin'

export async function POST(request: Request) {
    try {
        const { agentId, sessionId, message } = await request.json()
        if (!agentId || !message) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })

        const supabase = createAdminClient()

        // 1. Fetch Agent & Profile (for Groq API Key and System Prompt)
        const { data: agent, error: agentError } = await supabase
            .from('agents')
            .select('*, profiles(groq_api_key)')
            .eq('id', agentId)
            .single()

        if (agentError || !agent) {
            return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
        }

        const profile = Array.isArray(agent.profiles) ? agent.profiles[0] : agent.profiles;

        if (!profile || !(profile as any).groq_api_key) {
            return NextResponse.json({ error: 'Agent configuration missing API key' }, { status: 400 })
        }

        const apiKey = Array.isArray(agent.profiles)
            ? agent.profiles[0]?.groq_api_key
            : (agent.profiles as any)?.groq_api_key

        // 2. Fetch Agent's Data Table
        const { data: tableData, error: tableError } = await supabase
            .from('agent_data')
            .select('*')
            .eq('agent_id', agentId)
            .order('row_index', { ascending: true })

        let tableContext = "Current Data Table:\n"
        if (!tableError && tableData && tableData.length > 0) {
            // Reconstruct rows
            const rows: Record<number, any> = {}
            for (const cell of tableData) {
                if (!rows[cell.row_index]) rows[cell.row_index] = {}
                rows[cell.row_index][cell.column_key] = cell.cell_value
            }
            tableContext += JSON.stringify(Object.values(rows), null, 2)
        } else {
            tableContext += "Empty table."
        }

        // 3. Fetch Recent Conversation History
        const { data: history } = await supabase
            .from('conversations')
            .select('role, content')
            .eq('agent_id', agentId)
            .eq('session_id', sessionId)
            .order('created_at', { ascending: false })
            .limit(10)

        // Reverse to chronological order
        const formattedHistory: any[] = (history || []).reverse().map(h => ({
            role: h.role,
            content: h.content
        }))

        // Save User Message
        await supabase.from('conversations').insert({
            agent_id: agentId,
            session_id: sessionId,
            role: 'user',
            content: message
        })

        // 4. Initialize Groq
        const groq = new Groq({ apiKey })

        const fullSystemPrompt = `
${agent.system_prompt}

${agent.table_instructions ? `Instructions for data table: ${agent.table_instructions}` : ''}

${tableContext}

You can use the following tools to interact with the data table:
- insert_row(data: Record<string, string>)
- update_cell(rowIndex: number, columnKey: string, newValue: string)
- delete_row(rowIndex: number)
- read_table() -> returns current state

ONLY use tools when necessary based on user requests. Formulate concise and helpful responses.
`

        const messages: any[] = [
            { role: 'system', content: fullSystemPrompt },
            ...formattedHistory,
            { role: 'user', content: message }
        ]

        // 5. Tool Definitions for Groq
        const tools = [
            {
                type: 'function',
                function: {
                    name: 'insert_row',
                    description: 'Inserts a new row into the data table.',
                    parameters: {
                        type: 'object',
                        properties: {
                            data: {
                                type: 'object',
                                description: 'Key-value pairs representing column keys and cell values.',
                                additionalProperties: { type: 'string' }
                            }
                        },
                        required: ['data']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'update_cell',
                    description: 'Updates a specific cell in the data table.',
                    parameters: {
                        type: 'object',
                        properties: {
                            rowIndex: { type: 'integer', description: '0-based index of the row to update' },
                            columnKey: { type: 'string', description: 'Key of the column to update' },
                            newValue: { type: 'string', description: 'New value for the cell' }
                        },
                        required: ['rowIndex', 'columnKey', 'newValue']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'delete_row',
                    description: 'Deletes a row from the data table.',
                    parameters: {
                        type: 'object',
                        properties: {
                            rowIndex: { type: 'integer', description: '0-based index of the row to delete' }
                        },
                        required: ['rowIndex']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'read_table',
                    description: 'Returns the current state of the data table. Use this to verify current data if unsure.',
                    parameters: { type: 'object', properties: {} }
                }
            }
        ]

        // 6. First Groq Call
        const completion = await groq.chat.completions.create({
            model: "llama-3.1-8b-instant",
            messages,
            tools: tools as any, // Cast needed depending on SDK version types
            tool_choice: "auto"
        })

        let responseMessage = completion.choices[0]?.message

        // 7. Handle Tool Calls
        if (responseMessage.tool_calls) {
            messages.push(responseMessage) // Add assistant's tool call request to history

            for (const toolCall of responseMessage.tool_calls) {
                const functionName = toolCall.function.name;
                const functionArgs = JSON.parse(toolCall.function.arguments);
                let toolResult = '';

                // Execute appropriate local function
                try {
                    if (functionName === 'insert_row') {
                        // Find current max row index
                        const { data: maxRowData } = await supabase
                            .from('agent_data')
                            .select('row_index')
                            .eq('agent_id', agentId)
                            .order('row_index', { ascending: false })
                            .limit(1)

                        const newRowIndex = maxRowData && maxRowData.length > 0 ? maxRowData[0].row_index + 1 : 0;

                        const inserts = Object.entries(functionArgs.data).map(([key, value]) => ({
                            agent_id: agentId,
                            row_index: newRowIndex,
                            column_key: key,
                            cell_value: String(value)
                        }))

                        await supabase.from('agent_data').insert(inserts)
                        toolResult = `Successfully inserted row at index ${newRowIndex}`

                    } else if (functionName === 'update_cell') {
                        // Check if row/col exists
                        const { data: existing } = await supabase
                            .from('agent_data')
                            .select('id')
                            .eq('agent_id', agentId)
                            .eq('row_index', functionArgs.rowIndex)
                            .eq('column_key', functionArgs.columnKey)
                            .single()

                        if (existing) {
                            await supabase.from('agent_data')
                                .update({ cell_value: functionArgs.newValue })
                                .eq('id', existing.id)
                        } else {
                            // Insert if it didn't exist for that row
                            await supabase.from('agent_data').insert({
                                agent_id: agentId,
                                row_index: functionArgs.rowIndex,
                                column_key: functionArgs.columnKey,
                                cell_value: functionArgs.newValue
                            })
                        }
                        toolResult = `Successfully updated cell at row ${functionArgs.rowIndex}, col ${functionArgs.columnKey}`

                    } else if (functionName === 'delete_row') {
                        await supabase.from('agent_data')
                            .delete()
                            .eq('agent_id', agentId)
                            .eq('row_index', functionArgs.rowIndex)
                        toolResult = `Successfully deleted row ${functionArgs.rowIndex}`

                    } else if (functionName === 'read_table') {
                        const { data: currentData } = await supabase
                            .from('agent_data')
                            .select('*')
                            .eq('agent_id', agentId)
                            .order('row_index', { ascending: true })

                        const rows: Record<number, any> = {}
                        if (currentData) {
                            for (const cell of currentData) {
                                if (!rows[cell.row_index]) rows[cell.row_index] = {}
                                rows[cell.row_index][cell.column_key] = cell.cell_value
                            }
                        }
                        toolResult = JSON.stringify(Object.values(rows))
                    }
                } catch (err: any) {
                    toolResult = `Error executing tool: ${err.message}`
                }

                messages.push({
                    tool_call_id: toolCall.id,
                    role: 'tool',
                    name: functionName,
                    content: toolResult
                })
            }

            // 8. Second Groq Call with tool results
            const secondCompletion = await groq.chat.completions.create({
                model: "llama-3.1-8b-instant",
                messages
            })

            responseMessage = secondCompletion.choices[0]?.message
        }

        const finalReply = responseMessage?.content || "I couldn't process that request."

        // Save Assistant Reply
        await supabase.from('conversations').insert({
            agent_id: agentId,
            session_id: sessionId,
            role: 'assistant',
            content: finalReply
        })

        return NextResponse.json({ reply: finalReply })

    } catch (error: any) {
        console.error("Chat API Error:", error)
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
    }
}
