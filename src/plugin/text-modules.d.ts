/** build/plugin.mjs loads a `.md` import as its text, so the plugin can bundle docs/playbook.md. */
declare module '*.md' {
  const text: string
  export default text
}
