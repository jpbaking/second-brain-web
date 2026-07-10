import neostandard from 'neostandard'

export default neostandard({
  ts: true,
  // public/design is the vendored lazyway kit — never lint or hand-edit it.
  ignores: ['dist/**', 'public/design/**'],
})
