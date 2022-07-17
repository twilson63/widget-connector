import svelte from 'rollup-plugin-svelte'
import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'

export default {
  input: 'src/main.js',
  output: {
    sourcemap: false,
    format: 'esm',
    file: 'dist/widget.js'
  },
  plugins: [
    svelte({
      compilerOptions: {
        dev: false
      }
    }),
    resolve({
      preferBuiltins: false,
      browser: true,
      dedupe: ['svelte']
    }),
    commonjs()
  ]
}