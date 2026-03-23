# Menu Image to Database Pipeline (Current App)

This design fits the current codebase and DB shape while supporting cleaner product variants and prices.

## 1) Target Data Contract

Use the canonical extraction payload defined in [menu-import-schema.json](menu-import-schema.json).

- Input sources: PNG/JPG/PDF/TXT/CSV.
- Output payload: top-level metadata plus `items[]` with:
  - `name`, `description`, `category`, `status`
  - `base_price` as numeric money object
  - optional `variants[]` (`label`, `group`, `price`)
  - `needs_review`, `review_reasons`, `confidence`

## 2) Two-Stage AI Parsing

Stage A (OCR / text extraction):
- Purpose: extract all visible text with section headings and line order.
- Existing fit: `extract_image_text_with_ai()` in [app.py](../app.py).

Stage B (semantic structuring):
- Purpose: convert raw text into strict JSON following schema.
- Existing fit: `parse_menu_txt_with_ai()` in [app.py](../app.py).
- Change in prompt style:
  - Require schema-compliant JSON object (not just plain list)
  - Include `variants[]` and `confidence`
  - Mark uncertain items with `needs_review=true`

Why this split helps:
- OCR errors and business interpretation are separated.
- Better retry strategy: rerun Stage B without re-running OCR.

## 3) Validation + Normalization Layer

Before writing to DB, apply deterministic checks:

1. Structural validation
- Validate JSON against [menu-import-schema.json](menu-import-schema.json).
- Reject malformed payloads early.

2. Field normalization
- `name`: trim, collapse spaces, title-safe display.
- `category`: map to known categories, fallback to `infer_menu_category()`.
- `status`: only `Live`/`Draft`/`Hidden`.

3. Price normalization
- Convert `base_price.amount` to canonical decimal string for current `menu_items.price`.
- For `variants[]`, ensure minimum variant price equals `base_price.amount`.

4. Duplicate handling
- Dedupe by normalized key (same logic as `_normalize_menu_key()` in [app.py](../app.py)).
- Merge same-name entries, union variant labels, keep highest confidence row.

5. Review queue rules (minimal manual correction)
- Auto-flag when:
  - missing price
  - conflicting variant prices
  - low confidence (< 0.75 overall)
  - duplicate conflicts
- Save flagged rows as `Draft` and include review reasons.

## 4) DB Mapping Strategy for Current App

Your current storage shape is compatible with this mapping:

- Table: `menu_items` (already exists)
  - `name` <= payload item name
  - `description` <= cleaned description + compact options block
  - `price` <= base price string
  - `category` <= normalized category
  - `status` <= `Live` or `Draft`

Variant compatibility encoding (works with your existing UI/parser):
- If variants exist, encode into description suffix exactly:
  - `Options: Small=120, Large=145`
- Keep `price` as the minimum variant price.

This matches current logic in [app.py](../app.py):
- `_build_variant_options_from_form()`
- `_merge_small_medium_large_variants()`

## 5) Optional DB Upgrade (Recommended)

For cleaner long-term storage, add normalized variant tables while keeping backward compatibility.

### SQL Sketch

```sql
CREATE TABLE IF NOT EXISTS public.menu_item_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  variant_group TEXT,
  price NUMERIC(12,2) NOT NULL,
  currency TEXT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS menu_item_variants_item_idx
  ON public.menu_item_variants(menu_item_id);

CREATE UNIQUE INDEX IF NOT EXISTS menu_item_variants_unique_label
  ON public.menu_item_variants(menu_item_id, lower(label));
```

Compatibility rule:
- Continue writing `menu_items.description` options text for chatbot compatibility.
- If variant table exists, write both:
  - normalized variant rows
  - legacy options description text

## 6) Suggested Prompt Contract for Stage B

Use this contract in parsing prompt:

- Return JSON object with this shape:
  - `schema_version`, `restaurant_id`, `source`, `items`, `warnings`
- For each item:
  - Include `base_price.amount` as number if available.
  - Put alternate sizes/quantities in `variants[]`.
  - Set `needs_review=true` when uncertain.
- Never invent prices. Use review flags instead.

## 7) Recommended Import Flow in /menu/upload

1. Extract text from file.
2. Parse into schema payload (AI + fallback parser).
3. Validate payload against schema.
4. Normalize and dedupe.
5. Split:
- Auto-approved items: save immediately.
- Review items: save as Draft (or separate review table later).
6. Return import summary:
- total detected
- saved
- flagged for review
- duplicates merged

## 8) Minimal Integration Points in Current Code

Primary integration points in [app.py](../app.py):

- [extract_image_text_with_ai](../app.py#L789)
- [parse_menu_txt_with_ai](../app.py#L711)
- [menu_upload_menu_file](../app.py#L1619)

Additions to keep change small:
- New validator/normalizer helper functions near existing parser helpers.
- Keep current `menu_items` payload shape for templates and chatbot routes.

## 9) Rollout Plan

1. Phase 1 (safe): use schema + validation + review flags, still store variants in description.
2. Phase 2 (clean): add `menu_item_variants` table and dual-write.
3. Phase 3 (optional): update UI to edit true variant rows directly.

This gives immediate accuracy gains with low risk and minimal manual correction.
