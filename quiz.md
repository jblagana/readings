---
layout: default
title: "Quiz"
nav_order: 9
---

<div id="quiz-app">
  <p class="qz-loading">Loading the quiz engine…</p>
</div>

{%- for page in site.pages -%}
{%- if page.data_quiz and page.content -%}
<script type="application/json" class="quiz-doc" data-id="{{ page.url }}" data-title="{{ page.title }}" data-url="{{ page.url | relative_url }}" data-kind="{{ page.data_quiz }}">{{ page.content | jsonify | replace: "</", '<\/' }}</script>
{%- endif -%}
{%- endfor -%}

<script src="{{ '/assets/js/quiz.js' | relative_url }}"></script>
