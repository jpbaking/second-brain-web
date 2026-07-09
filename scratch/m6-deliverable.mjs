import { execSync } from 'node:child_process'
import { writeFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

async function main() {
  console.log('Starting M6 Deliverable Check')
  
  // 1. Lint and Build
  console.log('Running lint and build...')
  execSync('npm run lint --workspace web && npm run build --workspace web', { stdio: 'inherit' })
  console.log('Web lint & build passed.')
  
  execSync('npm run lint --workspace server && npm run build --workspace server', { stdio: 'inherit' })
  console.log('Server lint & build passed.')

  // 2. Tests
  console.log('Running tests...')
  execSync('npm test --workspace server', { stdio: 'inherit' })
  console.log('Server tests passed.')

  console.log('\nAll checks for Milestone 6 passed successfully!')
}

main().catch(e => {
  console.error('Check failed:', e)
  process.exit(1)
})
