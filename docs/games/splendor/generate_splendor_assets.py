"""
Splendor asset generator.

Reads asset-prompts.md, generates an image for each row in the cards and nobles
tables via OpenAI's image API, and writes them to public/assets/splendor/.

- Resumable: skips files that already exist.
- Saves the exact prompt sent for each image alongside it (.prompt.txt) so you
  can re-roll a specific card later without losing the recipe.
- Concurrent: runs MAX_WORKERS calls in parallel with exponential-backoff retry.
"""

import os
import re
import sys
import time
import base64
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

from openai import OpenAI
from openai import RateLimitError, APIError, APIConnectionError, APITimeoutError


# ============================================================================
# CONFIG  <-- EDIT THIS SECTION
# ============================================================================

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parents[2]

# Paste your API key here. Alternatively leave it empty ("") and set the
# OPENAI_API_KEY environment variable instead (recommended — keeps the key
# out of source control).
OPENAI_API_KEY = ""

# Path to the markdown file with the prompt tables.
PROMPTS_FILE = SCRIPT_DIR / "asset-prompts.md"

# Where images get written. cards/ and nobles/ subfolders are created automatically.
OUTPUT_ROOT = REPO_ROOT / "public" / "assets" / "splendor"

# Model. As of 2026 the OpenAI image models are:
#   "gpt-image-1"         — stable, well-documented
#   "gpt-image-1.5"       — current flagship (better prompt adherence)
#   "chatgpt-image-latest" — alias that tracks whatever ChatGPT itself uses
#   "gpt-image-1-mini"    — ~10x cheaper, use for prompt iteration
MODEL = "gpt-image-1.5"

# Sizes. OpenAI's image API only supports these three:
#   "1024x1024" (square), "1024x1536" (portrait 2:3), "1536x1024" (landscape 3:2)
CARD_SIZE = "1024x1536"   # portrait — closest to your 5:7 spec
NOBLE_SIZE = "1024x1024"  # square — closest to "square-ish" nobles

# Quality: "low" | "medium" | "high" | "auto"
QUALITY = "medium"

# Concurrency and retries
MAX_WORKERS = 4
MAX_RETRIES = 5
RETRY_BACKOFF = 4  # seconds; doubles each retry

# ============================================================================
# Base prompts (copied from your markdown so the script is self-contained)
# ============================================================================

CARD_BASE = (
    "Original modern trading-card illustration for a board game about "
    "merchants, commodities, and prestige. Vertical 5:7 card art, modern "
    "trading and merchant theme, cinematic editorial illustration, premium "
    "board-game asset, crisp details, realistic materials, rich but restrained "
    "color, no fantasy crowns, no medieval costumes, no official Splendor "
    "references, no logos, no readable text, no numerals, no watermark. Use "
    "the subject line exactly as art direction, not as visible text."
)

NOBLE_BASE = (
    "Original square-ish 5:4 portrait tile for a modern board game about "
    "merchants, finance, and prestige. Contemporary trade patron, investor, "
    "diplomat, or market-maker, cinematic editorial illustration, premium "
    "board-game asset, crisp face and clothing detail, tasteful wealth, no "
    "monarchy costume, no official Splendor references, no logos, no readable "
    "text, no numerals, no watermark. Use the subject line exactly as art "
    "direction, not as visible text."
)


# ============================================================================
# Implementation
# ============================================================================

# Matches markdown table rows like:  | `cards/t1_01.png` | Subject: ... |
ROW_PATTERN = re.compile(r"\|\s*`([^`]+\.png)`\s*\|\s*(.+?)\s*\|")


def parse_prompts(md_path: Path) -> list[tuple[str, str]]:
    """Extract (relative_path, subject_line) pairs from the markdown tables."""
    if not md_path.exists():
        raise FileNotFoundError(f"Prompts file not found: {md_path.resolve()}")
    text = md_path.read_text(encoding="utf-8")
    entries = []
    for match in ROW_PATTERN.finditer(text):
        rel_path, subject = match.group(1), match.group(2)
        # Only keep rows whose path starts with one of our two folders;
        # ignore any other tables that might appear in the markdown later.
        if rel_path.startswith(("cards/", "nobles/")):
            entries.append((rel_path, subject))
    return entries


