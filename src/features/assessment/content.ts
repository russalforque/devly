export const technologies = ['react', 'typescript', 'javascript', 'sql', 'node', 'git'] as const
export type AssessmentTechnology = typeof technologies[number]

export interface DiagnosticQuestion {
  id: string
  topic: string
  prompt: string
  options: readonly string[]
  answer: number
  explanation: string
}

/** Increment when questions or answer keys change; old versions must be migrated explicitly. */
export const QUESTION_VERSION = 1
export const recommendationLessons = {
  react: 'react-effects', typescript: 'ts-narrowing', javascript: 'js-async',
  sql: 'sql-joins', node: 'api-errors', git: 'git-recovery',
} as const satisfies Record<AssessmentTechnology, string>

export const diagnostics: Record<AssessmentTechnology, readonly DiagnosticQuestion[]> = {
  react: [
    { id: 'react-placement', topic: 'Effect placement', prompt: 'A component displays fullName from firstName and lastName props. Where should it calculate fullName?', options: ['In an effect that updates another state variable', 'During render from the current props', 'Only in a mount effect'], answer: 1, explanation: 'A value derived entirely from current props can be calculated during render. No external system needs synchronization.' },
    { id: 'react-dependencies', topic: 'Reactive dependencies', prompt: 'An effect opens a connection using the roomId prop. Which dependency list keeps the connection synchronized when roomId changes?', options: ['[]', '[roomId]', 'No changes are needed if the component stays mounted'], answer: 1, explanation: 'roomId is a reactive value read by the effect. Including it lets React reconnect when the room changes.' },
    { id: 'react-cleanup', topic: 'Effect cleanup', prompt: 'An effect starts an interval. What should its returned cleanup function do?', options: ['Start a replacement interval', 'Update the dependency array', 'Clear the interval created by that setup'], answer: 2, explanation: 'Cleanup undoes setup. Clearing that interval prevents it from continuing after unmount or after the effect is replaced.' },
  ],
  typescript: [
    { id: 'ts-discriminant', topic: 'Discriminated unions', prompt: 'Only the success member of a RequestState union has data. What safely allows access to state.data?', options: ['Check state.status === "success"', 'Assert state.data! without a check', 'Mark every field optional'], answer: 0, explanation: 'Checking the literal discriminant narrows the union to the success member, where data is required.' },
    { id: 'ts-runtime', topic: 'Runtime validation', prompt: 'External JSON is asserted as Profile with `as Profile`. What has been verified at runtime?', options: ['All Profile fields', 'Only required Profile fields', 'Nothing; the assertion does not validate data'], answer: 2, explanation: 'Type assertions are erased. External data needs runtime checks before the application can trust its shape.' },
    { id: 'ts-exhaustive', topic: 'Exhaustive handling', prompt: 'A switch over a discriminated union assigns the default branch value to never. What happens when a new member is added but not handled?', options: ['The new member is silently ignored', 'Type checking reports the unhandled member', 'The compiler generates the missing branch'], answer: 1, explanation: 'An unhandled member is not assignable to never. This exposes missing cases when the union grows.' },
  ],
  javascript: [
    { id: 'js-concurrency', topic: 'Independent concurrency', prompt: 'Three independent reads should start together. Which approach does that?', options: ['Await each read inside a for loop', 'Start reads with map, then await Promise.all', 'Use forEach and await its return value'], answer: 1, explanation: 'Mapping to promises starts the independent reads before awaiting their combined result. A loop that awaits each read serializes them.' },
    { id: 'js-order', topic: 'Promise result order', prompt: 'Promise.all([slowRead, fastRead]) succeeds. Which result is first?', options: ['slowRead, matching input order', 'fastRead, matching completion order', 'The order is random'], answer: 0, explanation: 'Promise.all preserves input order even when operations finish in a different order.' },
    { id: 'js-rejection', topic: 'Rejection and cancellation', prompt: 'One input to Promise.all rejects while another request is pending. What happens?', options: ['The pending request is automatically cancelled', 'The aggregate resolves with partial results', 'The aggregate rejects; the pending request continues unless explicitly cancelled'], answer: 2, explanation: 'Aggregate rejection does not cancel other work. Cancellation requires a separate mechanism supported by the operation.' },
  ],
  sql: [
    { id: 'sql-left', topic: 'Outer join preservation', prompt: 'Customers LEFT JOIN orders has a customer with no matching orders. What does the join produce for that customer?', options: ['No row', 'A row with NULL order columns', 'A row with an invented order ID of zero'], answer: 1, explanation: 'LEFT JOIN preserves unmatched left-side rows and fills the right-side columns with NULL.' },
    { id: 'sql-filter', topic: 'Join filter placement', prompt: 'A report must retain every customer but join only paid orders. Where should orders.status = \'paid\' go?', options: ['In WHERE after the LEFT JOIN', 'In ORDER BY', 'In the LEFT JOIN ON condition'], answer: 2, explanation: 'Filtering matches in ON retains customers with no paid orders. A WHERE comparison on the missing order removes their NULL-extended rows.' },
    { id: 'sql-count', topic: 'Counting nullable matches', prompt: 'After a LEFT JOIN, which expression counts zero for a customer with no orders, assuming orders.id is a non-null primary key?', options: ['COUNT(orders.id)', 'COUNT(*)', 'COUNT(customers.id)'], answer: 0, explanation: 'COUNT(expression) ignores NULL, so COUNT(orders.id) counts only matched orders. COUNT(*) includes the preserved customer row.' },
  ],
  node: [
    { id: 'node-http', topic: 'HTTP error handling', prompt: 'A fetch request receives an HTTP 500 response. What normally happens?', options: ['fetch always rejects', 'fetch resolves; response.ok is false', 'fetch automatically retries'], answer: 1, explanation: 'HTTP error responses normally resolve to a Response. Check response.ok or status explicitly; transport failures can reject.' },
    { id: 'node-body', topic: 'Response validation', prompt: 'An HTTP 200 response parses as { quantity: -2 }. The contract requires a non-negative integer. What should the client do?', options: ['Accept it because parsing succeeded', 'Accept it because the HTTP status is 200', 'Reject it through domain validation'], answer: 2, explanation: 'HTTP success and JSON syntax do not validate the domain. Check the quantity type, integer constraint, and allowed range.' },
    { id: 'node-boundary', topic: 'Safe error boundaries', prompt: 'An upstream failure contains internal debug details. What should a public API expose?', options: ['A stable, safe error message, while retaining appropriate diagnostic context internally', 'The complete raw upstream body', 'Credentials so the caller can debug'], answer: 0, explanation: 'Public error contracts should be useful without exposing credentials or sensitive internals. Keep appropriate diagnostic context at the developer boundary.' },
  ],
  git: [
    { id: 'git-shared', topic: 'Shared history recovery', prompt: 'A commit on a shared branch needs to be undone while preserving history. Which operation normally fits?', options: ['Delete the remote branch', 'Reset and force-push without coordinating', 'Revert the commit with a new inverse commit'], answer: 2, explanation: 'Revert records an inverse change as a new commit, preserving the history collaborators already have.' },
    { id: 'git-worktree', topic: 'Working tree safety', prompt: 'Why inspect git status before considering git reset --hard?', options: ['Hard reset automatically backs up every change', 'Hard reset can discard uncommitted tracked-file changes', 'Status disables destructive commands'], answer: 1, explanation: 'Hard reset updates the index and working tree. Inspect and protect uncommitted work before any destructive recovery.' },
    { id: 'git-reflog', topic: 'Local reference recovery', prompt: 'A local branch was moved and a recent commit seems lost. What can help locate its previous tip?', options: ['The local reflog, subject to retention limits', 'A guarantee that git status lists all deleted commits', 'Only creating a new remote'], answer: 0, explanation: 'Reflog records recent local reference movements and can help locate a lost commit. It is local, expires, and is not a backup.' },
  ],
}
