---
layout: default
title: Data probe (temporary)
no_tooltips: true
---

<p>json probe: <code>{{ site.data.gtprobe | jsonify }}</code></p>
<p>yml probe: <code>{{ site.data.gtprobe2 | jsonify }}</code></p>
<p>glossary probe: <code>{{ site.data.glossary | jsonify | truncate: 80 }}</code></p>
<p>glossary size: <code>{{ site.data.glossary | size }}</code></p>