def build_prompt(rel_path: str, subject: str) -> str:
    base = CARD_BASE if rel_path.startswith("cards/") else NOBLE_BASE
    return f"{base} {subject}"


def get_size(rel_path: str) -> str:
    return CARD_SIZE if rel_path.startswith("cards/") else NOBLE_SIZE


def generate_one(client: OpenAI, rel_path: str, subject: str) -> tuple[str, str]:
    """Generate a single image. Returns (rel_path, status_string)."""
    out_path = OUTPUT_ROOT / rel_path
    prompt_path = out_path.with_suffix(".prompt.txt")

    if out_path.exists():
        return rel_path, "skipped (already exists)"

    out_path.parent.mkdir(parents=True, exist_ok=True)
    prompt = build_prompt(rel_path, subject)
    size = get_size(rel_path)

    last_err: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            response = client.images.generate(
                model=MODEL,
                prompt=prompt,
                size=size,
                quality=QUALITY,
                n=1,
            )
            img_b64 = response.data[0].b64_json
            if not img_b64:
                return rel_path, "failed: empty response"
            out_path.write_bytes(base64.b64decode(img_b64))
            prompt_path.write_text(prompt, encoding="utf-8")
            return rel_path, "ok"

        except (RateLimitError, APIConnectionError, APITimeoutError) as e:
            last_err = e
            wait = RETRY_BACKOFF * (2 ** attempt)
            print(f"  [{rel_path}] transient ({type(e).__name__}), sleeping {wait}s")
            time.sleep(wait)

        except APIError as e:
            last_err = e
            # 5xx is worth retrying; 4xx usually isn't
            status = getattr(e, "status_code", None)
            if status and 400 <= status < 500:
                return rel_path, f"failed: {e}"
            wait = RETRY_BACKOFF * (2 ** attempt)
            print(f"  [{rel_path}] api error {status}, sleeping {wait}s")
            time.sleep(wait)

        except Exception as e:  # noqa: BLE001 — final safety net
            return rel_path, f"failed: {type(e).__name__}: {e}"

    return rel_path, f"failed after {MAX_RETRIES} retries: {last_err}"


def main() -> int:
    api_key = OPENAI_API_KEY.strip() or os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        print("ERROR: no API key. Set OPENAI_API_KEY at top of script or as env var.")
        return 1

    client = OpenAI(api_key=api_key)

    entries = parse_prompts(PROMPTS_FILE)
    if not entries:
        print(f"No prompt rows found in {PROMPTS_FILE}. Check the file format.")
        return 1

    cards = sum(1 for p, _ in entries if p.startswith("cards/"))
    nobles = sum(1 for p, _ in entries if p.startswith("nobles/"))
    print(f"Found {len(entries)} prompts: {cards} cards, {nobles} nobles")
    print(f"Model={MODEL} quality={QUALITY} workers={MAX_WORKERS}")
    print(f"Output: {OUTPUT_ROOT.resolve()}\n")

    counts = {"ok": 0, "skipped": 0, "failed": 0}

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {
            pool.submit(generate_one, client, rel_path, subject): rel_path
            for rel_path, subject in entries
        }
        for i, future in enumerate(as_completed(futures), 1):
            rel_path = futures[future]
            _, status = future.result()
            if status == "ok":
                counts["ok"] += 1
            elif status.startswith("skipped"):
                counts["skipped"] += 1
            else:
                counts["failed"] += 1
            print(f"[{i:3d}/{len(entries)}] {rel_path}: {status}")

    print("\nSummary:")
    for k, v in counts.items():
        print(f"  {k}: {v}")
    return 0 if counts["failed"] == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
