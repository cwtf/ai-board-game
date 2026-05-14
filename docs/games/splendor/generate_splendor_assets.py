"""
Splendor asset generator.

Reads asset-prompts.md, generates an image for each row in the cards and nobles
tables via fal.ai's image API, and writes them to public/assets/splendor/.

- Resumable: skips files that already exist.
- Saves the exact prompt sent for each image alongside it (.prompt.txt) so you
  can re-roll a specific card later without losing the recipe.
- Concurrent: runs MAX_WORKERS calls in parallel with exponential-backoff retry.

Requires:
  pip install fal-client
  set FAL_KEY=your-api-key
"""

import base64
import os
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any


# ============================================================================
# CONFIG  <-- EDIT THIS SECTION
# ============================================================================

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parents[2]

# Paste your API key here. Alternatively leave it empty ("") and set the
# FAL_KEY environment variable instead (recommended - keeps the key
# out of source control).
FAL_API_KEY = ""

# Path to the markdown file with the prompt tables.
PROMPTS_FILE = SCRIPT_DIR / "asset-prompts.md"

# Where images get written. cards/ and nobles/ subfolders are created automatically.
OUTPUT_ROOT = REPO_ROOT / "public" / "assets" / "splendor"

# fal.ai model endpoint. openai/gpt-image-2 is OpenAI's newest GPT Image model
# available through fal.ai.
FAL_ENDPOINT = "openai/gpt-image-2"

# Image sizes. fal accepts named sizes or {"width": int, "height": int}.
CARD_SIZE: dict[str, int] | str = {"width": 1024, "height": 1440}   # near 5:7
NOBLE_SIZE: dict[str, int] | str = {"width": 1280, "height": 1024}  # 5:4

# GPT Image 2 generation options.
QUALITY = "high"  # "auto" | "low" | "medium" | "high"
OUTPUT_FORMAT = "png"
SYNC_MODE = False

# Concurrency and retries
MAX_WORKERS = 4
MAX_RETRIES = 5
RETRY_BACKOFF = 4  # seconds; doubles each retry
DOWNLOAD_TIMEOUT = 120

# ============================================================================
# Base prompts (copied from your markdown so the script is self-contained)
# ============================================================================

CARD_BASE = (
    "Original full-bleed vertical 5:7 illustration for a board game about "
    "merchants, commodities, and prestige. The scene must fill the entire "
    "canvas edge to edge like a cropped editorial image, with no decorative "
    "border, no frame, no card template, no inset mat, no rounded corners, no "
    "badge, and no UI overlay. Modern trading and merchant theme, cinematic "
    "editorial illustration, premium board-game asset, crisp details, "
    "realistic materials, rich but restrained color, no fantasy crowns, no "
    "medieval costumes, no official Splendor references, no logos, no readable "
    "text, no numerals, no watermark. Use the subject line exactly as art "
    "direction, not as visible text."
)

NOBLE_BASE = (
    "Original full-bleed 5:4 portrait illustration for a modern board game "
    "about merchants, finance, and prestige. The portrait scene must fill the "
    "entire canvas edge to edge like a cropped editorial image, with no "
    "decorative border, no frame, no tile template, no inset mat, no rounded "
    "corners, no badge, and no UI overlay. Contemporary trade patron, "
    "investor, diplomat, or market-maker, cinematic editorial illustration, "
    "premium board-game asset, crisp face and clothing detail, tasteful "
    "wealth, no monarchy costume, no official Splendor references, no logos, "
    "no readable text, no numerals, no watermark. Use the subject line exactly "
    "as art direction, not as visible text."
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


def get_size(rel_path: str) -> dict[str, int] | str:
    return CARD_SIZE if rel_path.startswith("cards/") else NOBLE_SIZE


def build_arguments(rel_path: str, prompt: str) -> dict[str, Any]:
    return {
        "prompt": prompt,
        "image_size": get_size(rel_path),
        "num_images": 1,
        "quality": QUALITY,
        "output_format": OUTPUT_FORMAT,
        "sync_mode": SYNC_MODE,
    }


def image_bytes_from_result(result: dict[str, Any]) -> bytes:
    images = result.get("images")
    if not images:
        raise ValueError("fal response did not include images")

    image_url = images[0].get("url")
    if not image_url:
        raise ValueError("fal image did not include a URL")

    if image_url.startswith("data:"):
        _, encoded = image_url.split(",", 1)
        return base64.b64decode(encoded)

    request = urllib.request.Request(
        image_url,
        headers={"User-Agent": "splendor-asset-generator/1.0"},
    )
    with urllib.request.urlopen(request, timeout=DOWNLOAD_TIMEOUT) as response:
        return response.read()


def status_code_from_error(error: Exception) -> int | None:
    status = getattr(error, "status_code", None)
    if isinstance(status, int):
        return status

    response = getattr(error, "response", None)
    response_status = getattr(response, "status_code", None)
    return response_status if isinstance(response_status, int) else None


def should_retry(error: Exception) -> bool:
    status = status_code_from_error(error)
    if status is None:
        return True
    return status == 429 or status >= 500


def generate_one(fal_client: Any, rel_path: str, subject: str) -> tuple[str, str]:
    """Generate a single image. Returns (rel_path, status_string)."""
    out_path = OUTPUT_ROOT / rel_path
    prompt_path = out_path.with_suffix(".prompt.txt")

    if out_path.exists():
        return rel_path, "skipped (already exists)"

    out_path.parent.mkdir(parents=True, exist_ok=True)
    prompt = build_prompt(rel_path, subject)
    arguments = build_arguments(rel_path, prompt)

    last_err: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            result = fal_client.subscribe(
                FAL_ENDPOINT,
                arguments=arguments,
            )
            out_path.write_bytes(image_bytes_from_result(result))
            prompt_path.write_text(prompt, encoding="utf-8")
            return rel_path, "ok"

        except Exception as e:  # noqa: BLE001 - retry fal queue/download failures
            last_err = e
            if not should_retry(e):
                return rel_path, f"failed: {e}"
            if attempt == MAX_RETRIES - 1:
                break
            wait = RETRY_BACKOFF * (2 ** attempt)
            print(f"  [{rel_path}] error ({type(e).__name__}), sleeping {wait}s")
            time.sleep(wait)

    return rel_path, f"failed after {MAX_RETRIES} retries: {last_err}"


def main() -> int:
    api_key = (
        FAL_API_KEY.strip()
        or os.environ.get("FAL_KEY", "").strip()
        or os.environ.get("FAL_API_KEY", "").strip()
    )
    if not api_key:
        print("ERROR: no API key. Set FAL_KEY as an env var or FAL_API_KEY in the script.")
        return 1

    os.environ["FAL_KEY"] = api_key
    try:
        import fal_client
    except ImportError:
        print("ERROR: fal-client is not installed. Run: pip install fal-client")
        return 1

    entries = parse_prompts(PROMPTS_FILE)
    if not entries:
        print(f"No prompt rows found in {PROMPTS_FILE}. Check the file format.")
        return 1

    cards = sum(1 for p, _ in entries if p.startswith("cards/"))
    nobles = sum(1 for p, _ in entries if p.startswith("nobles/"))
    print(f"Found {len(entries)} prompts: {cards} cards, {nobles} nobles")
    print(f"Endpoint={FAL_ENDPOINT} format={OUTPUT_FORMAT} workers={MAX_WORKERS}")
    print(f"Output: {OUTPUT_ROOT.resolve()}\n")

    counts = {"ok": 0, "skipped": 0, "failed": 0}

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {
            pool.submit(generate_one, fal_client, rel_path, subject): rel_path
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
