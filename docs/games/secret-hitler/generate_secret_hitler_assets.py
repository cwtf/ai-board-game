"""
Secret Hitler asset generator.

Reads asset-prompts.md, generates each listed image via fal.ai's image API,
and writes them to public/assets/secret-hitler/.

- Resumable: skips image files that already exist.
- Saves the exact prompt sent for each image beside it as .prompt.txt.
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
# FAL_KEY environment variable instead (recommended - keeps the key out of
# source control).
FAL_API_KEY = ""

# Path to the markdown file with the prompts.
PROMPTS_FILE = SCRIPT_DIR / "asset-prompts.md"

# Where images get written. Subfolders are created automatically.
OUTPUT_ROOT = REPO_ROOT / "public" / "assets" / "secret-hitler"

# fal.ai model endpoint.
FAL_ENDPOINT = "openai/gpt-image-2"

# GPT Image 2 generation options.
QUALITY = "high"  # "auto" | "low" | "medium" | "high"
OUTPUT_FORMAT = "png"
SYNC_MODE = False

# Include the optional card back prompt from asset-prompts.md.
GENERATE_OPTIONAL_BACKS = True

# Image sizes. fal accepts named sizes or {"width": int, "height": int}.
CARD_SIZE: dict[str, int] | str = {"width": 1024, "height": 1536}  # 2:3
BOARD_SIZE: dict[str, int] | str = {"width": 1792, "height": 1024}  # wide
TOKEN_SIZE: dict[str, int] | str = {"width": 1024, "height": 1024}  # square

# Concurrency and retries.
MAX_WORKERS = 4
MAX_RETRIES = 5
RETRY_BACKOFF = 4  # seconds; doubles each retry
DOWNLOAD_TIMEOUT = 120


# ============================================================================
# Implementation
# ============================================================================

ASSET_HEADING_PATTERN = re.compile(r"^### `([^`]+\.png)`\s*$")


def read_prompts_file(md_path: Path) -> str:
    if not md_path.exists():
        raise FileNotFoundError(f"Prompts file not found: {md_path.resolve()}")
    return md_path.read_text(encoding="utf-8")


def extract_global_style(markdown: str) -> str:
    marker = "## Global Style Direction"
    start = markdown.find(marker)
    if start == -1:
        return ""

    section = markdown[start:]
    match = re.search(r"```text\s*(.*?)\s*```", section, re.DOTALL)
    return match.group(1).strip() if match else ""


def parse_asset_prompts(markdown: str) -> list[tuple[str, str]]:
    """Extract (relative_path, prompt) pairs from asset headings/code blocks."""
    lines = markdown.splitlines()
    entries: list[tuple[str, str]] = []
    current_path: str | None = None
    collecting = False
    block_lines: list[str] = []

    for line in lines:
        heading = ASSET_HEADING_PATTERN.match(line)
        if heading:
            current_path = heading.group(1)
            collecting = False
            block_lines = []
            continue

        if current_path is None:
            continue

        stripped = line.strip()
        if stripped == "```text" and not collecting:
            collecting = True
            block_lines = []
            continue

        if stripped == "```" and collecting:
            prompt = "\n".join(block_lines).strip()
            if prompt and (
                GENERATE_OPTIONAL_BACKS or not current_path.startswith("backs/")
            ):
                entries.append((current_path, prompt))
            current_path = None
            collecting = False
            block_lines = []
            continue

        if collecting:
            block_lines.append(line)

    return entries


def safe_asset_label(rel_path: str) -> str:
    labels = {
        "ballots/ja.png": "approval ballot card",
        "ballots/nein.png": "rejection ballot card",
        "roles/liberal-panda.png": "liberal panda secret role portrait card",
        "roles/liberal-cat.png": "liberal cat secret role portrait card",
        "roles/liberal-dog.png": "liberal dog secret role portrait card",
        "roles/liberal-parrot.png": "liberal parrot secret role portrait card",
        "roles/liberal-chicken.png": "liberal chicken secret role portrait card",
        "roles/liberal-racoon.png": "liberal racoon secret role portrait card",
        "roles/liberal-rat.png": "liberal rat secret role portrait card",
        "roles/fascist-snake.png": "fascist snake secret role portrait card",
        "roles/fascist-lizard.png": "fascist lizard secret role portrait card",
        "roles/hitler-velociraptor.png": "velociraptor hidden leader secret role portrait card",
        "party/liberal.png": "blue civic party membership card",
        "party/fascist.png": "red serpent party membership card",
        "policies/liberal.png": "blue civic policy card",
        "policies/fascist.png": "red serpent policy card",
        "boards/liberal-board.png": "blue civic policy board",
        "boards/fascist-board.png": "red serpent policy board",
        "tokens/election-tracker.png": "election tracker token",
        "backs/dossier-back.png": "dossier card back",
    }
    return labels.get(rel_path, "board-game UI asset")


def build_prompt(global_style: str, rel_path: str, asset_prompt: str) -> str:
    parts = []
    if global_style:
        parts.append(global_style)
    parts.append(f"Asset type: {safe_asset_label(rel_path)}.")
    parts.append(asset_prompt)
    parts.append(
        "Generate one finished image asset only. Keep the composition clean and "
        "usable in a board-game UI."
    )
    return "\n\n".join(parts)


def get_size(rel_path: str) -> dict[str, int] | str:
    if rel_path.startswith("boards/"):
        return BOARD_SIZE
    if rel_path.startswith("tokens/"):
        return TOKEN_SIZE
    return CARD_SIZE


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
        headers={"User-Agent": "secret-hitler-asset-generator/1.0"},
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


def generate_one(
    fal_client: Any,
    global_style: str,
    rel_path: str,
    asset_prompt: str,
) -> tuple[str, str]:
    """Generate a single image. Returns (rel_path, status_string)."""
    out_path = OUTPUT_ROOT / rel_path
    prompt_path = out_path.with_suffix(".prompt.txt")

    if out_path.exists():
        return rel_path, "skipped (already exists)"

    out_path.parent.mkdir(parents=True, exist_ok=True)
    prompt = build_prompt(global_style, rel_path, asset_prompt)
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

        except Exception as error:  # noqa: BLE001 - retry fal/download failures
            last_err = error
            if not should_retry(error):
                return rel_path, f"failed: {error}"
            if attempt == MAX_RETRIES - 1:
                break
            wait = RETRY_BACKOFF * (2**attempt)
            print(f"  [{rel_path}] error ({type(error).__name__}), sleeping {wait}s")
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

    markdown = read_prompts_file(PROMPTS_FILE)
    global_style = extract_global_style(markdown)
    entries = parse_asset_prompts(markdown)
    if not entries:
        print(f"No asset prompts found in {PROMPTS_FILE}. Check the file format.")
        return 1

    print(f"Found {len(entries)} Secret Hitler asset prompts")
    print(f"Endpoint={FAL_ENDPOINT} format={OUTPUT_FORMAT} workers={MAX_WORKERS}")
    print(f"Output: {OUTPUT_ROOT.resolve()}\n")

    counts = {"ok": 0, "skipped": 0, "failed": 0}

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {
            pool.submit(generate_one, fal_client, global_style, rel_path, prompt): rel_path
            for rel_path, prompt in entries
        }
        for index, future in enumerate(as_completed(futures), 1):
            rel_path = futures[future]
            _, status = future.result()
            if status == "ok":
                counts["ok"] += 1
            elif status.startswith("skipped"):
                counts["skipped"] += 1
            else:
                counts["failed"] += 1
            print(f"[{index:3d}/{len(entries)}] {rel_path}: {status}")

    print("\nSummary:")
    for key, value in counts.items():
        print(f"  {key}: {value}")
    return 0 if counts["failed"] == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
