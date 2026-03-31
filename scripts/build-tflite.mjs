import { spawnSync } from 'node:child_process'

const workspace = process.cwd().replace(/\\/g, '/')

const result = spawnSync(
  'docker',
  ['run', '--rm', '-v', `${workspace}:/workspace`, '-w', '/workspace', 'tflite'],
  {
    stdio: 'inherit',
  }
)

process.exit(result.status ?? 1)
