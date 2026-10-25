import { supabase } from '../../lib/supabase'
import { validateState, type LearningEvent } from './model'

export async function loadRemoteState(userId: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const results = await Promise.all([
    supabase.from('profiles').select('display_name,daily_goal_minutes').eq('id', userId).single(),
    supabase.from('lesson_progress').select('lesson_id,status,answers,updated_at').eq('user_id', userId),
    supabase.from('bookmarks').select('lesson_id').eq('user_id', userId),
  ])
  for (const result of results) if (result.error) throw result.error
  const events: LearningEvent[] = []
  const pageSize = 500
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from('learning_events')
      .select('id,lesson_id,kind,xp,minutes,created_at').eq('user_id', userId)
      .order('created_at').order('id').range(offset, offset + pageSize - 1)
    if (error) throw error
    events.push(...data as LearningEvent[])
    if (data.length < pageSize) break
  }
  return validateState({ profile: results[0].data, progress: results[1].data, events, bookmarks: results[2].data?.map(item => item.lesson_id) })
}
