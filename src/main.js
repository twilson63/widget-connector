import Widget from './Widget.svelte'

const el = document.getElementById('widget-connector')
//const dataset = el.dataset

const widget = new Widget({
  target: el,
  //props: dataset
})