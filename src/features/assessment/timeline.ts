import type { SubjectCircumference } from './api'

export type AssessmentChronology = {
  id: string
  assessed_at: string
  created_at: string
}

export function compareAssessmentChronology(
  a: AssessmentChronology,
  b: AssessmentChronology
): number {
  return (
    a.assessed_at.localeCompare(b.assessed_at) ||
    a.created_at.localeCompare(b.created_at) ||
    a.id.localeCompare(b.id)
  )
}

export function sortAssessmentsChronologically<T extends AssessmentChronology>(rows: T[]): T[] {
  return [...rows].sort(compareAssessmentChronology)
}

export type CircumferenceValue = { site: string; valueCm: number }

export function groupCircumferencesByAssessment(
  rows: SubjectCircumference[]
): Map<string, CircumferenceValue[]> {
  const grouped = new Map<string, CircumferenceValue[]>()
  for (const row of rows) {
    const values = grouped.get(row.assessmentId) ?? []
    values.push({ site: row.site, valueCm: row.valueCm })
    grouped.set(row.assessmentId, values)
  }
  return grouped
}

export type CircumferenceTimelinePoint = {
  assessmentId: string
  assessedAt: string
  valueCm: number | null
}

export function buildCircumferenceTimeline(rows: SubjectCircumference[]): {
  current: CircumferenceValue[]
  siteSeries: { site: string; series: CircumferenceTimelinePoint[] }[]
} {
  const assessmentsById = new Map<
    string,
    { id: string; assessed_at: string; created_at: string }
  >()
  const valueByAssessmentSite = new Map<string, number>()
  const countBySite = new Map<string, Set<string>>()

  for (const row of rows) {
    assessmentsById.set(row.assessmentId, {
      id: row.assessmentId,
      assessed_at: row.assessedAt,
      created_at: row.assessmentCreatedAt,
    })
    valueByAssessmentSite.set(`${row.assessmentId}|${row.site}`, row.valueCm)
    const assessmentIds = countBySite.get(row.site) ?? new Set<string>()
    assessmentIds.add(row.assessmentId)
    countBySite.set(row.site, assessmentIds)
  }

  const assessments = sortAssessmentsChronologically([...assessmentsById.values()])
  const sites = [...countBySite.entries()]
    .filter(([, assessmentIds]) => assessmentIds.size >= 2)
    .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))
    .map(([site]) => site)

  const siteSeries = sites.map((site) => ({
    site,
    series: assessments.map((assessment) => ({
      assessmentId: assessment.id,
      assessedAt: assessment.assessed_at,
      valueCm: valueByAssessmentSite.get(`${assessment.id}|${site}`) ?? null,
    })),
  }))

  const lastAssessment = assessments.at(-1)
  const current = lastAssessment
    ? (groupCircumferencesByAssessment(rows).get(lastAssessment.id) ?? [])
    : []

  return { current, siteSeries }
}
