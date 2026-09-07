---
layout: default
title: "Papers"
nav_order: 8
---

{%- assign papers = site.data.papers -%}
{%- assign slides = site.data.paper_slides.slides -%}
{%- assign meta = site.data.paper_slides.meta -%}
{%- assign total = papers | size -%}

<div class="pd-deck" id="pd-deck">
  <header class="pd-topbar">
    <button class="pd-linkbtn" id="pd-home" type="button">&larr; Start</button>
    <div class="pd-progress">
      <div class="pd-track" aria-hidden="true"><div class="pd-fill" id="pd-fill"></div></div>
      <div class="pd-counter" id="pd-counter">Start</div>
    </div>
    <button class="pd-linkbtn" id="pd-ov" type="button">Overview</button>
  </header>

  <div class="pd-stage" id="pd-stage">
    <section class="pd-slide pd-title-slide is-active" data-role="title" data-label="Start">
      <p class="pd-eyebrow">The evidence behind the package</p>
      <h1 class="pd-title-h">The {{ total }} DOI-backed papers, in slides</h1>
      <p class="pd-title-sub">One paper at a time: a hook question, a summary, what it contributes, and how it is cited. Step through with the arrows, jump anywhere from the overview, or open the original via its DOI.</p>
      <div class="pd-cta">
        <button class="pd-btn" id="pd-start" type="button">Start the deck &rarr;</button>
        <button class="pd-btn pd-btn-ghost" id="pd-ov2" type="button">Browse all {{ total }}</button>
      </div>
      <p class="pd-title-note">Citations from {{ meta.citations_source }}, as of <code>{{ meta.cited_asof }}</code>. Papers sourced from <code>papers_scopus_table.csv</code>.</p>
    </section>
    {%- assign pd_prev = "" -%}
{%- for row in papers -%}
  {%- assign s = slides[row.id] -%}
  {%- assign pd_subname = "" -%}
  {%- assign pd_subtag = "" -%}
  {%- case row.subtopic -%}
    {%- when "A_GPU_power_flow" -%}{%- assign pd_subname = "GPU power flow" -%}{%- assign pd_subtag = "Mature &mdash; solved, and re-solved" -%}
    {%- when "S_anchor_surveys" -%}{%- assign pd_subname = "Anchor surveys" -%}{%- assign pd_subtag = "The two papers to snowball from" -%}
    {%- when "B_GPU_OPF" -%}{%- assign pd_subname = "GPU OPF / SCOPF" -%}{%- assign pd_subtag = "The active frontier, 2023&ndash;2026" -%}
    {%- when "C_GPU_UC" -%}{%- assign pd_subname = "GPU unit commitment" -%}{%- assign pd_subtag = "Emerging &mdash; three works, one direction" -%}
    {%- when "D_DERMS" -%}{%- assign pd_subname = "GPU + DERMS" -%}{%- assign pd_subtag = "Real but thin &mdash; the least GPU ink" -%}
    {%- when "E_PLANNING" -%}{%- assign pd_subname = "GPU + planning (TEP)" -%}{%- assign pd_subtag = "The genuine gap" -%}
  {%- endcase -%}
  {%- if row.subtopic != pd_prev -%}
    {%- assign pd_prev = row.subtopic -%}
    {%- assign pd_count = papers | where: "subtopic", row.subtopic | size -%}
    <section class="pd-slide pd-divider" data-role="divider" data-label="{{ row.subtopic | slice: 0, 1 }} &middot; {{ pd_subname }}">
      <span class="pd-div-key">{{ row.subtopic | slice: 0, 1 }}</span>
      <p class="pd-div-name">{{ pd_subname }}</p>
      <p class="pd-div-tag">{{ pd_subtag }}</p>
      <p class="pd-div-count">{{ pd_count }} papers</p>
    </section>
  {%- endif -%}
  <section class="pd-slide pd-paper" id="{{ row.id }}" data-role="paper" data-num="{{ forloop.index }}" data-total="{{ total }}">
    <div class="pd-card">
      <div class="pd-kicker">
        <span class="pd-key">{{ row.subtopic | slice: 0, 1 }}</span>
        <span class="pd-subname">{{ pd_subname }}</span>
        <span class="pd-badge pd-badge-yr">{{ row.year }}</span>
        <span class="pd-badge">{{ row.venue_type | replace: '+', ' + ' }}</span>
      </div>
      <h2 class="pd-title">{{ row.title }}</h2>
      <div class="pd-meta">
        {%- if s.authors %}<span class="pd-authors">{{ s.authors }}</span>{%- endif -%}
        <span class="pd-venue">{{ row.venue }}</span>
        {%- if s.citations == nil -%}
          <span class="pd-cite pd-cite-na" title="Citation count not available from OpenAlex">citations n/a</span>
        {%- elsif s.citations == 1 -%}
          <span class="pd-cite" title="OpenAlex cited_by_count, as of {{ meta.cited_asof }}">1 citation</span>
        {%- else -%}
          <span class="pd-cite" title="OpenAlex cited_by_count, as of {{ meta.cited_asof }}">{{ s.citations }} citations</span>
        {%- endif -%}
      </div>
      <p class="pd-hook">{{ s.hook }}</p>
      <p class="pd-summary">{{ s.summary }}</p>
      <div class="pd-grid">
        <div class="pd-block">
          <h4>Contribution</h4>
          <p>{{ row.key_contribution }}{%- if row.notes %} &middot; {{ row.notes }}{%- endif %}</p>
        </div>
        <div class="pd-block">
          <h4>Worth knowing</h4>
          <ul>
            {%- for it in s.interesting -%}
            <li>{{ it }}</li>
            {%- endfor -%}
          </ul>
        </div>
      </div>
      <p class="pd-tip">{{ s.highlight }}</p>
      <div class="pd-foot">
        <code class="pd-doi">{{ row.doi }}</code>
        <a class="pd-read" href="https://doi.org/{{ row.doi }}" target="_blank" rel="noopener">Read the paper &rarr;</a>
      </div>
    </div>
  </section>
{%- endfor -%}
  </div>

  <div class="pd-overview" id="pd-overview" role="region" aria-label="All papers">
    <div class="pd-ov-head">
      <h2>All {{ total }} papers</h2>
      <p>Grouped by subtopic. Click a card to jump to its slide.</p>
    </div>
    {%- assign ov_order = "A_GPU_power_flow,S_anchor_surveys,B_GPU_OPF,C_GPU_UC,D_DERMS,E_PLANNING" | split: "," -%}
{%- for sub in ov_order -%}
  {%- assign sub_papers = papers | where: "subtopic", sub -%}
  {%- assign sub_name = "" -%}
  {%- case sub -%}
    {%- when "A_GPU_power_flow" -%}{%- assign sub_name = "GPU power flow" -%}
    {%- when "S_anchor_surveys" -%}{%- assign sub_name = "Anchor surveys" -%}
    {%- when "B_GPU_OPF" -%}{%- assign sub_name = "GPU OPF / SCOPF" -%}
    {%- when "C_GPU_UC" -%}{%- assign sub_name = "GPU unit commitment" -%}
    {%- when "D_DERMS" -%}{%- assign sub_name = "GPU + DERMS" -%}
    {%- when "E_PLANNING" -%}{%- assign sub_name = "GPU + planning (TEP)" -%}
  {%- endcase -%}
  <div class="pd-ov-group">
    <div class="pd-ov-group-h">
      <span class="pd-key">{{ sub | slice: 0, 1 }}</span>
      <h3>{{ sub_name }}</h3>
      <span>{{ sub_papers | size }} papers</span>
    </div>
    <div class="pd-cards">
      {%- for row in sub_papers -%}
        {%- assign s = slides[row.id] -%}
        <a class="pd-ocard" href="#{{ row.id }}">
          <span class="pd-ocard-top"><span class="pd-ocard-id">{{ row.id }}</span><span class="pd-ocard-yr">{{ row.year }}</span></span>
          <span class="pd-ocard-title">{{ row.title }}</span>
          <span class="pd-ocard-cite"><b>{%- if s.citations == nil %}&ndash; n/a{%- elsif s.citations == 1 %}1 citation{%- else %}{{ s.citations }} citations{%- endif %}</b> &middot; {{ row.venue_type | replace: '+', ' + ' }}</span>
        </a>
      {%- endfor -%}
    </div>
  </div>
{%- endfor -%}
  </div>

  <footer class="pd-footbar">
    <button class="pd-arrow" id="pd-prev" type="button" aria-label="Previous slide">&larr;</button>
    <div class="pd-hint"><kbd>&larr;</kbd> <kbd>&rarr;</kbd> navigate &middot; <kbd>Space</kbd> next &middot; <kbd>O</kbd> overview &middot; <kbd>Home</kbd>/<kbd>End</kbd> jump</div>
    <button class="pd-arrow" id="pd-next" type="button" aria-label="Next slide">&rarr;</button>
  </footer>
</div>

<script src="{{ '/assets/js/papers.js' | relative_url }}"></script>
