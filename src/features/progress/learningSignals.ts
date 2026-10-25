import { useEffect, useState } from 'react'
import { readAssessments } from '../assessment/repository'
import type { AssessmentSnapshot } from '../assessment/model'
import { challenges, type Difficulty } from '../coding/challenges'
import { codingStats, initialCodingState, validateCoding, type CodingState } from '../coding/model'
import { loadFeature } from '../../lib/featureStorage'
import { errorMessage } from '../../lib/supabase'
import { tracks } from '../curriculum/content'

export function evidenceScores(assessment: AssessmentSnapshot | null, coding: CodingState) {
  return Object.fromEntries(tracks.map(track => {
    const baseline = assessment?.assessedScores[track.id as keyof typeof assessment.assessedScores]
    const available = challenges.filter(challenge => challenge.trackId === track.id)
    const passed = new Set(coding.attempts.filter(attempt => attempt.passed && !attempt.assisted && available.some(challenge => challenge.id === attempt.challengeId)).map(attempt => attempt.challengeId))
    const attempted = coding.attempts.some(attempt => available.some(challenge => challenge.id === attempt.challengeId))
    const score = baseline === undefined && !attempted ? null : Math.round((baseline ?? 0) * .4 + (available.length ? passed.size / available.length : 0) * 60)
    return [track.id, score]
  })) as Record<string, number | null>
}

export function suggestedDifficulty(coding: CodingState, baseline?: number): Difficulty {
  const recent = coding.attempts.slice(-5)
  const accuracy = recent.length ? recent.filter(attempt => attempt.passed && !attempt.assisted).length / recent.length : (baseline ?? 60) / 100
  return accuracy >= .8 ? 'Advanced' : accuracy < .4 ? 'Beginner' : 'Intermediate'
}

export function useLearningSignals() {
  const [coding, setCoding] = useState(initialCodingState)
  const [assessment, setAssessment] = useState<AssessmentSnapshot | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    let generation = 0
    async function load() {
      const version = ++generation
      try {
        const [storedCoding, diagnostics] = await Promise.all([loadFeature('coding', 'workspace', initialCodingState), readAssessments()])
        if (alive && generation === version) { setCoding(validateCoding(storedCoding)); setAssessment(diagnostics); setError('') }
      } catch (cause) { if (alive && generation === version) setError(errorMessage(cause)) }
      finally { if (alive && generation === version) setLoading(false) }
    }
    void load()
    const listener = () => void load()
    window.addEventListener('devly:activity', listener)
    return () => { alive = false; window.removeEventListener('devly:activity', listener) }
  }, [])
  return { coding, assessment, stats: codingStats(coding), scores: evidenceScores(assessment, coding), error, loading }
}
