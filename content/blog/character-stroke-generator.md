---
title: "Cutting glyphs into strokes: building CharacterStrokeGenerator"
description: "An engineering write-up of CharacterStrokeGenerator, our model for splitting font glyphs into ordered, directed strokes, and how we use multimodal LLMs to correct its output and grow its training data."
date: 2026-11-17
category: machine-learning
---

Stroke-order data powers handwriting recognition, the animated characters in
language-learning apps, and printable practice sheets. For Chinese characters,
open datasets in the [hanzi-writer](https://github.com/chanind/hanzi-writer)
format already exist: each character is a list of stroke outlines plus a
*median*, the centre line a pen follows, in writing order. Producing that data
is slow handwork, though, and it doesn't exist at all for most fonts and most
other scripts.

[CharacterStrokeGenerator](https://github.com/Heapforge/CharacterStrokeGenerator)
is our attempt to automate it. You give it a glyph outline exported from a font,
and it returns hanzi-writer JSON: the strokes, their medians, the direction of
each stroke and the order to write them in. The output feeds
[hanzi-writer-data-youyin](https://github.com/MadLadSquad/hanzi-writer-data-youyin),
our open stroke dataset.

**Before anything else: the model is at an extremely early stage of
development.** It does well on the CJK characters it was built around and is
often wrong outside them. Everything below describes a work in progress.

## Where the labels come from

The project started with a look at the existing hanzi-writer data. Its strokes
turned out to be cut almost point for point from the outlines of the Arphic Kai
fonts (gkai00mp, bkai00mp and ukai-cn), shifted into hanzi-writer's coordinate
frame (y = 900 − y<sub>svg</sub> on a 1024-unit em). About 9,500 characters
matched a font exactly.

That match is what made a learned approach possible. If every stroke is a set of
the font's own outline segments plus a few added *bridge* segments that close
the shape, the task can be framed as **labelling outline segments** rather than
drawing new geometry. A labelling pass assigns each font segment to the
hanzi-writer stroke that uses it and records the bridges. Segments that can't be
matched are masked out of the loss instead of being guessed.

Quality gates decide which records go into training: enough of the stroke
vertices must lie on the font outline, enough of the font segments must be
matched, and every bridge must end on the outline. The train, validation and
test split is a hash of the outline itself (90/5/5). Identical outlines, such as
Latin P and Greek Ρ, always land in the same split, so nothing leaks from train
into test, and adding characters never moves existing ones between splits.

## The pipeline

Prediction runs in three stages. Two are learned, and the middle one is plain
geometry.

### Stage A: where to cut (learned)

The cut model is a transformer whose tokens are **outline segments** (lines and
quadratic or cubic Béziers), not pixels. Each token carries:

- segment geometry: control points, tangents, the turning angle at each
  vertex, length and its position in its contour;
- Fourier features of the segment's midpoint and ends;
- thickness probes: rays cast inward from the segment into a rasterised glyph,
  so the model knows how wide the ink is and whether the outline continues
  straight on;
- features sampled from a small CNN over a 256 px raster of the whole glyph,
  read at each segment's probe points with `grid_sample`.

The encoder has 8 pre-norm layers, d = 256 and 8 heads. Attention gets an
additive, learned per-head bias indexed by bucketed contour-relative distance,
so a segment can tell its contour neighbours apart from segments that are only
close in space. Two heads sit on top:

1. **Cut head:** for each vertex, the probability that one stroke ends there
   and the next one begins. It is trained with weighted binary cross-entropy,
   since cuts are rare.
2. **Affinity head:** a low-rank pairwise score saying whether two segments
   belong to the same stroke, with a class-balanced loss.

Decoding splits the contours into chains at the predicted cuts and clusters the
chains into strokes by affinity. A validator rasterises each candidate merge and
rejects any join that would cross empty background. Strokes made only of
counters (the enclosed holes of a glyph) are handed to the stroke that owns the
surrounding contour. Each stroke is then closed with bridges: straight lines, or
tangent-continuous cubics in the style of the training data. A cubic that would
bulge out of the glyph gets straightened.

One rule holds throughout: **outline segments are never modified.** The union
of the predicted strokes therefore renders the original glyph, and the tests
and evaluation check that with an IoU measurement.

### Stage B: medians (geometry)

Medians need no learning. For each stroke the pipeline takes a Voronoi skeleton
of the filled shape, keeps the longest path, trims the spurs that a medial axis
grows into square corners, and simplifies the result with Ramer-Douglas-Peucker.
The tolerance was tuned on ground-truth strokes until our point density matched
the hanzi-writer data (about 5.8 points per stroke). On that setting the mean
error against the hand-made medians is about 5 units on the 1024 grid.

### Stage C: order and direction (learned)

A second, smaller transformer (4 layers, d = 256) runs over the strokes. Each
stroke token is a resampled median plus shape statistics. A pairwise feature
tensor (relative position, overlap, whether the medians cross) is projected into
per-head attention biases. The model predicts a flip bit per stroke and a
pairwise *precedence* matrix (does stroke i come before stroke j?).

Turning pairwise probabilities into one sequence is a small ranking problem. We
start from a soft Borda count, then run an insertion local search that maximises
the summed log-probability of every pair being in the right order. Stage C
trains on medians computed from the ground-truth outlines by Stage B itself, so
its training inputs look like what it will see at inference time.

## First results

Both models train in about an hour on a single RTX 2070 Super. The first full
run was scored on 475 held-out CJK characters:

| Metric | Held-out CJK |
|---|---|
| Strokes cut exactly right | 99.2% |
| Characters with every stroke cut exactly right | 94.7% |
| Union of strokes vs. original glyph (IoU, mean / worst) | 0.9993 / 0.991 |
| Stroke direction correct | 99.9% |
| Exact stroke order, end to end | 88.6% |

Order is the weakest part. A single swapped pair marks the whole character as
wrong, and the misses cluster in dense characters such as 襪.

These numbers are for **Kai-style CJK only**, the script and font family the
model learned from. They say little about anything else.

## Multimodal LLMs in the training loop

The data has grown since then, from about 9,500 to roughly 15,000 characters,
and much of the growth came from the model's own output after correction and
human verification. Most of that correction is now done by multimodal LLMs.

The loop:

1. **Predict.** A local review dashboard runs the model over every glyph in a
   font that isn't in the training data yet.
2. **Check.** A script compares each prediction against the font outline. It
   requires IoU ≥ 0.99, medians inside their own strokes and covering them,
   and no part of a stroke that hanzi-writer would leave undrawn.
3. **Orchestrate.** Claude Opus 5.5 reads the dashboard through a browser
   extension, groups the failures and looks for recurring patterns. When a
   defect repeats, it writes a deterministic fix-up script rather than fixing
   glyphs one by one. Several of our maintained tools began this way: filling
   holes back in, transferring a corrected letter across its accented family,
   flattening mismatched bridges, and rerouting medians.
4. **Repair.** The remaining glyphs each go to their own Claude Sonnet 5.5
   subagent. It sees renders of the font glyph and of the prediction, edits
   segment labels, bridges and medians, and has to pass the same checker before
   reporting back. Opus then re-checks every result itself instead of trusting
   the report, which matters: subagents regularly declared success on glyphs
   where a bar or stroke tip was still undrawn.
5. **Review.** A person reviews every result in the dashboard by animating it
   and writing it in hanzi-writer's quiz mode, reorders or merges strokes where
   needed, and saves it into the training set.
6. **Retrain** on the larger dataset.

Stroke-order conventions go to the agents as plain rules. One example: "capital
E is one vertical line, then three horizontal lines from top to bottom." The
same rule is then applied across a whole family of letters. Each correction
round improves the next model, which makes the next round cheaper, so the loop
works like reinforcement learning with LLM and human feedback. It is not RL in
the textbook sense, though: there is no reward model and no policy gradient.
The model is retrained with ordinary supervised learning on the corrected data.
The LLMs are the critic and the editor, and the human reviewer has the final
say.

We have also run the same orchestration prompt through Antigravity with Gemini 4
Hydrogen High. It can fix individual characters, but its output needs a lot more
manual correction, and it rarely turns a repeated problem into a script, so
every glyph costs a fresh attempt.

The most recent run covered the 665 Noto Sans glyphs with outlines that had no
training data yet. As predicted, only 125 passed every check. The fix-up scripts
raised that to 233, and per-glyph agents brought every glyph's strokes in line
with the font outline. Some cases started as low as 0.38 IoU and finished at
0.998 or better. About 400 still have medians that fail a coverage check and
need another pass.

## Known limitations

- **Non-CJK scripts are frequently broken.** Latin, Greek and Cyrillic make up
  a small fraction of the training data, and almost all of it comes from a
  single font per script. The typical failure is the model treating a counter
  (the hole in *o*, *a* or *B*) as a filled stroke of its own, or producing a
  zero-area stroke where a bowl should be.
- **Stroke order in dense CJK characters** is still the main source of
  end-to-end errors.
- **Hand-corrected data loosens the labels.** Corrected strokes sometimes cut
  partway along a font edge, so the quality gates had to be relaxed to accept
  them. We track whether each record is an exact segment partition, and the
  strict round-trip tests run only on those.

## What's next

The fix for the non-CJK errors is more varied data. We plan to generate
training data for the same scripts in **multiple fonts**: the same Latin, Greek
and Cyrillic letters drawn in serif, sans and humanist designs, so the model
learns what an *a* is rather than what one font's *a* looks like. We have
exported glyphs from several such fonts already, but generating and verifying
that data at scale is work we have left for the future.

Until then, CharacterStrokeGenerator is a CJK stroke model that is learning
other scripts, and every one of its outputs gets reviewed before it ships.
